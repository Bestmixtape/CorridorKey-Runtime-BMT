import { create } from "zustand";
import {
  DeviceInfo,
  RuntimeCatalogEntry,
  RuntimeReadiness,
  RuntimeCommandError,
  SystemInfo,
  firstRuntimeError,
  formatRuntimeError,
  getRuntimeReadiness,
} from "@/lib/engine";
import {
  doctorSummary,
  missingModelList,
  modelChoices,
  presetChoices,
  supportedTracks
} from "@/lib/catalog";

const RUNTIME_READINESS_TIMEOUT_MS = 30000;
const RUNTIME_READINESS_RETRY_DELAYS_MS = [300, 1200];

interface EngineState {
  info: SystemInfo | null;
  readiness: RuntimeReadiness | null;
  isLoading: boolean;
  error: string | null;

  getPrimaryGpu: () => DeviceInfo | null;
  getModelChoices: () => RuntimeCatalogEntry[];
  getPresetChoices: () => RuntimeCatalogEntry[];
  getMissingModels: () => string[];
  getSupportedTracks: () => string[];
  getDoctorSummary: () => string | null;

  refreshInfo: () => Promise<void>;
  refreshReadiness: () => Promise<void>;
}

export const useEngineStore = create<EngineState>((set, get) => ({
  info: null,
  readiness: null,
  isLoading: false,
  error: null,

  getPrimaryGpu: () => {
    const devices = get().info?.devices ?? [];
    if (devices.length === 0) return null;

    return (
      devices.find((device) => device.backend === "tensorrt") ||
      devices.find((device) => device.backend === "cuda") ||
      devices.find((device) => device.backend === "dml") ||
      devices[0]
    );
  },

  getModelChoices: () => {
    return modelChoices(get().readiness);
  },

  getPresetChoices: () => {
    return presetChoices(get().readiness);
  },

  getMissingModels: () => {
    return missingModelList(get().readiness);
  },

  getSupportedTracks: () => {
    return supportedTracks(get().readiness);
  },

  getDoctorSummary: () => {
    return doctorSummary(get().readiness);
  },

  refreshInfo: async () => {
    await get().refreshReadiness();
  },

  refreshReadiness: async () => {
    set({ isLoading: true, error: null });

    try {
      const readiness = await probeRuntimeReadiness();
      const info = readiness.info.ok ? readiness.info.value : null;
      const commandError = firstRuntimeError(readiness);
      const error =
        readiness.status === "error" && commandError
          ? formatRuntimeError(commandError)
          : null;

      set({
        readiness,
        info,
        error,
        isLoading: false,
      });
    } catch (error) {
      set({
        readiness: null,
        info: null,
        error: formatRuntimeError(error),
        isLoading: false,
      });
    }
  },
}));

async function probeRuntimeReadiness(): Promise<RuntimeReadiness> {
  let lastReadiness: RuntimeReadiness | null = null;

  for (let attempt = 0; attempt <= RUNTIME_READINESS_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const readiness = await withTimeout(getRuntimeReadiness(), RUNTIME_READINESS_TIMEOUT_MS);
      if (!shouldRetryRuntimeReadiness(readiness) || attempt === RUNTIME_READINESS_RETRY_DELAYS_MS.length) {
        return readiness;
      }
      lastReadiness = readiness;
    } catch (error) {
      if (!isRetryableRuntimeProbeError(error) || attempt === RUNTIME_READINESS_RETRY_DELAYS_MS.length) {
        throw error;
      }
    }

    await delay(RUNTIME_READINESS_RETRY_DELAYS_MS[attempt]);
  }

  return lastReadiness ?? withTimeout(getRuntimeReadiness(), RUNTIME_READINESS_TIMEOUT_MS);
}

function shouldRetryRuntimeReadiness(readiness: RuntimeReadiness): boolean {
  if (readiness.status !== "error" || readiness.runtime_path) {
    return false;
  }

  return isTransientRuntimeProbeError(firstRuntimeError(readiness));
}

function isRetryableRuntimeProbeError(error: unknown): boolean {
  return error instanceof Error && error.message === "Runtime probe timeout";
}

function isTransientRuntimeProbeError(error: RuntimeCommandError | null): boolean {
  return error?.kind === "missing_runtime";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Runtime probe timeout")), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
