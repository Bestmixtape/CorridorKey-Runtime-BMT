import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guiRoot = path.resolve(scriptDir, "..");
const distRoot = path.join(guiRoot, "dist");
const repoRoot = path.resolve(guiRoot, "..", "..");
const releaseRuntimePath = path.join(repoRoot, "build", "release", "src", "cli", "corridorkey.exe");
const debugRuntimePath = path.join(repoRoot, "build", "debug", "src", "cli", "corridorkey.exe");
const runtimePath =
  process.env.CK_REAL_RUNTIME_EXE ||
  (existsSync(releaseRuntimePath) ? releaseRuntimePath : debugRuntimePath);
const inputPath =
  process.env.CK_REAL_RUNTIME_INPUT ||
  path.join(repoRoot, "assets", "video_samples", "Jordan4k.mp4");
const hintPath =
  process.env.CK_REAL_RUNTIME_HINT ||
  path.join(repoRoot, "assets", "video_samples", "Jordan4k_alphahint.mp4");
const modelPath =
  process.env.CK_REAL_RUNTIME_MODEL ||
  path.join(repoRoot, "models", "corridorkey_fp16_2048.onnx");
const outputDir =
  process.env.CK_REAL_RUNTIME_OUTPUT_DIR ||
  path.join(repoRoot, "build", "gui-real-e2e");
const outputPath =
  process.env.CK_REAL_RUNTIME_OUTPUT ||
  path.join(outputDir, "Jordan4k_gui_smoke_2048.mov");
const previewProxyPath = path.join(outputDir, "Jordan4k_gui_smoke_2048_preview.mp4");
const stagedPreviewFfmpegPath = path.join(
  guiRoot,
  "src-tauri",
  "resources",
  "runtime",
  previewFfmpegBinaryName()
);
const previewFfmpegPath =
  process.env.CORRIDORKEY_FFMPEG_PATH ||
  (existsSync(stagedPreviewFfmpegPath) ? stagedPreviewFfmpegPath : "");

for (const requiredPath of [runtimePath, inputPath, hintPath, modelPath]) {
  assert(existsSync(requiredPath), `Required smoke input is missing: ${requiredPath}`);
}
assert(
  previewFfmpegPath && existsSync(previewFfmpegPath),
  `Required preview ffmpeg is missing. Set CORRIDORKEY_FFMPEG_PATH, or stage ${stagedPreviewFfmpegPath}.`
);
assert.equal(
  path.basename(previewFfmpegPath).toLowerCase(),
  previewFfmpegBinaryName(),
  `Preview ffmpeg must be named ${previewFfmpegBinaryName()}: ${previewFfmpegPath}`
);

mkdirSync(outputDir, { recursive: true });
rmSync(outputPath, { force: true });
rmSync(previewProxyPath, { force: true });

await assertJsonFailureProbe();

const events = [];
let stdoutBuffer = "";
const runtime = spawn(
  runtimePath,
  [
    "process",
    "--input", inputPath,
    "--output", outputPath,
    "--alpha-hint", hintPath,
    "--model", modelPath,
    "--resolution", "2048",
    "--video-encode", "balanced",
    "--json"
  ],
  {
    cwd: repoRoot,
    windowsHide: true
  }
);

runtime.stdout.setEncoding("utf8");
runtime.stderr.setEncoding("utf8");

runtime.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() ?? "";

  for (const line of lines) {
    parseEventLine(line);
  }
});

let stderr = "";
runtime.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const exitCode = await new Promise((resolve) => {
  runtime.on("close", resolve);
});

if (stdoutBuffer.trim().length > 0) {
  parseEventLine(stdoutBuffer);
}

assert.equal(exitCode, 0, `real runtime process failed with ${exitCode}: ${stderr}`);
assert(events.some((event) => event.type === "job_started"), "missing job_started event");
assert(events.some((event) => event.type === "backend_selected"), "missing backend_selected event");
assert(events.some((event) => event.type === "progress"), "missing progress events");
assert(events.some((event) => event.type === "artifact_written"), "missing artifact_written event");
assert(events.some((event) => event.type === "completed"), "missing completed event");
assert(existsSync(outputPath), `output was not written: ${outputPath}`);
assert(statSync(outputPath).size > 0, `output is empty: ${outputPath}`);
await assertPreviewFfmpeg(previewFfmpegPath);
await createPreviewProxy(previewFfmpegPath, outputPath, previewProxyPath);
assert(existsSync(previewProxyPath), `preview proxy was not written: ${previewProxyPath}`);
assert(statSync(previewProxyPath).size > 0, `preview proxy is empty: ${previewProxyPath}`);
await assertPreviewDecodes(previewFfmpegPath, previewProxyPath);
const previewMetadata = await assertGuiResultPreviewLoads({
  sourcePath: inputPath,
  hintPath,
  artifactPath: outputPath,
  proxyPath: previewProxyPath,
  outputDir
});

console.log(`[smoke] real runtime 2048 ${outputPath}`);
console.log(
  `[smoke] real preview proxy ${previewProxyPath} ${previewMetadata.width}x${previewMetadata.height} ${previewMetadata.duration.toFixed(3)}s`
);

async function assertJsonFailureProbe() {
  const probeEvents = [];
  let probeBuffer = "";
  let probeStderr = "";
  const probe = spawn(
    runtimePath,
    [
      "process",
      "--output", path.join(outputDir, "missing-input-probe.mov"),
      "--json"
    ],
    {
      cwd: repoRoot,
      windowsHide: true
    }
  );

  probe.stdout.setEncoding("utf8");
  probe.stderr.setEncoding("utf8");
  probe.stdout.on("data", (chunk) => {
    probeBuffer += chunk;
    const lines = probeBuffer.split(/\r?\n/);
    probeBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length > 0) {
        probeEvents.push(JSON.parse(line));
      }
    }
  });
  probe.stderr.on("data", (chunk) => {
    probeStderr += chunk;
  });

  const probeExitCode = await new Promise((resolve) => {
    probe.on("close", resolve);
  });
  if (probeBuffer.trim().length > 0) {
    probeEvents.push(JSON.parse(probeBuffer));
  }

  assert.equal(probeExitCode, 1, `failure probe unexpectedly exited with ${probeExitCode}: ${probeStderr}`);
  assert(
    probeEvents.some((event) =>
      event.type === "failed" &&
      typeof event.message === "string" &&
      event.message.includes("'process' requires an input path.")
    ),
    `failure probe did not emit a structured failed event: ${JSON.stringify(probeEvents)}`
  );
}

function parseEventLine(line) {
  if (line.trim().length === 0) return;
  events.push(JSON.parse(line));
}

async function assertPreviewFfmpeg(ffmpegPath) {
  await runProcess(ffmpegPath, ["-version"], "preview ffmpeg probe");
}

async function createPreviewProxy(ffmpegPath, sourcePath, proxyPath) {
  const encoders = ["libx264", "h264_mf", "h264_nvenc", "h264"];
  let lastError = "";

  for (const encoder of encoders) {
    rmSync(proxyPath, { force: true });
    try {
      await runProcess(
        ffmpegPath,
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          sourcePath,
          "-map",
          "0:v:0",
          "-an",
          "-vf",
          "scale=-2:720",
          "-c:v",
          encoder,
          "-pix_fmt",
          "yuv420p",
          ...(encoder === "libx264" ? ["-preset", "veryfast", "-crf", "23"] : []),
          "-movflags",
          "+faststart",
          proxyPath
        ],
        `preview proxy ${encoder}`
      );
      return;
    } catch (error) {
      lastError = error.message;
    }
  }

  throw new Error(`Could not create a browser preview proxy for ${sourcePath}:\n${lastError}`);
}

async function assertPreviewDecodes(ffmpegPath, proxyPath) {
  await runProcess(
    ffmpegPath,
    ["-v", "error", "-i", proxyPath, "-f", "null", "-"],
    "preview proxy decode"
  );
}

async function assertGuiResultPreviewLoads({
  sourcePath,
  hintPath,
  artifactPath,
  proxyPath,
  outputDir
}) {
  assert(
    existsSync(path.join(distRoot, "index.html")),
    "Build the GUI before real-runtime preview smoke: pnpm build"
  );

  const mediaPaths = new Map([
    [sourcePath, sourcePath],
    [hintPath, hintPath],
    [artifactPath, artifactPath],
    [proxyPath, proxyPath]
  ]);
  const server = createGuiServer(distRoot, mediaPaths);
  let browser;

  try {
    await listenServer(server);
    browser = await chromium.launch({
      headless: true,
      executablePath: findChromiumExecutable()
    });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await installGuiPreviewHarness(page, {
      sourcePath,
      hintPath,
      artifactPath,
      proxyPath,
      outputDir
    });
    await page.goto(resolveServerUrl(server), { waitUntil: "domcontentloaded" });
    await waitForBody(page, "Runtime ready");
    await waitForBody(page, "Keying Workbench");

    await page.getByRole("button", { name: /1\. Source/i }).click();
    await waitForBody(page, path.basename(sourcePath));
    await page.getByRole("button", { name: /2\. Alpha Hint.*Select alpha hint/i }).click();
    await waitForBody(page, path.basename(hintPath));
    await page.getByRole("button", { name: /Run Neural Keyer/i }).click();
    await waitForBody(page, "Complete");
    await waitForBody(page, artifactPath);

    await page.getByRole("button", { name: "Result" }).click();
    await page.locator("video").first().evaluate((video) => {
      video.dispatchEvent(new Event("error"));
    });
    await waitForBody(page, "Preview proxy");
    const metadataHandle = await page.waitForFunction(
      () => {
        const video = Array.from(document.querySelectorAll("video")).find((candidate) =>
          (candidate.currentSrc || candidate.src || "").includes("_preview.mp4")
        );
        if (
          !video ||
          video.readyState < HTMLMediaElement.HAVE_METADATA ||
          video.videoWidth <= 0 ||
          video.videoHeight <= 0 ||
          !Number.isFinite(video.duration) ||
          video.duration <= 0
        ) {
          return null;
        }

        return {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration
        };
      },
      null,
      { timeout: 15000 }
    );
    await page.waitForFunction(
      () => window.__corridorkeyPreviewProxyCalls === 1,
      null,
      { timeout: 15000 }
    );
    const metadata = await metadataHandle.jsonValue();
    await page.close();
    return metadata;
  } finally {
    if (browser) {
      await browser.close();
    }
    await closeServer(server);
  }
}

async function installGuiPreviewHarness(page, {
  sourcePath,
  hintPath,
  artifactPath,
  proxyPath,
  outputDir
}) {
  await page.addInitScript(
    ({ sourcePath, hintPath, artifactPath, proxyPath, outputDir }) => {
      const callbacks = new Map();
      const listeners = new Map();
      const timers = [];
      let nextCallbackId = 1;
      window.__corridorkeyPreviewProxyCalls = 0;

      const runCallback = (id, data) => {
        const callback = callbacks.get(id);
        if (callback) {
          callback(data);
        }
      };

      const unregisterCallback = (id) => {
        callbacks.delete(id);
      };

      const transformCallback = (callback, once = false) => {
        const id = nextCallbackId++;
        callbacks.set(id, (data) => {
          if (once) {
            unregisterCallback(id);
          }
          callback(data);
        });
        return id;
      };

      const emit = (eventName, payload) => {
        const eventListeners = listeners.get(eventName) || [];
        for (const listenerId of eventListeners) {
          runCallback(listenerId, {
            event: eventName,
            id: listenerId,
            payload
          });
        }
      };

      const scheduleEvent = (delayMs, payload) => {
        const timer = window.setTimeout(() => {
          emit("engine-event", JSON.stringify(payload));
        }, delayMs);
        timers.push(timer);
      };

      const startJobEvents = () => {
        scheduleEvent(20, { type: "job_started", message: "Runtime job started", progress: 0 });
        scheduleEvent(40, { type: "backend_selected", backend: "tensorrt", message: "RTX selected" });
        scheduleEvent(60, {
          type: "progress",
          progress: 0.5,
          message: "Processing...",
          metrics: {
            active_stage: "matte",
            processed_frames: 12,
            total_frames: 24,
            render_fps: 18.5
          }
        });
        scheduleEvent(80, {
          type: "artifact_written",
          artifact_path: artifactPath,
          message: "Artifact written"
        });
        scheduleEvent(100, {
          type: "completed",
          message: "Finished",
          timings: [{ name: "frame_total", total_ms: 1000, sample_count: 24 }]
        });
      };

      const handleEventPlugin = (command, args) => {
        if (command === "plugin:event|listen") {
          const eventListeners = listeners.get(args.event) || [];
          eventListeners.push(args.handler);
          listeners.set(args.event, eventListeners);
          return Promise.resolve(args.handler);
        }

        if (command === "plugin:event|unlisten") {
          const eventListeners = listeners.get(args.event) || [];
          listeners.set(
            args.event,
            eventListeners.filter((id) => id !== args.eventId)
          );
          return Promise.resolve(null);
        }

        return Promise.resolve(null);
      };

      globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (eventName, eventId) => {
          const eventListeners = listeners.get(eventName) || [];
          listeners.set(
            eventName,
            eventListeners.filter((id) => id !== eventId)
          );
          unregisterCallback(eventId);
        }
      };

      globalThis.__TAURI_INTERNALS__ = {
        invoke: (command, args) => {
          if (command.startsWith("plugin:event|")) {
            return handleEventPlugin(command, args);
          }

          if (command === "get_runtime_readiness") {
            return Promise.resolve(runtimeReadiness());
          }

          if (command === "start_processing") {
            startJobEvents();
            return Promise.resolve(null);
          }

          if (command === "cancel_processing") {
            while (timers.length > 0) {
              window.clearTimeout(timers.pop());
            }
            return Promise.resolve(true);
          }

          if (command === "create_preview_proxy") {
            if (args.source !== artifactPath) {
              throw new Error(`Unexpected preview proxy source: ${args.source}`);
            }
            window.__corridorkeyPreviewProxyCalls += 1;
            return Promise.resolve({
              source_path: args.source,
              path: proxyPath,
              reused: false
            });
          }

          if (command === "select_source_asset") {
            return Promise.resolve(sourcePath);
          }

          if (command === "select_alpha_hint_asset") {
            return Promise.resolve(hintPath);
          }

          if (command === "reveal_in_folder") {
            return Promise.resolve(null);
          }

          if (command === "plugin:path|resolve_directory") {
            return Promise.resolve(outputDir);
          }

          if (command === "plugin:path|join" || command === "plugin:path|resolve") {
            return Promise.resolve(Array.isArray(args?.paths) ? args.paths.join("\\") : outputDir);
          }

          if (command === "plugin:dialog|open") {
            return Promise.resolve(sourcePath);
          }

          if (command === "plugin:dialog|save") {
            return Promise.resolve(artifactPath);
          }

          throw new Error(`Unexpected Tauri command in real preview smoke: ${command}`);
        },
        transformCallback,
        unregisterCallback,
        runCallback,
        callbacks,
        convertFileSrc: (filePath) => `/__media/${encodeURIComponent(filePath)}`
      };
      globalThis.isTauri = true;

      function runtimeReadiness() {
        return {
          status: "ready",
          runtime_path: "C:\\Smoke\\ck-engine.exe",
          searched_roots: ["C:\\Smoke"],
          info: commandSuccess("info", {
            version: "smoke-runtime",
            devices: [{ name: "RTX Smoke 4090", memory_mb: 24576, backend: "tensorrt" }],
            capabilities: {
              platform: "windows",
              supported_backends: ["tensorrt"],
              cpu_fallback_available: false
            },
            supported_tracks: ["green"]
          }),
          doctor: commandSuccess("doctor", {
            summary: { healthy: true, video_healthy: true, message: "Runtime ready" },
            supported_tracks: ["green"],
            models: { missing_count: 0, missing_models: [] }
          }),
          models: commandSuccess("models", {
            supported_tracks: ["green"],
            missing_models: [],
            missing_count: 0,
            models: [
              {
                id: "green",
                filename: "corridorkey_fp16_2048.onnx",
                name: "Green Matting",
                found: true,
                usable: true,
                path: "models\\corridorkey_fp16_2048.onnx",
                recommended_backend: "tensorrt",
                resolution: 2048,
                intended_platforms: ["windows_rtx_30_plus"],
                installable_model_pack: true,
                packaged_for_windows: true,
                artifact_status: "usable",
                artifact_state: {
                  certified_for_active_track: true,
                  packaged_for_active_track: true,
                  present: true,
                  state: "recommended"
                }
              }
            ]
          }),
          presets: commandSuccess("presets", {
            presets: [
              {
                id: "preview",
                name: "Preview",
                recommended_model: "corridorkey_fp16_2048.onnx",
                intended_platforms: ["windows_rtx_30_plus"],
                default_for_windows: true
              }
            ]
          })
        };
      }

      function commandSuccess(command, value) {
        return {
          command,
          ok: true,
          value,
          error: null
        };
      }
    },
    { sourcePath, hintPath, artifactPath, proxyPath, outputDir }
  );
}

function createGuiServer(root, mediaPaths) {
  return createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const requestPath = decodeURIComponent(requestUrl.pathname);

    if (requestPath.startsWith("/__media/")) {
      const mediaKey = decodeURIComponent(requestUrl.pathname.slice("/__media/".length));
      const mediaPath = mediaPaths.get(mediaKey);
      if (!mediaPath) {
        response.writeHead(404);
        response.end("Media not found");
        return;
      }
      serveMediaFile(request, response, mediaPath);
      return;
    }

    const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
    let filePath = path.resolve(root, relativePath);

    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = path.join(root, "index.html");
    }

    response.writeHead(200, { "Content-Type": contentTypeForPath(filePath) });
    createReadStream(filePath).pipe(response);
  });
}

function serveMediaFile(request, response, filePath) {
  const stat = statSync(filePath);
  const contentType = mediaContentTypeForPath(filePath);
  const range = request.headers.range;

  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (match) {
      const requestedStart = match[1] ? Number.parseInt(match[1], 10) : null;
      const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : null;
      let start = requestedStart ?? 0;
      let end = requestedEnd ?? stat.size - 1;

      if (requestedStart === null && requestedEnd !== null) {
        const suffixLength = Math.min(requestedEnd, stat.size);
        start = stat.size - suffixLength;
        end = stat.size - 1;
      }

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end < start ||
        start >= stat.size
      ) {
        response.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        response.end();
        return;
      }

      const clampedEnd = Math.min(end, stat.size - 1);
      const chunkSize = clampedEnd - start + 1;
      response.writeHead(206, {
        "Content-Range": `bytes ${start}-${clampedEnd}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType
      });
      createReadStream(filePath, { start, end: clampedEnd }).pipe(response);
      return;
    }
  }

  response.writeHead(200, {
    "Accept-Ranges": "bytes",
    "Content-Length": stat.size,
    "Content-Type": contentType
  });
  createReadStream(filePath).pipe(response);
}

async function waitForBody(page, expectedText) {
  try {
    await page.waitForFunction(
      (expected) => document.body.innerText.toLowerCase().includes(expected),
      expectedText.toLowerCase(),
      { timeout: 15000 }
    );
  } catch (error) {
    const body = await bodyText(page).catch(() => "<body unavailable>");
    throw new Error(`Timed out waiting for "${expectedText}". Body was:\n${body}`, {
      cause: error
    });
  }
}

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 15000 });
}

function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  return "application/octet-stream";
}

function mediaContentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  return "application/octet-stream";
}

function runProcess(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${label} failed with ${exitCode}: ${stderr || stdout}`));
    });
  });
}

function listenServer(httpServer) {
  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(httpServer) {
  return new Promise((resolve) => {
    httpServer.close(resolve);
  });
}

function resolveServerUrl(httpServer) {
  const address = httpServer.address();
  if (address && typeof address === "object") {
    return `http://127.0.0.1:${address.port}/`;
  }

  throw new Error("Preview smoke server did not report a local URL.");
}

function previewFfmpegBinaryName() {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function findChromiumExecutable() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const browserRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright")
    : "";
  if (!browserRoot || !existsSync(browserRoot)) {
    return undefined;
  }

  const revisions = readdirSync(browserRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => entry.name)
    .sort((left, right) => revisionNumber(right) - revisionNumber(left));

  for (const revision of revisions) {
    for (const candidate of [
      path.join(browserRoot, revision, "chrome-win64", "chrome.exe"),
      path.join(browserRoot, revision, "chrome-win", "chrome.exe")
    ]) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function revisionNumber(name) {
  const match = name.match(/-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}
