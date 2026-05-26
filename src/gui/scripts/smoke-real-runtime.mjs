import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guiRoot = path.resolve(scriptDir, "..");
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

for (const requiredPath of [runtimePath, inputPath, hintPath, modelPath]) {
  assert(existsSync(requiredPath), `Required smoke input is missing: ${requiredPath}`);
}

mkdirSync(outputDir, { recursive: true });
rmSync(outputPath, { force: true });

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

console.log(`[smoke] real runtime 2048 ${outputPath}`);

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
