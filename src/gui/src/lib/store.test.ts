import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getRuntimeReadiness } from "@/lib/engine";
import { useEngineStore } from "@/lib/store";
import type { RuntimeCommandError, RuntimeCommandResult, RuntimeReadiness } from "@/lib/engine";

vi.mock("@/lib/engine", () => ({
  getRuntimeReadiness: vi.fn(),
  firstRuntimeError: (readiness: RuntimeReadiness) =>
    readiness.info.error ||
    readiness.doctor.error ||
    readiness.models.error ||
    readiness.presets.error ||
    null,
  formatRuntimeError: (error: unknown) =>
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error)
}));

const mockedGetRuntimeReadiness = vi.mocked(getRuntimeReadiness);

describe("engine store readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedGetRuntimeReadiness.mockReset();
    useEngineStore.setState(useEngineStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("recovers in the same launch when the first runtime probe is transiently missing", async () => {
    mockedGetRuntimeReadiness
      .mockResolvedValueOnce(missingRuntimeReadiness())
      .mockResolvedValueOnce(readyRuntimeReadiness());

    const refresh = useEngineStore.getState().refreshReadiness();
    await vi.runAllTimersAsync();
    await refresh;

    expect(mockedGetRuntimeReadiness).toHaveBeenCalledTimes(2);
    expect(useEngineStore.getState().readiness?.runtime_path).toBe(
      "C:\\CorridorKey\\Runtime\\Contents\\Win64\\ck-engine.exe"
    );
    expect(useEngineStore.getState().error).toBeNull();
  });

  test("does not retry a real runtime command failure", async () => {
    mockedGetRuntimeReadiness.mockResolvedValueOnce(nonZeroRuntimeReadiness());

    await useEngineStore.getState().refreshReadiness();

    expect(mockedGetRuntimeReadiness).toHaveBeenCalledTimes(1);
    expect(useEngineStore.getState().readiness?.runtime_path).toBe(
      "C:\\CorridorKey\\Runtime\\Contents\\Win64\\ck-engine.exe"
    );
    expect(useEngineStore.getState().error).toBe("Runtime command `doctor` exited with status 1.");
  });
});

function missingRuntimeReadiness(): RuntimeReadiness {
  const error: RuntimeCommandError = {
    kind: "missing_runtime",
    command: "runtime",
    message: "Engine binary not found.",
    stderr: null,
    stdout: null,
    exit_code: null
  };

  return {
    status: "error",
    runtime_path: null,
    searched_roots: ["C:\\Program Files\\CorridorKey\\GUI"],
    info: failedCommand("info", error),
    doctor: failedCommand("doctor", error),
    models: failedCommand("models", error),
    presets: failedCommand("presets", error)
  };
}

function readyRuntimeReadiness(): RuntimeReadiness {
  return {
    status: "ready",
    runtime_path: "C:\\CorridorKey\\Runtime\\Contents\\Win64\\ck-engine.exe",
    searched_roots: ["C:\\CorridorKey\\Runtime\\Contents\\Win64"],
    info: {
      command: "info",
      ok: true,
      value: {
        active_device: {
          backend: "tensorrt",
          memory_mb: 10051,
          name: "NVIDIA GeForce RTX 3080 (TensorRT)"
        },
        devices: []
      },
      error: null
    },
    doctor: successfulCommand("doctor", { summary: { healthy: true, video_healthy: true } }),
    models: successfulCommand("models", { models: [], missing_count: 0 }),
    presets: successfulCommand("presets", { presets: [] })
  };
}

function nonZeroRuntimeReadiness(): RuntimeReadiness {
  const error: RuntimeCommandError = {
    kind: "non_zero_exit",
    command: "doctor",
    message: "Runtime command `doctor` exited with status 1.",
    stderr: null,
    stdout: null,
    exit_code: 1
  };

  return {
    ...readyRuntimeReadiness(),
    status: "error",
    doctor: failedCommand("doctor", error)
  };
}

function failedCommand<TValue = unknown>(
  command: string,
  error: RuntimeCommandError
): RuntimeCommandResult<TValue> {
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

function successfulCommand<TValue>(command: string, value: TValue): RuntimeCommandResult<TValue> {
  return {
    command,
    ok: true,
    value,
    error: null
  };
}
