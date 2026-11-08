# CorridorKey 2.0 — BMT Build (OpenFX)

An OpenFX chroma-keying plugin for DaVinci Resolve wrapping the
[CorridorKey](https://github.com/alexalvaro/CorridorKey) 2.0 engine, with an
on-demand model downloader, a hue-picker keying mode, an FP32/FP16 precision
dropdown, and an alpha-matte exporter. This is a **BMT Build**: a community
repackaging of the upstream [CorridorKey-Runtime](https://github.com/alexandremendoncaalvaro/CorridorKey-Runtime)
by Bestmixtape. Free — not for sale.

- Effect name in hosts: `Open FX > Keying > CorridorKey 2.0 BMT Build`
- Plugin build version: **0.2** (the "2.0" names the engine inside)
- macOS port: CUDA replaced by **Metal** via Apple's **MLX** inference backend
- macOS builds are **Apple Silicon (M-series) only — they will not run on Intel Macs**

## Platforms & GPU backends

| Platform | Inference backend | Notes |
|---|---|---|
| Windows 10/11 x64 | CUDA + TensorRT-RTX / ONNX Runtime | RTX GPU; FP32 default, FP16 experimental |
| macOS 14+ **Apple Silicon only** (M1/M2/M3/M4 — not Intel) | Metal via MLX (main model) + CoreML EP (hint models) | arm64 binaries; no CUDA/TensorRT |

## Installers (v0.2)

Grab any of these from the
[Releases page](https://github.com/Bestmixtape/CorridorKey2.0-OFX-BMT/releases).

### What's new in 0.2

- **First-run download is now visible:** while the model pack is missing or
  downloading, the plugin stamps a status card into the preview (you see it in
  Resolve's viewer) — the source image passes through until the models land.
- **Live progress:** percent plus *bytes downloaded of total pack size* and
  the current file, in the card and in the panel's Model Pack row. Progress
  covers the whole pack across all files and survives resuming a partial
  download.
- **Controls lock during download:** keying controls grey out until the pack
  is complete, so settings can't be changed against a half-installed pack.
  The Model Precision dropdown stays live so you can switch FP32/FP16 tracks.
- **Failure is not a dead end:** if a download fails, the controls unlock
  again and the card explains what happened and where the files go.
- Once the pack is complete the card disappears and the effect works exactly
  as before.

### Files

| File | What it is |
|---|---|
| `CorridorKey2.0-BMT-Win64-v0.2.zip` | Portable: drop `CorridorKey-BMT.ofx.bundle` into `C:\Program Files\Common Files\OFX\Plugins` |
| `CorridorKey2.0-BMT-Win64-v0.2-Setup.exe` | Windows installer; removable via **Settings → Apps → Add or remove programs** |
| `CorridorKey2.0-BMT-Win64-v0.2.msi` | MSI for managed deployment (same uninstall entry) |
| `CorridorKey2.0-BMT-macOS-Silicon-v0.2.zip` | Portable: copy the bundle into `/Library/OFX/Plugins` |
| `CorridorKey2.0-BMT-macOS-Silicon-v0.2.dmg` | Double-click `Install CorridorKey BMT.command` (asks for sudo); includes an uninstall script. **Refuses to install on Intel Macs** |

> MSIX is deliberately not offered: MSIX packages install into a per-app
> container that Resolve's OFX plugin scan does not read.

After installing, restart Resolve and (if needed) tick the plugin under
**Preferences → System → Video Plugins**.

## First run

Model weights download from Hugging Face
([alexandrealvaro/CorridorKey](https://huggingface.co/alexandrealvaro/CorridorKey))
on first use — about 1.2 GB on Windows (FP32 ladder) and ~2.1 GB on macOS
(MLX safetensors + per-resolution bridges, plus shared hint models). Locations:

- Windows: `%LOCALAPPDATA%\CorridorKey2.0-BMT\`
- macOS: `~/Library/Application Support/CorridorKey2.0-BMT` (+ Caches/Logs)

You can pre-fetch with the bundled CLI (`corridorkey fetch-models`).

## Panel features

- **Background:** Blue, Green, or **Picker** (experimental eyedropper for any chroma hue)
- **Model precision:** FP32 (default) / FP16 (experimental) — Windows; on macOS the MLX safetensors + bridges run FP16 on the Metal GPU
- **Export Matte (PNG sequence):** writes the alpha key alongside your render

### macOS caveat

Upstream publishes the dedicated *blue* model only as a Windows
TensorRT-RTX artifact. On macOS, blue plates key through the green model
behind the hue Picker.

## Building from source

- **Windows:** Visual Studio 2022 Build Tools, CMake ≥ 3.28, Ninja, CUDA 12.9,
  vcpkg (`vcpkg.json`). The vendored Windows ONNX Runtime and TensorRT-RTX
  binaries are not carried in this fork's git tree; re-stage them under
  `vendor/` before configuring.
- **macOS:** `.github/workflows/macos.yml` (macos-15 runner, Apple Silicon) stages the
  official ONNX Runtime osx-arm64 release + the MLX package (pip venv, found via
  `python -m mlx --cmake-dir`), builds `corridorkey_ofx`, verifies
  the bundle layout/link contract, ad-hoc signs, smoke-tests Metal inference
  (MLX + CoreML hint EP) end-to-end, and uploads the zip + dmg.

## License

[CC BY-NC-SA 4.0](./LICENSE) (upstream license, unchanged):

> You may use this software to process commercial video. You may not
> repackage or sell the software itself or offer it as a paid service.

## Acknowledgements

- **CorridorKey engine/runtime/models:** [alexandremendoncaalvaro/CorridorKey-Runtime](https://github.com/alexandremendoncaalvaro/CorridorKey-Runtime)
- **Original CorridorKey:** [github.com/nikopueringer/CorridorKey](https://github.com/nikopueringer/CorridorKey)
- **EZ-CorridorKey:** [github.com/edenaion/EZ-CorridorKey](https://github.com/edenaion/EZ-CorridorKey)
- **CorridorKey-Engine:** [github.com/99oblivius/CorridorKey-Engine](https://github.com/99oblivius/CorridorKey-Engine)
- **ONNX Runtime** by Microsoft, **OpenEXR** by the Academy Software Foundation
- **BMT Build:** branding, installers, and the CUDA→Metal (MLX) macOS port (this repo)
