import { describe, expect, test } from "vitest";
import type { RuntimeReadiness } from "@/lib/engine";
import { runtimeCommandCenterRows, runtimeCommandCopyText } from "@/lib/runtimeCommands";

describe("runtime command center", () => {
  test("exposes safe runtime commands and gates maintainer commands", () => {
    const rows = runtimeCommandCenterRows(readinessWithMixedCommandResults());

    expect(rows.map((row) => [row.command, row.policy, row.state])).toEqual([
      ["info", "safe", "ok"],
      ["doctor", "safe", "ok"],
      ["models", "safe", "error"],
      ["presets", "safe", "ok"],
      ["check-update", "safe", "planned"],
      ["process", "safe", "planned"],
      ["benchmark", "safe", "planned"],
      ["download", "gated", "disabled"],
      ["compile-context", "gated", "disabled"]
    ]);
  });

  test("builds copyable JSON for probed command results", () => {
    const rows = runtimeCommandCenterRows(readinessWithMixedCommandResults());
    const doctor = rows.find((row) => row.command === "doctor");

    expect(runtimeCommandCopyText(doctor)).toContain("Runtime usable with missing model packs");
  });
});

function readinessWithMixedCommandResults(): RuntimeReadiness {
  return {
    status: "degraded",
    runtime_path: "C:\\CorridorKey\\ck-engine.exe",
    searched_roots: ["C:\\CorridorKey"],
    info: {
      command: "info",
      ok: true,
      value: {
        version: "test-runtime",
        devices: [{ backend: "tensorrt", memory_mb: 10051, name: "RTX 3080" }]
      },
      error: null
    },
    doctor: {
      command: "doctor",
      ok: true,
      value: {
        summary: { healthy: false, message: "Runtime usable with missing model packs" }
      },
      error: null
    },
    models: {
      command: "models",
      ok: false,
      value: null,
      error: {
        command: "models",
        exit_code: 7,
        kind: "non_zero_exit",
        message: "Model probe failed",
        stderr: "missing model pack",
        stdout: null
      }
    },
    presets: {
      command: "presets",
      ok: true,
      value: { presets: [] },
      error: null
    }
  };
}
