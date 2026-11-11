# BMT v0.4 worker — long-lived CorridorKey 2.0 inference sidecar.
#
# Speaks the SAME wire contract as the C++ HostPluginRuntimeServer so the
# existing OFX plugin/client can talk to it with minimal changes:
#   * localhost TCP, newline-delimited JSON envelopes (protocol_version=1)
#   * frame payloads via SharedFrameTransport files: 72-byte little-endian
#     header (magic CKFX=0x434B4658, version, w, h, channels, 5 u64 offsets),
#     then float32 planes: interleaved RGB, hint (1ch), alpha (1ch), fg (3ch).
#   * commands: Health, PrepareSession, RenderFrame, ReleaseSession, Shutdown
#     plus v0.4-only BmtProcessClip (batch export path, added after the
#     interactive path is proven).
#
# RenderFrame contract for v0.4 preview sessions:
#   the plugin appends frames with RenderFrame {session_id, shared_frame_path,
#   frame_index, is_last}; the worker buffers them; when is_last is true it
#   runs the full Hann-window pipeline over the buffered clip, then answers
#   each queued RenderFrame with alpha+fg written back into that frame's own
#   shm file. The plugin reads them from the same shm file.
#
# Plane colour space: RGB plane = display-referred (sRGB-encoded) floats in
# [0,1]; the worker converts to linear via the official color_utils, matching
# the video-frame preprocessing path exactly. Alpha out = [0,1] display space
# (sRGB-encoded single channel, matching the alpha.mp4 the CLI produces).
import argparse
import json
import math
import os
import socket
import struct
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

import numpy as np

# Windows/WDDM fragmentation bites long-lived CUDA processes; expandable
# segments let the allocator grow regions instead of failing on 20 MiB.
os.environ.setdefault("PYTORCH_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

# EXR read/write must be enabled before OpenCV registers its codecs.
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")

PROTOCOL_VERSION = 1
MAGIC = 0x434B4658  # 'CKFX'
HEADER_FMT = "<8I5Q"
HEADER_SIZE = struct.calcsize(HEADER_FMT)  # 72
assert HEADER_SIZE == 72, HEADER_SIZE

_OFFICIAL_DIR = Path(__file__).resolve().parent
# v0.4: weights/ + vfms/ root. CORRIDORKEY_CK_ROOT wins; otherwise fall back
# to the installed production root (%LOCALAPPDATA%\CorridorKey2.0-BMT\worker)
# when it carries a weights/ dir, else the script dir (dev clone layout).
if ck_root := os.environ.get("CORRIDORKEY_CK_ROOT"):
    _OFFICIAL_DIR = Path(ck_root).resolve()
else:
    _local = Path(os.environ.get("LOCALAPPDATA", ".")).resolve() / "CorridorKey2.0-BMT" / "worker"
    if (_local / "weights").is_dir():
        _OFFICIAL_DIR = _local
sys.path.insert(0, str(_OFFICIAL_DIR))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


class ShmFrame:
    """Python twin of SharedFrameTransport (file-backed mmap)."""

    def __init__(self, path: str, create: bool = False, width: int = 0, height: int = 0):
        import mmap as mmap_mod
        self.mmap_mod = mmap_mod
        self.path = Path(path)
        if create:
            channels = (3, 1, 1, 3)
            n = lambda c: width * height * c  # noqa: E731
            rgb_off = HEADER_SIZE
            hint_off = rgb_off + n(3) * 4
            alpha_off = hint_off + n(1) * 4
            fg_off = alpha_off + n(1) * 4
            total = fg_off + n(3) * 4
            header = struct.pack(
                HEADER_FMT, MAGIC, 1, width, height, *channels,
                rgb_off, hint_off, alpha_off, fg_off, total)
            with open(self.path, "wb") as f:
                f.truncate(total)
            self._open(total)
            self.mm[0:HEADER_SIZE] = header
            self.width, self.height = width, height
            self.offsets = (rgb_off, hint_off, alpha_off, fg_off)
        else:
            self._open(0)
            header = bytes(self.mm[0:HEADER_SIZE])
            (magic, version, w, h, _rc, _hc, _ac, _fc,
             rgb_off, hint_off, alpha_off, fg_off, total) = struct.unpack(HEADER_FMT, header)
            if magic != MAGIC:
                raise ValueError(f"bad shm magic {magic:#x} in {path}")
            self.width, self.height = w, h
            self.offsets = (rgb_off, hint_off, alpha_off, fg_off)

    def _open(self, size: int):
        self.f = open(self.path, "r+b")
        if size == 0:
            size = os.fstat(self.f.fileno()).st_size
        self.mm = self.mmap_mod.mmap(self.f.fileno(), size)

    def read_rgb(self) -> np.ndarray:
        w, h = self.width, self.height
        off = self.offsets[0]
        arr = np.frombuffer(self.mm[off:off + w * h * 3 * 4], dtype=np.float32)
        return arr.reshape(h, w, 3).copy()

    def write_alpha_fg(self, alpha: np.ndarray, fg: np.ndarray) -> None:
        w, h = self.width, self.height
        a_off, f_off = self.offsets[2], self.offsets[3]
        self.mm[a_off:a_off + w * h * 4] = np.ascontiguousarray(
            alpha.reshape(h, w), dtype=np.float32).tobytes()
        self.mm[f_off:f_off + w * h * 3 * 4] = np.ascontiguousarray(
            fg.reshape(h, w, 3), dtype=np.float32).tobytes()

    def close(self):
        try:
            self.mm.close()
            self.f.close()
        except Exception:
            pass


class Worker:
    def __init__(self, args):
        self.args = args
        self.model = None
        self.sessions = {}          # session_id -> {"frames": [(shm_path, w, h)], "result": None}
        self.model_lock = threading.Lock()

    # ---------------------------------------------------------------- model
    def ensure_model(self):
        with self.model_lock:
            if self.model is not None:
                return
            import torch
            from corridorkey.runtime import RuntimePaths, load_model
            paths = RuntimePaths.from_package(str(_OFFICIAL_DIR))
            paths.validate()
            t0 = time.time()
            self.model = load_model(paths, device="cuda")
            print(f"[bmt-worker] model loaded in {time.time() - t0:.1f}s "
                  f"({torch.cuda.memory_allocated() / 2**30:.2f} GiB)", flush=True)

    # ------------------------------------------------------------- inference
    def process_clip(self, session: dict, settings: dict) -> float:
        """Run the stock official 2.0 pipeline over the session's frames.

        Frames are staged as scene-linear float EXRs in a temp frame-dir,
        then handed to corridorkey.runtime.run_inference verbatim — auto-VRAM,
        low-VRAM staging, RVM prepass, Hann windows, hints and stage2 all run
        in official code so plugin output matches infer.py bit-for-bit.
        Alpha/fg are read back from the EXR outputs into each frame's
        shared-memory planes.
        """
        import shutil
        import cv2
        from corridorkey import color_utils as cu
        from corridorkey import video_io as vio
        from corridorkey import runtime as rt
        from corridorkey.runtime import InferenceConfig
        import torch

        self.ensure_model()
        frames = session["frames"]
        t0 = time.time()
        frame_dir = Path(tempfile.mkdtemp(prefix="bmt_ck_frames_"))
        out_dir = Path(tempfile.mkdtemp(prefix="bmt_ck_out_"))
        work_dir = None
        try:
            for i, (shm_path, _w, _h) in enumerate(frames):
                shm = ShmFrame(shm_path)
                rgb_display = shm.read_rgb()  # HWC float, display [0,1]
                shm.close()
                linear = cu.srgb_to_linear(np.clip(rgb_display, 0.0, 1.0))
                cv2.imwrite(str(frame_dir / f"frame_{i:06d}.exr"),
                            np.ascontiguousarray(linear[:, :, ::-1]))

            cfg = InferenceConfig()
            # v0.4: ck2_settings mapping to InferenceConfig
            # fps from host frame rate
            cfg.frame_dir_fps = float(settings.get("fps", 24.0))
            cfg.frame_dir_linear = True
            # model_scale: 1.0 / 0.75 / 0.5
            cfg.model_scale = float(settings.get("model_scale", 1.0))
            # hint_quality: 0.95 / 0.75 / 0.5
            cfg.hint_quality = float(settings.get("hint_quality", 0.95))
            # carry_hint: boolean default on
            cfg.carry_hint = bool(settings.get("carry_hint", True))
            # carry_hint_quality follows hint_quality if not explicitly set
            cfg.carry_hint_quality = float(settings.get("carry_hint_quality", cfg.hint_quality))
            # despill_strength: 0-1 default 0.5
            cfg.despill_strength = float(settings.get("despill_strength", 0.5))
            # auto_vram: boolean default on. Mirror official CLI: auto_vram applies
            # ONLY when no explicit chunk/stride/low_vram was given.
            explicit_chunk = "hann_chunk" in settings
            explicit_stride = "hann_stride" in settings
            explicit_low_vram = "low_vram" in settings
            cfg.auto_vram = bool(settings.get("auto_vram", True))
            if not cfg.auto_vram or explicit_chunk or explicit_stride or explicit_low_vram:
                cfg.auto_vram = False
                cfg.hann_chunk = int(settings.get("hann_chunk", 80))
                cfg.hann_stride = int(settings.get("hann_stride", 40))
                cfg.low_vram = bool(settings.get("low_vram", False))
            # seed: int default -1 (random)
            if settings.get("seed") is not None:
                cfg.seed = int(settings["seed"])
            # output_fg: boolean default on; when false set cfg.outputs={'alpha'}
            output_fg = bool(settings.get("output_fg", True))
            cfg.outputs = {"alpha", "fg"} if output_fg else {"alpha"}
            cfg.output_format = "exr"
            cfg.exr_dtype = "float"
            work_dir = Path(tempfile.mkdtemp(prefix="bmt_ck_temp_"))
            cfg.temp_dir = work_dir  # single creation point

            # v0.4 seam: OFX sends hint_mode/hint_path inside ck2_settings
            # (0=none, 1=first-frame hint image, 2=full hint video).
            hint_mode = int(settings.get("hint_mode", 0))
            hint_src = settings.get("hint_path") or session.get("hint_path")
            hint_path = None
            hint_video = session.get("hint_video_path")
            if hint_mode == 1 and hint_src:
                hint_img = cv2.imread(hint_src, cv2.IMREAD_UNCHANGED)
                if hint_img is not None:
                    if hint_img.ndim == 3 and hint_img.shape[2] == 4:
                        a = hint_img[..., 3]
                    elif hint_img.ndim == 3:
                        a = cv2.cvtColor(hint_img[:, :, :3], cv2.COLOR_BGR2GRAY)
                    else:
                        a = hint_img
                    if a.dtype == np.uint8:
                        a = a.astype(np.float32) / 255.0
                    hint_path = str(out_dir / "hint.exr")
                    cv2.imwrite(hint_path, np.ascontiguousarray(
                        a.astype(np.float32)))
            elif hint_mode == 2 and hint_src:
                hint_video = hint_src

            print(f"[bmt-worker] clip {len(frames)}f via official "
                  f"run_inference (auto_vram={cfg.auto_vram})", flush=True)
            rt.run_inference(
                self.model, str(frame_dir), str(out_dir), cfg,
                vio.WriterConfig(), initial_hint_path=hint_path,
                hint_video_path=hint_video)

            clip_name = frame_dir.name
            alpha_paths = sorted((out_dir / f"{clip_name}_alpha_exr").glob("*.exr"))
            fg_dir = out_dir / f"{clip_name}_fg_exr"
            fg_paths = sorted(fg_dir.glob("*.exr")) if fg_dir.exists() else []
            if len(alpha_paths) != len(frames):
                raise RuntimeError(
                    f"official pipeline produced {len(alpha_paths)} alpha "
                    f"frames for {len(frames)} inputs")
            shape_hw = None
            for i, (shm_path, _w, _h) in enumerate(frames):
                a = cv2.imread(str(alpha_paths[i]),
                               cv2.IMREAD_UNCHANGED | cv2.IMREAD_ANYDEPTH)
                if a is None:
                    raise RuntimeError(f"unreadable alpha EXR {alpha_paths[i]}")
                if a.ndim == 3:
                    a = a[..., 0]
                alpha = a.astype(np.float32)
                fg = np.zeros((*alpha.shape, 3), np.float32)
                if i < len(fg_paths):
                    f = cv2.imread(str(fg_paths[i]),
                                   cv2.IMREAD_UNCHANGED | cv2.IMREAD_ANYDEPTH)
                    if f is not None:
                        fg = f.astype(np.float32)  # linear BGR NHWC
                shm = ShmFrame(shm_path)
                shm.write_alpha_fg(alpha, fg)
                shm.close()
                shape_hw = list(alpha.shape[:2])
            session["result"] = {"frames": len(frames), "shape_hw": shape_hw}
            return time.time() - t0
        finally:
            shutil.rmtree(frame_dir, ignore_errors=True)
            shutil.rmtree(out_dir, ignore_errors=True)
            if work_dir is not None:
                shutil.rmtree(work_dir, ignore_errors=True)
            torch.cuda.empty_cache()

    def dispatch(self, req: dict, conn_state: dict) -> dict:
            cmd = req["command"]
            if cmd == "command":
                cmd = req.get("name", "")
            p = req.get("payload") or {}
            if cmd in ("health", "Health"):
                return ok({
                    "server_role": "bmt-worker",
                    "engine": "corridorkey2.0-official",
                    "server_pid": os.getpid(),
                    "model_loaded": self.model is not None,
                    "session_count": len(self.sessions),
                    "active_session_id": conn_state.get("session_id", ""),
                })
            if cmd in ("prepare_session", "PrepareSession"):
                self.ensure_model()
                sid = str(uuid.uuid4())
                # v0.4: store ck2_settings from prepare_session payload
                ck2_settings = p.get("ck2_settings") or {}
                self.sessions[sid] = {"frames": [], "result": None,
                                      "hint_path": p.get("hint_path") or None,
                                      "ck2_settings": ck2_settings}
                conn_state["session_id"] = sid
                return ok({"session_id": sid, "reused": False,
                           "frame_format": "bmt_shm_v1"})
            if cmd in ("render_frame", "RenderFrame"):
                sid = p.get("session_id", "")
                sess = self.sessions.get(sid)
                if sess is None:
                    return err("unknown session_id")
                shm_path = p["shared_frame_path"]
                frame_index = int(p.get("frame_index", len(sess["frames"])))
                is_last = bool(p.get("is_last", False))
                sess["frames"].append((shm_path, int(p["width"]), int(p["height"])))
                elapsed = None
                if is_last:
                    # v0.4: pass ck2_settings from session (prepare_session) merged with any render_frame settings
                    settings = dict(sess.get("ck2_settings") or {})
                    settings.update(p.get("settings") or {})
                    elapsed = self.process_clip(sess, settings)
                return ok({"accepted": True, "frame_index": frame_index,
                           "clip_done": is_last,
                           "elapsed_s": elapsed,
                           "stats": sess.get("result")})
            if cmd in ("release_session", "ReleaseSession"):
                self.sessions.pop(p.get("session_id", ""), None)
                return ok({"released": True})
            if cmd in ("shutdown", "Shutdown"):
                conn_state["shutdown"] = True
                return ok({"ok": True})
            return err(f"unsupported command: {cmd}")


def ok(payload):
    return {"protocol_version": PROTOCOL_VERSION, "success": True,
            "error": "", "payload": payload}


def err(message):
    return {"protocol_version": PROTOCOL_VERSION, "success": False,
            "error": message, "payload": None}


def parent_watchdog(parent_pid: int):
    import ctypes
    kernel32 = ctypes.windll.kernel32
    SYNCHRONIZE = 0x00100000
    WAIT_OBJECT_0 = 0
    handle = kernel32.OpenProcess(SYNCHRONIZE, False, parent_pid)
    if not handle:
        return
    while True:
        if kernel32.WaitForSingleObject(handle, 2000) == WAIT_OBJECT_0:
            print("[bmt-worker] parent exited, terminating", flush=True)
            os._exit(0)


def serve(args):
    worker = Worker(args)
    if args.parent_pid:
        threading.Thread(target=parent_watchdog, args=(args.parent_pid,),
                         daemon=True).start()
    # Load the model eagerly so the first Health already reports ready state;
    # the client polls Health with a launch timeout.
    threading.Thread(target=worker.ensure_model, daemon=True).start()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", args.port))
    srv.listen(4)
    print(f"[bmt-worker] listening on 127.0.0.1:{args.port} pid={os.getpid()}",
          flush=True)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle_conn, args=(conn, worker),
                         daemon=True).start()


def handle_conn(conn, worker: Worker):
    state = {"session_id": ""}
    buf = b""
    try:
        conn.settimeout(600)
        while True:
            chunk = conn.recv(65536)
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if not line.strip():
                    continue
                try:
                    req = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    conn.sendall((json.dumps(err("invalid json")) + "\n").encode())
                    continue
                resp = worker.dispatch(req, state)
                try:
                    conn.sendall((json.dumps(resp) + "\n").encode())
                except (TypeError, ValueError):
                    conn.sendall((json.dumps(
                        err("non-serializable response")) + "\n").encode())
                if state.get("shutdown"):
                    conn.close()
                    os._exit(0)
    except OSError:
        pass
    finally:
        try:
            conn.close()
        except OSError:
            pass


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int,
                    default=int(os.environ.get("CORRIDORKEY_HOST_PLUGIN_RUNTIME_PORT", "43999")))
    ap.add_argument("--parent-pid", type=int, default=0)
    args = ap.parse_args()
    serve(args)
