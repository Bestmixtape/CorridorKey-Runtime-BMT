import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guiRoot = path.resolve(scriptDir, "..");
const downloadsPath = "C:\\Users\\Smoke\\Downloads";
const greenModelName = "corridorkey_fp16_1024.onnx";
const blueModelName = "corridorkey_dynamic_blue_fp16.ts";

let runtimePath = "";

const scenarios = [
  {
    name: "success",
    statusText: "runtime ready",
    workflow: async (page) => {
      await assertSelectOptions(page, 0, ["Fast Green", "Quality Blue"]);
      await assertSelectOptions(page, 1, [
        "Runtime preset default",
        greenModelName,
        blueModelName
      ]);
      assert.equal(
        await page.locator("select").nth(1).inputValue(),
        "",
        "model selector should let the runtime preset choose by default"
      );
    },
    diagnostics: async (_page, body) => {
      assertContains(body, "Runtime ready", "success diagnostics summary");
      assertContains(body, runtimePath, "success runtime path");
      assertContains(body, "RTX Smoke 4090", "success device list");
      assertContains(body, "ok", "success command status");
    }
  },
  {
    name: "missing_runtime",
    statusText: "runtime missing",
    diagnostics: async (_page, body) => {
      assertContains(body, "Runtime path not resolved", "missing runtime path");
      assertContains(body, "missing_runtime", "missing runtime command status");
    }
  },
  {
    name: "missing_models",
    statusText: "runtime needs attention",
    workflow: async (page) => {
      await assertSelectOptions(page, 1, ["Runtime preset default", greenModelName]);
      await assertSelectOptionsMissing(page, 1, [blueModelName]);
    },
    diagnostics: async (_page, body) => {
      assertContains(body, "Runtime usable with missing model packs", "missing model summary");
      assertContains(body, blueModelName, "missing model filename");
      assertContains(body, "Repair or reinstall the desktop runtime package", "missing model recovery");
      assertContains(body, "unsupported", "unsupported backend capability");
    }
  },
  {
    name: "invalid_json",
    statusText: "runtime error",
    diagnostics: async (_page, body) => {
      assertContains(body, "invalid_json", "invalid JSON command status");
      assertContains(body, "Runtime command `models` returned invalid JSON", "invalid JSON error");
    }
  },
  {
    name: "nonzero_doctor",
    statusText: "runtime error",
    diagnostics: async (_page, body) => {
      assertContains(body, "non_zero_exit", "non-zero doctor command status");
      assertContains(body, "CUDA Toolkit 12.8 not found", "non-zero doctor stderr");
    }
  }
];

const fakeRuntime = createFakeRuntime();
const server = await createServer({
  root: guiRoot,
  configFile: path.join(guiRoot, "vite.config.ts"),
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false
  }
});

let browser;

try {
  runtimePath = fakeRuntime.executablePath;
  await server.listen();
  const baseUrl = resolveServerUrl(server);
  browser = await chromium.launch({
    headless: true,
    executablePath: findChromiumExecutable()
  });

  for (const scenario of scenarios) {
    await runScenario(browser, baseUrl, scenario, fakeRuntime);
    console.log(`[smoke] ${scenario.name}`);
  }
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
  rmSync(fakeRuntime.root, { recursive: true, force: true });
}

async function runScenario(browserInstance, baseUrl, scenario, runtime) {
  const context = await browserInstance.newContext({
    viewport: { width: 1366, height: 900 }
  });
  const page = await context.newPage();
  const pageErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.exposeFunction("__corridorkeySmokeInvoke", async (command, args) => {
    return handleInvoke(runtime, scenario.name, command, args);
  });
  await page.addInitScript(() => {
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
    await waitForBody(page, scenario.statusText);
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
    assert.deepEqual(pageErrors, [], `${scenario.name} emitted page errors`);
  } finally {
    await context.close();
  }
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
const greenModelName = ${JSON.stringify(greenModelName)};
const blueModelName = ${JSON.stringify(blueModelName)};

const modelPath = (filename) => path.join(root, "models", filename);
const greenCatalog = () => ({
  id: "green",
  filename: greenModelName,
  name: "Green Matting",
  screen_color: "green",
  recommended_backend: "tensorrt",
  packaged_for_windows: true
});
const blueCatalog = () => ({
  id: "blue",
  filename: blueModelName,
  name: "Blue Matting",
  screen_color: "blue",
  recommended_backend: "torchtrt",
  packaged_for_windows: true
});
const doctorModel = (model, usable) => ({
  ...model,
  path: modelPath(model.filename),
  found: usable,
  usable,
  artifact_status: usable ? "ok" : "missing",
  artifact_error: usable ? "" : "model pack missing",
  artifact_state: {
    present: usable,
    certified_for_active_device: usable
  }
});
const baseInfo = (supportedBackends) => ({
  version: "smoke-runtime",
  devices: [
    {
      name: "RTX Smoke 4090",
      memory_mb: 24576,
      backend: "tensorrt"
    }
  ],
  capabilities: {
    supported_backends: supportedBackends,
    cpu_fallback_available: supportedBackends.includes("cpu")
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

const payloads = {
  success: {
    info: baseInfo(["tensorrt", "cpu"]),
    doctor: {
      summary: { healthy: true, video_healthy: true, message: "Runtime ready" },
      supported_tracks: ["green", "blue"],
      models: [doctorModel(greenCatalog(), true), doctorModel(blueCatalog(), true)]
    },
    models: {
      supported_tracks: ["green", "blue"],
      missing_models: [],
      missing_count: 0,
      models: [greenCatalog(), blueCatalog()]
    },
    presets: {
      presets: [fastGreenPreset(), qualityBluePreset()]
    }
  },
  missing_models: {
    info: baseInfo(["cpu"]),
    doctor: {
      summary: {
        healthy: false,
        video_healthy: false,
        message: "Runtime usable with missing model packs"
      },
      supported_tracks: ["green"],
      models: [doctorModel(greenCatalog(), true), doctorModel(blueCatalog(), false)]
    },
    models: {
      supported_tracks: ["green"],
      missing_models: [blueModelName],
      missing_count: 1,
      models: [greenCatalog(), blueCatalog()]
    },
    presets: {
      presets: [fastGreenPreset()]
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

async function assertSelectOptions(page, index, expectedLabels) {
  const labels = await page.locator("select").nth(index).locator("option").allTextContents();
  for (const expected of expectedLabels) {
    assert(
      labels.some((label) => label.includes(expected)),
      `select ${index} did not include ${expected}. Saw: ${labels.join(", ")}`
    );
  }
}

async function assertSelectOptionsMissing(page, index, rejectedLabels) {
  const labels = await page.locator("select").nth(index).locator("option").allTextContents();
  for (const rejected of rejectedLabels) {
    assert(
      labels.every((label) => !label.includes(rejected)),
      `select ${index} should not include ${rejected}. Saw: ${labels.join(", ")}`
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
    throw new Error(`Timed out waiting for "${expectedText}". Body was:\n${body}`, {
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

function assertNoFallback(body, scenarioName) {
  assert(!body.includes("Engine Standby"), `${scenarioName} rendered Engine Standby fallback`);
  assert(!body.includes("CPU Baseline"), `${scenarioName} rendered CPU Baseline fallback`);
}

function resolveServerUrl(viteServer) {
  const address = viteServer.httpServer?.address();
  if (address && typeof address === "object") {
    return `http://127.0.0.1:${address.port}/`;
  }

  const localUrl = viteServer.resolvedUrls?.local?.[0];
  if (localUrl) {
    return localUrl;
  }

  throw new Error("Vite did not report a local server URL.");
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
