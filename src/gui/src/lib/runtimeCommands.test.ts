import { describe, expect, test } from "vitest";
import type { RuntimeReadiness } from "@/lib/engine";
import { runtimeCommandCenterRows, runtimeCommandCopyText } from "@/lib/runtimeCommands";
import { normalizeOutputRecipe } from "@/lib/outputRecipe";
import type { AdvancedProcessingSettings } from "@/lib/advancedSettings";

describe("runtime command center", () => {
  test("exposes safe runtime commands and gates maintainer commands", () => {
    const rows = runtimeCommandCenterRows(readinessWithMixedCommandResults());

    expect(rows.map((row) => [row.command, row.policy, row.state])).toEqual([
      ["info", "safe", "ok"],
      ["doctor", "safe", "ok"],
      ["models", "safe", "error"],
      ["presets", "safe", "ok"],
      ["check-update", "safe", "ok"],
      ["process", "safe", "ok"],
      ["benchmark", "safe", "disabled"],
      ["download", "gated", "disabled"],
      ["compile-context", "gated", "disabled"]
    ]);
  });

  test("builds copyable JSON for probed command results", () => {
    const rows = runtimeCommandCenterRows(readinessWithMixedCommandResults());
    const doctor = rows.find((row) => row.command === "doctor");

    expect(runtimeCommandCopyText(doctor)).toContain("Runtime usable with missing model packs");
  });

  test("builds copyable JSON for the active process summary", () => {
    const rows = runtimeCommandCenterRows(readinessWithMixedCommandResults(), {
      processRequest: {
        input: "C:\\Shots\\input.mov",
        inputSourceMode: "file",
        output: "C:\\Shots\\result.mov",
        hint: "C:\\Shots\\hint.mov",
        preset: "preview",
        model: null,
        videoEncode: "balanced",
        outputRecipe: normalizeOutputRecipe({
          artifactFamily: "movie",
          previewBackground: "solid",
          previewSolidColor: "#101010"
        }),
        advancedSettings: {
          qualityFallback: "coarse_to_fine",
          refinementMode: "tiled",
          precision: "fp16",
          resolution: 2048,
          batchSize: 2,
          despill: 0.25,
          despeckle: true,
          tiled: true
        } satisfies AdvancedProcessingSettings
      }
    });
    const process = rows.find((row) => row.command === "process");

    expect(process?.state).toBe("ok");
    const copied = JSON.parse(runtimeCommandCopyText(process));
    expect(copied.result.value.request.input).toBe("C:\\Shots\\input.mov");
    expect(copied.result.value.request.inputSourceMode).toBe("file");
    expect(copied.result.value.request.hint).toBe("C:\\Shots\\hint.mov");
    expect(copied.result.value.request.outputRecipe.previewSolidColor).toBe("#101010");
    expect(copied.result.value.request.advancedSettings.resolution).toBe(2048);
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
