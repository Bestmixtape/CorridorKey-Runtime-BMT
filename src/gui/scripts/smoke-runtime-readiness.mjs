import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  chmodSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guiRoot = path.resolve(scriptDir, "..");
const distRoot = path.join(guiRoot, "dist");
const downloadsPath = "C:\\Users\\Smoke\\Downloads";
const macModelName = "corridorkey_mlx.safetensors";
const greenModelName = "corridorkey_fp16_1024.onnx";
const blueModelName = "corridorkey_dynamic_blue_fp16.ts";
const reference768ModelName = "corridorkey_fp16_768.onnx";
const referenceFp32ModelName = "corridorkey_fp32_1024.onnx";
const outputRecipeCapabilities = {
  artifact_families: ["movie", "exr_sequence"],
  movie_alpha_modes: ["composited_preview"],
  exr_sequence_outputs: ["matte_exr", "foreground_exr", "processed_exr", "comp_png"],
  replacement_media_output: false,
  color_intents: ["runtime_default"]
};

let runtimePath = "";

const scenarios = [
  {
    name: "success",
    statusText: "runtime ready",
    workflow: async (page) => {
      await assertSelectOptions(page, "Preset", ["Fast Green", "Quality Blue"]);
      await assertSelectOptionsMissing(page, "Preset", ["Mac Balanced", "Mac Ultra Quality"]);
      await assertSelectOptions(page, "Model", [
        "Runtime preset default",
        greenModelName,
        blueModelName
      ]);
      await assertSelectOptionsMissing(page, "Model", [macModelName]);
      assert.equal(
        await page.getByLabel("Model").inputValue(),
        "",
        "model selector should let the runtime preset choose by default"
      );
    },
    diagnostics: async (page, body) => {
      assertContains(body, "Runtime ready", "success diagnostics summary");
      assertContains(body, runtimePath, "success runtime path");
      assertContains(body, "RTX Smoke 4090", "success device list");
      assertContains(body, "ok", "success command status");
      await page.getByRole("button", { name: /Copy Doctor JSON/i }).click();
      const copied = await page.evaluate(() => window.__corridorkeyClipboard || "");
      assertContains(copied, "Runtime ready", "copied doctor JSON");
    },
    settings: async (page, body) => {
      assertContains(body, "Workflow Defaults", "settings title");
      assertContains(body, "Output Encoding", "settings encoding section");
      assertContains(body, "Output Recipe", "settings output recipe section");
      assertContains(body, "Workflow advanced controls", "settings advanced pointer");
      assertContains(body, "GUI default", "settings GUI default status");
      assert(
        !body.includes("Auto-Enabled"),
        `settings should not render stale tiling copy. Body was:\n${body}`
      );
      assert(
        !body.includes("professional VFX-grade"),
        `settings should not render marketing placeholder copy. Body was:\n${body}`
      );
      assert(
        !body.includes("Runtime-backed"),
        `settings should not label local defaults as runtime-backed. Body was:\n${body}`
      );
    },
    support: async (_page, body) => {
      assertContains(body, "Runtime recovery", "support recovery title");
      assertContains(body, "Runtime ready", "support ready state");
      assertContains(body, "No missing model packs reported", "support model state");
      assertMissing(body, "Community & Support", "support placeholder title");
    }
  },
  {
    name: "missing_runtime",
    statusText: "runtime missing",
    diagnostics: async (_page, body) => {
      assertContains(body, "Runtime path not resolved", "missing runtime path");
      assertContains(body, "missing_runtime", "missing runtime command status");
    },
    settings: async (_page, body) => {
      assertContains(body, "Workflow Defaults", "missing runtime settings title");
      assertContains(body, "GUI default", "missing runtime settings default label");
      assertMissing(body, "Runtime-backed", "missing runtime settings runtime-backed label");
    },
    support: async (_page, body) => {
      assertContains(body, "Runtime package repair", "missing runtime support title");
      assertContains(body, "Runtime binary is missing", "missing runtime support error");
      assertContains(body, "Repair or reinstall", "missing runtime support action");
      assertContains(body, "Model pack state not reported", "missing runtime model state");
      assertMissing(body, "installed", "missing runtime model installed claim");
    }
  },
  {
    name: "missing_models",
    statusText: "runtime usable",
    workflow: async (page) => {
      await assertSelectOptions(page, "Model", ["Runtime preset default", greenModelName]);
      await assertSelectOptionsMissing(page, "Preset", ["Quality Blue", "Mac Balanced"]);
      await assertSelectOptionsMissing(page, "Model", [blueModelName, macModelName]);
    },
    diagnostics: async (_page, body) => {
      assertContains(body, "Runtime usable with missing model packs", "missing model summary");
      assertContains(body, blueModelName, "missing model filename");
      assertMissing(body, reference768ModelName, "retired 768px reference artifact");
      assertMissing(body, referenceFp32ModelName, "fp32 reference artifact");
      assertContains(body, "Repair or reinstall the desktop runtime package", "missing model recovery");
      assertContains(body, "unsupported", "unsupported backend capability");
    },
    support: async (_page, body) => {
      assertContains(body, "Missing model packs", "missing model support title");
      assertContains(body, blueModelName, "missing model support filename");
      assertContains(body, "package-runtime payload", "missing model support repair");
    }
  },
  {
    name: "invalid_json",
    statusText: "runtime error",
    diagnostics: async (_page, body) => {
      assertContains(body, "invalid_json", "invalid JSON command status");
      assertContains(body, "Runtime command `models` returned invalid JSON", "invalid JSON error");
    },
    support: async (_page, body) => {
      assertContains(body, "Runtime command failed", "invalid JSON support title");
      assertContains(body, "models", "invalid JSON support command");
      assertContains(body, "invalid_json", "invalid JSON support kind");
    }
  },
  {
    name: "nonzero_doctor",
    statusText: "runtime error",
    diagnostics: async (_page, body) => {
      assertContains(body, "non_zero_exit", "non-zero doctor command status");
      assertContains(body, "CUDA Toolkit 12.8 not found", "non-zero doctor stderr");
    },
    support: async (_page, body) => {
      assertContains(body, "Runtime command failed", "non-zero support title");
      assertContains(body, "doctor", "non-zero support command");
      assertContains(body, "CUDA Toolkit 12.8 not found", "non-zero support stderr");
    }
  }
];

assert(existsSync(path.join(distRoot, "index.html")), "Build the GUI before smoke tests: pnpm build");

const fakeRuntime = createFakeRuntime();
const server = createStaticServer(distRoot);

let browser;
let context;

try {
  runtimePath = fakeRuntime.executablePath;
  await listenServer(server);
  const baseUrl = resolveServerUrl(server);
  browser = await chromium.launch({
    headless: true,
    executablePath: findChromiumExecutable()
  });
  context = await browser.newContext({
    viewport: { width: 1366, height: 900 }
  });

  for (const scenario of scenarios) {
    await runScenario(context, baseUrl, scenario, fakeRuntime);
    console.log(`[smoke] ${scenario.name}`);
  }
} finally {
  if (context) {
    await context.close();
  }
  if (browser) {
    await browser.close();
  }
  await closeServer(server);
  rmSync(fakeRuntime.root, { recursive: true, force: true });
}

async function runScenario(context, baseUrl, scenario, runtime) {
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? ""}`);
  });

  await page.exposeFunction("__corridorkeySmokeInvoke", async (command, args) => {
    return handleInvoke(runtime, scenario.name, command, args);
  });
  await page.addInitScript(() => {
    window.__corridorkeyClipboard = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text) => {
          window.__corridorkeyClipboard = text;
          return Promise.resolve();
        }
      }
    });
    globalThis.__TAURI_INTERNALS__ = {
      invoke: (command, args, options) => globalThis.__corridorkeySmokeInvoke(command, args, options),
      transformCallback: () => 1,
      unregisterCallback: () => {},
      convertFileSrc: (filePath) => filePath
    };
    globalThis.isTauri = true;
  });

  try {
    await page.goto(`${baseUrl}?smoke=${scenario.name}`, { waitUntil: "domcontentloaded" });
    try {
      await waitForBody(page, scenario.statusText);
      await assertSidebarCollapse(page);
    } catch (error) {
      const diagnostics = [...pageErrors, ...consoleErrors, ...requestFailures];
      if (diagnostics.length > 0) {
        throw new Error(`${scenario.name} emitted browser errors before readiness: ${diagnostics.join(" | ")}`, {
          cause: error
        });
      }
      throw error;
    }
    const workflowBody = await bodyText(page);
    assertNoFallback(workflowBody, scenario.name);
    if (scenario.workflow) {
      await scenario.workflow(page);
    }

    await page.getByRole("button", { name: "Hardware" }).click();
    await waitForBody(page, "runtime diagnostics");
    const diagnosticsBody = await bodyText(page);
    assertNoFallback(diagnosticsBody, scenario.name);
    await scenario.diagnostics(page, diagnosticsBody);
    if (scenario.settings) {
      await page.getByRole("button", { name: "Settings" }).click();
      await waitForBody(page, "workflow defaults");
      const settingsBody = await bodyText(page);
      assertNoFallback(settingsBody, scenario.name);
      await scenario.settings(page, settingsBody);
    }
    if (scenario.support) {
      await page.getByRole("button", { name: "Support" }).click();
      await waitForBody(page, "runtime recovery");
      const supportBody = await bodyText(page);
      assertNoFallback(supportBody, scenario.name);
      await scenario.support(page, supportBody);
    }
    assert.deepEqual(pageErrors, [], `${scenario.name} emitted page errors`);
    assert.deepEqual(consoleErrors, [], `${scenario.name} emitted console errors`);
    assert.deepEqual(requestFailures, [], `${scenario.name} emitted request failures`);
  } finally {
    await page.close();
  }
}

async function assertSidebarCollapse(page) {
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
}

function handleInvoke(runtime, scenarioName, command, args) {
  if (command === "get_runtime_readiness") {
    return collectRuntimeReadiness(runtime, scenarioName);
  }

  if (command === "plugin:path|resolve_directory") {
    return downloadsPath;
  }

  if (command === "plugin:path|join" || command === "plugin:path|resolve") {
    return Array.isArray(args?.paths) ? args.paths.join("\\") : downloadsPath;
  }

  if (command === "create_preview_proxy") {
    return {
      source_path: args.source,
      path: args.source.replace(/\.mov$/i, "_preview.mp4"),
      reused: false
    };
  }

  if (command === "allow_preview_asset") {
    return null;
  }

  throw new Error(`Unexpected Tauri command in smoke test: ${command}`);
}

function collectRuntimeReadiness(runtime, scenarioName) {
  if (scenarioName === "missing_runtime") {
    return missingRuntimeReadiness(runtime.missingExecutablePath);
  }

  const info = runRuntimeJson(runtime, scenarioName, "info");
  const doctor = runRuntimeJson(runtime, scenarioName, "doctor");
  const models = runRuntimeJson(runtime, scenarioName, "models");
  const presets = runRuntimeJson(runtime, scenarioName, "presets");

  return {
    status: readinessStatus(info, doctor, models, presets),
    runtime_path: runtime.executablePath,
    searched_roots: [runtime.root],
    info,
    doctor,
    models,
    presets
  };
}

function missingRuntimeReadiness(missingPath) {
  const error = {
    kind: "missing_runtime",
    command: "runtime",
    message: `Runtime binary is missing: ${missingPath}`,
    stderr: null,
    stdout: null,
    exit_code: null
  };
  return {
    status: "error",
    runtime_path: null,
    searched_roots: [missingPath],
    info: missingRuntimeResult("info", error),
    doctor: missingRuntimeResult("doctor", error),
    models: missingRuntimeResult("models", error),
    presets: missingRuntimeResult("presets", error)
  };
}

function missingRuntimeResult(command, error) {
  return {
    command,
    ok: false,
    value: null,
    error: {
      ...error,
      command
    }
  };
}

function runRuntimeJson(runtime, scenarioName, command) {
  const output = spawnSync(runtime.executablePath, [command, "--json"], {
    cwd: runtime.root,
    encoding: "utf8",
    env: {
      ...process.env,
      CK_SMOKE_SCENARIO: scenarioName
    },
    shell: process.platform === "win32"
  });

  if (output.error) {
    return commandFailure(command, {
      kind: "spawn_failed",
      command,
      message: `Could not start ${runtime.executablePath}: ${output.error.message}`,
      stderr: null,
      stdout: null,
      exit_code: null
    });
  }

  const stdout = output.stdout ?? "";
  const stderr = output.stderr ?? "";
  if (output.status !== 0) {
    return commandFailure(command, {
      kind: "non_zero_exit",
      command,
      message: `Runtime command \`${command}\` exited with status exit code: ${output.status}.`,
      stderr: stderr.trim().length > 0 ? stderr : null,
      stdout: stdout.trim().length > 0 ? stdout : null,
      exit_code: output.status
    });
  }

  try {
    return {
      command,
      ok: true,
      value: JSON.parse(stdout),
      error: null
    };
  } catch (error) {
    return commandFailure(command, {
      kind: "invalid_json",
      command,
      message: `Runtime command \`${command}\` returned invalid JSON: ${error.message}`,
      stderr: stderr.trim().length > 0 ? stderr : null,
      stdout,
      exit_code: null
    });
  }
}

function commandFailure(command, error) {
  return {
    command,
    ok: false,
    value: null,
    error
  };
}

function readinessStatus(info, doctor, models, presets) {
  if ([info, doctor, models, presets].some((result) => !result.ok)) {
    return "error";
  }
  if (doctorReportsUnhealthy(doctor) || hasMissingModels(models, doctor)) {
    return "degraded";
  }
  return "ready";
}

function doctorReportsUnhealthy(doctor) {
  return (
    doctor.value?.summary?.healthy === false ||
    doctor.value?.summary?.video_healthy === false
  );
}

function hasMissingModels(models, doctor) {
  return (
    (models.value?.missing_count ?? 0) > 0 ||
    (doctor.value?.models?.missing_count ?? 0) > 0
  );
}

function createFakeRuntime() {
  const root = mkdtempSync(path.join(os.tmpdir(), "corridorkey-gui-smoke-"));
  const scriptPath = path.join(root, "fake-runtime.mjs");
  const executablePath = path.join(
    root,
    process.platform === "win32" ? "ck-engine.cmd" : "corridorkey"
  );
  const missingExecutablePath = path.join(root, "missing-runtime");

  writeFileSync(scriptPath, fakeRuntimeSource(), "utf8");
  if (process.platform === "win32") {
    writeFileSync(
      executablePath,
      `@echo off\r\n"${process.execPath}" "%~dp0fake-runtime.mjs" %*\r\n`,
      "utf8"
    );
  } else {
    writeFileSync(
      executablePath,
      `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-runtime.mjs" "$@"\n`,
      "utf8"
    );
    chmodSync(executablePath, 0o755);
  }

  return {
    root,
    executablePath,
    missingExecutablePath
  };
}

function fakeRuntimeSource() {
  return `import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const scenario = process.env.CK_SMOKE_SCENARIO || "success";
const command = process.argv[2];
const macModelName = ${JSON.stringify(macModelName)};
const greenModelName = ${JSON.stringify(greenModelName)};
const blueModelName = ${JSON.stringify(blueModelName)};
const reference768ModelName = ${JSON.stringify(reference768ModelName)};
const referenceFp32ModelName = ${JSON.stringify(referenceFp32ModelName)};
const outputRecipeCapabilities = ${JSON.stringify(outputRecipeCapabilities)};

const modelPath = (filename) => path.join(root, "models", filename);
const greenCatalog = () => ({
  id: "green",
  filename: greenModelName,
  name: "Green Matting",
  screen_color: "green",
  recommended_backend: "tensorrt",
  installable_model_pack: true,
  packaged_for_windows: true
});
const macCatalog = () => ({
  id: "mac",
  filename: macModelName,
  name: "Mac MLX Matting",
  screen_color: "green",
  intended_platforms: ["macos_apple_silicon"],
  validated_platforms: ["macos_apple_silicon"],
  recommended_backend: "mlx",
  installable_model_pack: true,
  packaged_for_macos: true,
  packaged_for_windows: false
});
const blueCatalog = () => ({
  id: "blue",
  filename: blueModelName,
  name: "Blue Matting",
  screen_color: "blue",
  recommended_backend: "torchtrt",
  installable_model_pack: true,
  packaged_for_windows: true
});
const referenceCatalog = (filename) => ({
  filename,
  intended_platforms: ["windows_rtx_30_plus"],
  intended_use: "reference_validation",
  recommended_backend: "tensorrt",
  installable_model_pack: false,
  packaged_for_macos: false,
  packaged_for_windows: false
});
const doctorModel = (model, usable, stateOverrides = {}) => ({
  ...model,
  path: modelPath(model.filename),
  found: usable,
  usable,
  artifact_status: usable ? "usable" : "missing",
  artifact_error: usable ? "" : "model pack missing",
  artifact_state: {
    present: usable,
    certified_for_active_device: usable,
    certified_for_active_track: usable,
    packaged_for_active_track: true,
    ...stateOverrides
  }
});
const baseInfo = (supportedBackends) => ({
  version: "smoke-runtime",
  active_device: {
    name: "RTX Smoke 4090",
    memory_mb: 24576,
    backend: "tensorrt"
  },
  devices: [
    {
      name: "RTX Smoke 4090",
      memory_mb: 24576,
      backend: "tensorrt"
    }
  ],
  capabilities: {
    platform: "windows",
    supported_backends: supportedBackends,
    cpu_fallback_available: supportedBackends.includes("cpu"),
    output_recipe: outputRecipeCapabilities
  },
  supported_tracks: ["green", "blue"]
});
const fastGreenPreset = () => ({
  id: "fast_green",
  name: "Fast Green",
  recommended_backend: "tensorrt",
  recommended_model: greenModelName
});
const qualityBluePreset = () => ({
  id: "quality_blue",
  name: "Quality Blue",
  recommended_backend: "torchtrt",
  recommended_model: blueModelName
});
const macPreset = () => ({
  id: "mac-balanced",
  name: "Mac Balanced",
  default_for_macos: true,
  default_for_windows: false,
  intended_platforms: ["macos_apple_silicon"],
  validated_platforms: ["macos_apple_silicon"],
  recommended_model: macModelName
});
const macUltraPreset = () => ({
  id: "mac-ultra-quality",
  name: "Mac Ultra Quality",
  default_for_macos: false,
  default_for_windows: false,
  intended_platforms: ["macos_apple_silicon"],
  validated_platforms: ["macos_apple_silicon"],
  recommended_model: macModelName
});

const payloads = {
  success: {
    info: baseInfo(["tensorrt", "torchtrt", "cpu"]),
    doctor: {
      summary: { healthy: true, video_healthy: true, message: "Runtime ready" },
      supported_tracks: ["green", "blue"],
      models: [
        doctorModel(macCatalog(), true, {
          certified_for_active_device: false,
          certified_for_active_track: false,
          packaged_for_active_track: false
        }),
        doctorModel(greenCatalog(), true),
        doctorModel(blueCatalog(), true)
      ]
    },
    models: {
      supported_tracks: ["green", "blue"],
      missing_models: [],
      missing_count: 0,
      models: [macCatalog(), greenCatalog(), blueCatalog()]
    },
    presets: {
      presets: [macPreset(), fastGreenPreset(), qualityBluePreset(), macUltraPreset()]
    }
  },
  missing_models: {
    info: baseInfo(["tensorrt", "cpu"]),
    doctor: {
      summary: {
        healthy: false,
        video_healthy: false,
        message: "Runtime usable with missing model packs"
      },
      supported_tracks: ["green"],
      models: [
        doctorModel(macCatalog(), true, {
          certified_for_active_device: false,
          certified_for_active_track: false,
          packaged_for_active_track: false
        }),
        doctorModel(greenCatalog(), true),
        doctorModel(blueCatalog(), false),
        doctorModel(referenceCatalog(reference768ModelName), false, {
          certified_for_active_device: false,
          certified_for_active_track: false,
          packaged_for_active_track: false
        }),
        doctorModel(referenceCatalog(referenceFp32ModelName), false, {
          certified_for_active_device: false,
          certified_for_active_track: false,
          packaged_for_active_track: false
        })
      ]
    },
    models: {
      supported_tracks: ["green"],
      missing_models: [blueModelName, reference768ModelName, referenceFp32ModelName],
      missing_count: 3,
      models: [
        macCatalog(),
        greenCatalog(),
        blueCatalog(),
        referenceCatalog(reference768ModelName),
        referenceCatalog(referenceFp32ModelName)
      ]
    },
    presets: {
      presets: [macPreset(), fastGreenPreset(), qualityBluePreset()]
    }
  },
  invalid_json: {
    info: baseInfo(["tensorrt", "cpu"]),
    doctor: {
      summary: {
        healthy: true,
        video_healthy: true,
        message: "Runtime info available, but models output was not JSON."
      },
      supported_tracks: ["green"],
      models: [doctorModel(greenCatalog(), true)]
    },
    presets: {
      presets: [fastGreenPreset()]
    }
  },
  nonzero_doctor: {
    info: baseInfo(["tensorrt", "cpu"]),
    models: {
      supported_tracks: ["green"],
      missing_models: [],
      missing_count: 0,
      models: [greenCatalog()]
    },
    presets: {
      presets: [fastGreenPreset()]
    }
  }
};

if (scenario === "invalid_json" && command === "models") {
  process.stdout.write("{not-json");
  process.exit(0);
}
if (scenario === "nonzero_doctor" && command === "doctor") {
  process.stderr.write("CUDA Toolkit 12.8 not found");
  process.exit(7);
}

const payload = payloads[scenario]?.[command];
if (!payload) {
  process.stderr.write(\`unknown fake-runtime command: \${command}\`);
  process.exit(2);
}

process.stdout.write(JSON.stringify(payload));
`;
}

async function assertSelectOptions(page, label, expectedLabels) {
  const labels = await page.getByLabel(label).locator("option").allTextContents();
  for (const expected of expectedLabels) {
    assert(
      labels.some((label) => label.includes(expected)),
      `${label} select did not include ${expected}. Saw: ${labels.join(", ")}`
    );
  }
}

async function assertSelectOptionsMissing(page, label, rejectedLabels) {
  const labels = await page.getByLabel(label).locator("option").allTextContents();
  for (const rejected of rejectedLabels) {
    assert(
      labels.every((label) => !label.includes(rejected)),
      `${label} select should not include ${rejected}. Saw: ${labels.join(", ")}`
    );
  }
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
    const html = await page.locator("body").evaluate((element) => element.innerHTML).catch(() => "<html unavailable>");
    throw new Error(`Timed out waiting for "${expectedText}". Body was:\n${body}\nHTML was:\n${html}`, {
      cause: error
    });
  }
}

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 15000 });
}

function assertContains(body, expected, context) {
  assert(
    body.toLowerCase().includes(expected.toLowerCase()),
    `${context} did not include "${expected}". Body was:\n${body}`
  );
}

function assertMissing(body, expected, context) {
  assert(
    !body.toLowerCase().includes(expected.toLowerCase()),
    `${context} unexpectedly included "${expected}". Body was:\n${body}`
  );
}

function assertNoFallback(body, scenarioName) {
  assert(!body.includes("Engine Standby"), `${scenarioName} rendered Engine Standby fallback`);
  assert(!body.includes("CPU Baseline"), `${scenarioName} rendered CPU Baseline fallback`);
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

function revisionNumber(name) {
  const match = name.match(/-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}
