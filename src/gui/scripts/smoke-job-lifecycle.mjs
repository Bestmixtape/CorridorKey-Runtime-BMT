import assert from "node:assert/strict";
import {
  createReadStream,
  existsSync,
  readdirSync,
  statSync
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guiRoot = path.resolve(scriptDir, "..");
const distRoot = path.join(guiRoot, "dist");
const downloadsPath = "C:\\Users\\Smoke\\Downloads";
const inputPath = "C:\\Smoke\\input.mov";
const sourceFolderPath = "C:\\Smoke\\sequence";
const hintPath = "C:\\Smoke\\alpha_hint.mov";
const outputPath = "C:\\Smoke\\output.mov";
const artifactPath = "C:\\Smoke\\output_keyed.mov";
const outputRecipeCapabilities = {
  artifact_families: ["movie", "exr_sequence"],
  movie_alpha_modes: ["composited_preview"],
  exr_sequence_outputs: ["matte_exr", "foreground_exr", "processed_exr", "comp_png"],
  replacement_media_output: false,
  color_intents: ["runtime_default"]
};

const scenarios = [
  {
    name: "success",
    run: async (page) => {
      await selectSourceFolder(page);
      await selectInput(page);
      await assertAlphaHintSelectionAndClear(page);
      await configureOutputRecipe(page);
      await configureAdvancedControls(page);
      await page.getByRole("button", { name: /Run Neural Keyer/i }).click();
      await assertAdvancedProcessPayload(page);
      await waitForBody(page, "Complete");
      await waitForBody(page, artifactPath);
      await waitForBody(page, "Stage matte");
      await waitForBody(page, "12 / 24 frames");
      await waitForBody(page, "Render 18.50 fps");
      await waitForBody(page, "62.25 fps decode");
      await waitForBody(page, "30.00 fps encode");
      await waitForBody(page, "3 workers");
      await waitForBody(page, "512MB RAM");
      await waitForBody(page, "12.5% CPU");
      await waitForBody(page, "2 stages");
      await waitForBody(page, "Encode balanced");
      await waitForBody(page, "Output Movie");
      await waitForBody(page, "Alpha Composited preview");
      await waitForBody(page, "Preview Solid #111827");
      await waitForBody(page, "Color Runtime default");
      await waitForBody(page, "Resolution 2048");
      await waitForBody(page, "Tiling forced");
      await assertCopyDiagnostics(page, "Status: completed");
      assert.equal(await page.evaluate(() => window.__corridorkeyRevealCalls || 0), 0);
      await page.getByRole("button", { name: /Reveal Output/i }).click();
      assert.equal(await page.evaluate(() => window.__corridorkeyRevealCalls || 0), 1);
      await assertViewerComparisonControls(page);
      await assertPreviewProxyFallback(page);
      await assertResetWorkbench(page);
      await page.getByRole("button", { name: "History" }).click();
      await waitForBody(page, "success");
      await waitForBody(page, "tensorrt");
      await waitForBody(page, "preview");
    }
  },
  {
    name: "failure",
    run: async (page) => {
      await selectInput(page);
      await page.getByRole("button", { name: /Run Neural Keyer/i }).click();
      await assertDefaultProcessPayloadOmitsAdvanced(page);
      await waitForBody(page, "Processing Failed");
      await waitForBody(page, "Runtime fixture failed");
      await page.getByRole("button", { name: "History" }).click();
      await waitForBody(page, "failed");
      await waitForBody(page, "Runtime fixture failed");
    }
  },
  {
    name: "cancellation",
    run: async (page) => {
      await selectInput(page);
      await page.getByRole("button", { name: /Run Neural Keyer/i }).click();
      await waitForBody(page, "Processing...");
      await page.getByRole("button", { name: /Cancel/i }).click();
      await waitForBody(page, "Cancelled");
      await waitForBody(page, "Retry");
    }
  },
  {
    name: "malformed",
    run: async (page) => {
      await selectInput(page);
      await page.getByRole("button", { name: /Run Neural Keyer/i }).click();
      await waitForBody(page, "Processing Failed");
      await waitForBody(page, "malformed JSON");
      await page.getByRole("button", { name: "History" }).click();
      await waitForBody(page, "failed");
    }
  }
];

assert(existsSync(path.join(distRoot, "index.html")), "Build the GUI before smoke tests: pnpm build");

const server = createStaticServer(distRoot);

let browser;

try {
  await listenServer(server);
  const baseUrl = resolveServerUrl(server);
  browser = await chromium.launch({
    headless: true,
    executablePath: findChromiumExecutable()
  });
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 }
    });
    try {
      await runScenario(context, baseUrl, scenario);
      console.log(`[smoke] job ${scenario.name}`);
    } finally {
      await context.close();
    }
  }
} finally {
  if (browser) {
    await browser.close();
  }
  await closeServer(server);
}

async function runScenario(context, baseUrl, scenario) {
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !isExpectedSmokeConsoleError(text)) {
      consoleErrors.push(text);
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? ""}`);
  });

  await page.addInitScript(
    ({
      scenarioName,
      downloadsPath,
      inputPath,
      sourceFolderPath,
      hintPath,
      outputPath,
      artifactPath,
      outputRecipeCapabilities
    }) => {
      const callbacks = new Map();
      const listeners = new Map();
      const timers = [];
      let nextCallbackId = 1;
      window.__corridorkeyPreviewProxyCalls = 0;
      window.__corridorkeyLastProcessArgs = null;
      window.__corridorkeySourceSelectionModes = [];
      window.__corridorkeyHintSelections = 0;
      window.__corridorkeyClipboard = "";
      window.__corridorkeyRevealCalls = 0;

      const nativeSetAttribute = HTMLMediaElement.prototype.setAttribute;
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true,
        get() {
          return this.__corridorkeySmokeSrc || "";
        },
        set(value) {
          this.__corridorkeySmokeSrc = String(value || "");
        }
      });
      Object.defineProperty(HTMLMediaElement.prototype, "currentSrc", {
        configurable: true,
        get() {
          return this.__corridorkeySmokeSrc || "";
        }
      });
      HTMLMediaElement.prototype.setAttribute = function setAttribute(name, value) {
        if (name.toLowerCase() === "src") {
          this.src = value;
          return;
        }
        nativeSetAttribute.call(this, name, value);
      };
      Object.defineProperty(HTMLMediaElement.prototype, "duration", {
        configurable: true,
        get() {
          return Number(this.dataset.smokeDuration || "4");
        }
      });
      Object.defineProperty(HTMLMediaElement.prototype, "paused", {
        configurable: true,
        get() {
          return this.__corridorkeySmokePaused ?? true;
        }
      });
      HTMLMediaElement.prototype.play = function play() {
        this.__corridorkeySmokePaused = false;
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function pause() {
        this.__corridorkeySmokePaused = true;
        this.dispatchEvent(new Event("pause"));
      };

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (text) => {
            window.__corridorkeyClipboard = text;
            return Promise.resolve();
          }
        }
      });

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
          emit("engine-event", typeof payload === "string" ? payload : JSON.stringify(payload));
        }, delayMs);
        timers.push(timer);
      };

      const clearScheduledEvents = () => {
        while (timers.length > 0) {
          const timer = timers.pop();
          window.clearTimeout(timer);
        }
      };

      const startJobEvents = () => {
        if (scenarioName === "malformed") {
          scheduleEvent(20, { type: "job_started", message: "Runtime job started" });
          scheduleEvent(40, "not-json");
          return;
        }

        scheduleEvent(20, { type: "job_started", message: "Runtime job started", progress: 0 });
        scheduleEvent(40, { type: "backend_selected", backend: "tensorrt", message: "RTX selected" });
        scheduleEvent(60, {
          type: "progress",
          progress: 0.42,
          message: "Processing...",
          metrics: {
            active_stage: "matte",
            processed_frames: 12,
            total_frames: 24,
            render_fps: 18.5,
            decode_fps: 62.25,
            encode_fps: 30,
            worker_count: 3,
            ram_usage_mb: 512,
            cpu_usage_percent: 12.5
          }
        });

        if (scenarioName === "failure") {
          scheduleEvent(80, { type: "failed", message: "Runtime fixture failed" });
          return;
        }

        if (scenarioName === "cancellation") {
          scheduleEvent(5000, { type: "completed", message: "Should not complete" });
          return;
        }

        scheduleEvent(80, { type: "warning", message: "Fallback probe skipped" });
        scheduleEvent(100, { type: "artifact_written", artifact_path: artifactPath, message: "Artifact written" });
        scheduleEvent(120, {
          type: "completed",
          message: "Finished",
          timings: [
            { name: "frame_total", total_ms: 1000, sample_count: 24 },
            { name: "matte", total_ms: 12.5 }
          ]
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
            if (!args?.preset && !args?.model) {
              throw new Error("Job smoke requires a preset or explicit model selection");
            }
            window.__corridorkeyLastProcessArgs = args;
            startJobEvents();
            return Promise.resolve(null);
          }

          if (command === "cancel_processing") {
            clearScheduledEvents();
            scheduleEvent(20, { type: "cancelled", message: "Cancelled" });
            return Promise.resolve(true);
          }

          if (command === "create_preview_proxy") {
            window.__corridorkeyPreviewProxyCalls += 1;
            return Promise.resolve({
              source_path: args.source,
              path: args.source.replace(/\.mov$/i, "_preview.mp4"),
              reused: false
            });
          }

          if (command === "select_source_asset") {
            window.__corridorkeySourceSelectionModes.push(args.mode);
            return Promise.resolve(args.mode === "folder" ? sourceFolderPath : inputPath);
          }

          if (command === "select_alpha_hint_asset") {
            window.__corridorkeyHintSelections += 1;
            return Promise.resolve(hintPath);
          }

          if (command === "reveal_in_folder") {
            window.__corridorkeyRevealCalls += 1;
            return Promise.resolve(null);
          }

          if (command === "plugin:path|resolve_directory") {
            return Promise.resolve(downloadsPath);
          }

          if (command === "plugin:path|join" || command === "plugin:path|resolve") {
            return Promise.resolve(Array.isArray(args?.paths) ? args.paths.join("\\") : outputPath);
          }

          if (command === "plugin:dialog|open") {
            return Promise.resolve(inputPath);
          }

          if (command === "plugin:dialog|save") {
            return Promise.resolve(outputPath);
          }

          throw new Error(`Unexpected Tauri command in job smoke test: ${command}`);
        },
        transformCallback,
        unregisterCallback,
        runCallback,
        callbacks,
        convertFileSrc: (filePath) => filePath
      };
      globalThis.isTauri = true;

      function runtimeReadiness() {
        const info = commandSuccess("info", {
          version: "smoke-runtime",
          devices: [{ name: "RTX Smoke 4090", memory_mb: 24576, backend: "tensorrt" }],
          capabilities: {
            platform: "windows",
            supported_backends: ["tensorrt"],
            cpu_fallback_available: false,
            output_recipe: outputRecipeCapabilities
          },
          supported_tracks: ["green"]
        });
        const doctor = commandSuccess("doctor", {
          summary: { healthy: true, video_healthy: true, message: "Runtime ready" },
          supported_tracks: ["green"],
          models: { missing_count: 0, missing_models: [] }
        });
        const models = commandSuccess("models", {
          supported_tracks: ["green"],
          missing_models: [],
          missing_count: 0,
          models: [
            {
              id: "green",
              filename: "corridorkey_fp16_1024.onnx",
              name: "Green Matting",
              found: true,
              usable: true,
              path: "models\\corridorkey_fp16_1024.onnx",
              recommended_backend: "tensorrt",
              resolution: 1024,
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
        });
        const presets = commandSuccess("presets", {
          presets: [
            {
              id: "preview",
              name: "Preview",
              recommended_model: "corridorkey_fp16_1024.onnx",
              intended_platforms: ["windows_rtx_30_plus"],
              default_for_windows: true
            }
          ]
        });

        return {
          status: "ready",
          runtime_path: "C:\\Smoke\\ck-engine.exe",
          searched_roots: ["C:\\Smoke"],
          info,
          doctor,
          models,
          presets
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
    {
      scenarioName: scenario.name,
      downloadsPath,
      inputPath,
      sourceFolderPath,
      hintPath,
      outputPath,
      artifactPath,
      outputRecipeCapabilities
    }
  );

  try {
    await page.goto(`${baseUrl}?smoke-job=${scenario.name}`, { waitUntil: "domcontentloaded" });
    await waitForBody(page, "Runtime ready");
    await waitForBody(page, "Keying Workbench");
    await waitForBody(page, "Alpha Hint");
    await waitForBody(page, "Result");
    await waitForBody(page, "Preview");
    await waitForBody(page, "corridorkey_fp16_1024.onnx");
    await waitForBody(page, "Encoding");
    await waitForBody(page, "balanced");
    await expectBodyMissing(page, "Runtime catalog unavailable");
    await scenario.run(page);
    assert.deepEqual(pageErrors, [], `${scenario.name} emitted page errors`);
    assert.deepEqual(consoleErrors, [], `${scenario.name} emitted console errors`);
    assert.deepEqual(requestFailures, [], `${scenario.name} emitted request failures`);
  } finally {
    await page.close();
  }
}

async function selectInput(page) {
  await page.getByRole("button", { name: /1\. Source/i }).click();
  await waitForBody(page, "input.mov");
  await waitForBody(page, "input_corridorkey.mov");
  await page.waitForFunction(() => window.__corridorkeySourceSelectionModes.includes("file"));
}

async function selectSourceFolder(page) {
  await page.getByRole("button", { name: /Select sequence or project folder/i }).click();
  await waitForBody(page, "sequence");
  await waitForBody(page, "sequence_corridorkey_exr");
  await page.waitForFunction(() => window.__corridorkeySourceSelectionModes.includes("folder"));
}

async function assertAlphaHintSelectionAndClear(page) {
  await waitForBody(page, "Runtime fallback");
  await page.getByRole("button", { name: /2\. Alpha Hint.*Select alpha hint/i }).click();
  await waitForBody(page, "alpha_hint.mov");
  await waitForBody(page, "External hint");
  await page.waitForFunction(() => window.__corridorkeyHintSelections === 1);
  await page.getByRole("button", { name: /Clear Alpha Hint/i }).click();
  await waitForBody(page, "Runtime fallback");
  await expectBodyMissing(page, "alpha_hint.mov");
}

async function configureOutputRecipe(page) {
  await waitForBody(page, "Output Recipe");
  await waitForBody(page, "Movie");
  await waitForBody(page, "EXR sequence");
  await waitForBody(page, "Matte only (needs runtime support)");
  await waitForBody(page, "Composite preview");
  await page.getByLabel("Preview background").selectOption("replacement_media");
  await waitForBody(page, "No replacement media selected");
  await page.getByRole("button", { name: /Select replacement media/i }).click();
  await waitForBody(page, "Replacement media selected");
  await page.getByLabel("Preview background").selectOption("solid");
  await waitForBody(page, "Linear sRGB (needs runtime support)");
  await waitForBody(page, "Preview color");
}

async function configureAdvancedControls(page) {
  await page.getByRole("button", { name: /^balanced$/i }).click();
  await page.getByRole("button", { name: /Advanced controls/i }).click();
  await waitForBody(page, "Screen color");
  await waitForBody(page, "Quality");
  await waitForBody(page, "Alpha hint");
  await waitForBody(page, "Despill");
  await waitForBody(page, "Output mode");
  await waitForBody(page, "Tiling and refinement");
  await waitForBody(page, "Runtime diagnostics");
  await waitForBody(page, "Tiled (needs runtime support)");
  const tiledRefinementDisabled = await page
    .getByLabel("Refinement mode")
    .locator("option[value='tiled']")
    .evaluate((option) => option.disabled);
  assert.equal(
    tiledRefinementDisabled,
    true,
    "Tiled refinement must stay disabled until runtime artifacts advertise support"
  );
  await page.getByLabel("Quality fallback").selectOption("coarse_to_fine");
  await page.getByLabel("Precision").selectOption("fp16");
  await page.getByLabel("Resolution").selectOption("2048");
  await page.getByLabel("Batch size").fill("3");
  await page.getByLabel("Despill").fill("0.25");
  await page.getByLabel("Despeckle cleanup").check();
  await page.getByLabel("Force tiled processing").check();
}

async function assertAdvancedProcessPayload(page) {
  await page.waitForFunction(() => Boolean(window.__corridorkeyLastProcessArgs), null, { timeout: 15000 });
  const args = await page.evaluate(() => window.__corridorkeyLastProcessArgs);

  assert.equal(args.quality_fallback, "coarse_to_fine");
  assert.equal(args.refinement_mode, undefined);
  assert.equal(args.precision, "fp16");
  assert.equal(args.resolution, 2048);
  assert.equal(args.batch_size, 3);
  assert.equal(args.despill, 0.25);
  assert.equal(args.despeckle, true);
  assert.equal(args.tiled, true);
  assert.equal(args.video_encode, "balanced");
  assert.equal(args.output_artifact_family, undefined);
  assert.equal(args.alpha_mode, undefined);
  assert.equal(args.preview_background, undefined);
  assert.equal(args.color_intent, undefined);
}

async function assertDefaultProcessPayloadOmitsAdvanced(page) {
  await page.waitForFunction(() => Boolean(window.__corridorkeyLastProcessArgs), null, { timeout: 15000 });
  const args = await page.evaluate(() => window.__corridorkeyLastProcessArgs);

  for (const key of [
    "quality_fallback",
    "refinement_mode",
    "precision",
    "resolution",
    "batch_size",
    "despill",
    "despeckle",
    "tiled"
  ]) {
    assert.equal(args[key], undefined, `Default run should not send ${key}`);
  }
}

async function assertCopyDiagnostics(page, expectedText) {
  await page.getByRole("button", { name: /Copy Diagnostics/i }).click();
  await page.waitForFunction(
    (expected) => (window.__corridorkeyClipboard || "").includes(expected),
    expectedText,
    { timeout: 15000 }
  );
  const copied = await page.evaluate(() => window.__corridorkeyClipboard);
  assert(copied.includes("Raw logs:"), `Copied diagnostics missing raw logs:\n${copied}`);
  assert(copied.includes("Metrics:"), `Copied diagnostics missing metrics:\n${copied}`);
}

async function assertPreviewProxyFallback(page) {
  const before = await page.evaluate(() => window.__corridorkeyPreviewProxyCalls || 0);
  if (before === 0 && await page.locator("video").count() > 0) {
    await page.locator("video").first().evaluate((video) => {
      video.dispatchEvent(new Event("error"));
    });

    await page.waitForFunction(
      (count) => (window.__corridorkeyPreviewProxyCalls || 0) > count,
      before,
      { timeout: 15000 }
    );
  }

  await waitForBody(page, "Preview proxy");
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("video")).some((video) =>
        (video.currentSrc || video.src || "").includes("_preview.mp4")
      ),
    null,
    { timeout: 15000 }
  );
}

async function assertViewerComparisonControls(page) {
  await page.getByRole("button", { name: "Result" }).click();
  await page.getByRole("button", { name: "Vertical" }).click();
  await waitForBody(page, "Source vs Result");
  await waitForBody(page, "Synced playback");
  await assertSynchronizedComparisonVideos(page);

  await page.getByLabel("Wipe position").fill("68");
  assert.equal(await page.getByLabel("Wipe position").inputValue(), "68");
  const surface = page.locator(".cursor-crosshair").first();
  const box = await surface.boundingBox();
  assert(box, "comparison surface should be draggable");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.up();
  assert.notEqual(await page.getByLabel("Wipe position").inputValue(), "68");

  await page.getByRole("button", { name: "Horizontal" }).click();
  await page.getByRole("button", { name: "Diagonal" }).click();
  await page.getByRole("button", { name: "Overlay" }).click();
  await page.getByLabel("Overlay opacity").fill("72");
  assert.equal(await page.getByLabel("Overlay opacity").inputValue(), "72");
  await page.getByRole("button", { name: "Difference" }).click();
  await page.getByRole("button", { name: "Single" }).click();
  await waitForBody(page, "Complete");
}

async function assertSynchronizedComparisonVideos(page) {
  const primary = page.locator('video[data-preview-sync-role="primary"]').first();
  const secondary = page.locator('video[data-preview-sync-role="secondary"]').first();
  await primary.waitFor({ state: "attached", timeout: 15000 });
  await secondary.waitFor({ state: "attached", timeout: 15000 });

  await secondary.evaluate((video) => {
    video.currentTime = 0;
  });
  await primary.evaluate((video) => {
    video.currentTime = 1.75;
    video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  });
  try {
    await page.waitForFunction(
      () => {
        const primaryVideo = document.querySelector('video[data-preview-sync-role="primary"]');
        const secondaryVideo = document.querySelector('video[data-preview-sync-role="secondary"]');
        return Boolean(
          primaryVideo &&
          secondaryVideo &&
          Math.abs(primaryVideo.currentTime - secondaryVideo.currentTime) < 0.05
        );
      },
      null,
      { timeout: 15000 }
    );
  } catch (error) {
    const state = await page.evaluate(() => {
      const primaryVideo = document.querySelector('video[data-preview-sync-role="primary"]');
      const secondaryVideo = document.querySelector('video[data-preview-sync-role="secondary"]');
      return {
        primaryTime: primaryVideo?.currentTime ?? null,
        secondaryTime: secondaryVideo?.currentTime ?? null,
        primaryDuration: primaryVideo?.duration ?? null,
        secondaryDuration: secondaryVideo?.duration ?? null
      };
    });
    throw new Error(`comparison videos did not sync: ${JSON.stringify(state)}`, {
      cause: error
    });
  }
}

async function assertResetWorkbench(page) {
  await page.getByRole("button", { name: "Reset Workbench" }).click();
  await waitForBody(page, "Ready");
  await waitForBody(page, "Select footage");
  await waitForBody(page, "Choose output file");
  await expectBodyMissing(page, artifactPath);
  await expectBodyMissing(page, inputPath);
  await expectBodyMissing(page, "Resolution 2048");
  await expectBodyMissing(page, "Tiling forced");
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

async function expectBodyMissing(page, unexpectedText) {
  const body = await bodyText(page);
  assert(
    !body.toLowerCase().includes(unexpectedText.toLowerCase()),
    `Expected body to omit "${unexpectedText}". Body was:\n${body}`
  );
}

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 15000 });
}

function createStaticServer(root) {
  return createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const relativePath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
    let filePath = path.resolve(root, relativePath);

    if (!filePath.startsWith(root)) {
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

function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  return "application/octet-stream";
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

  throw new Error("Smoke server did not report a local URL.");
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

function isExpectedSmokeConsoleError(text) {
  return (
    text.startsWith("Not allowed to load local resource: file:///C:/Smoke/") ||
    text.includes("net::ERR_NO_BUFFER_SPACE")
  );
}

function revisionNumber(name) {
  const match = name.match(/-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}
