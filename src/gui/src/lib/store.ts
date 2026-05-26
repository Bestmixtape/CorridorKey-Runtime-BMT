import { create } from "zustand";
import {
  DeviceInfo,
  RuntimeCatalogEntry,
  RuntimeReadiness,
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
      const readiness = await withTimeout(getRuntimeReadiness(), 15000);
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Runtime probe timeout")), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
