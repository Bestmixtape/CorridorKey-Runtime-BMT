import { create } from "zustand";
import {
  DeviceInfo,
  DoctorReport,
  RuntimeCatalogEntry,
  RuntimeModelsCatalog,
  RuntimeReadiness,
  SystemInfo,
  firstRuntimeError,
  formatRuntimeError,
  getRuntimeReadiness,
} from "@/lib/engine";

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
    return catalogEntries(get().readiness?.presets.value, "presets");
  },

  getMissingModels: () => {
    const readiness = get().readiness;
    const modelsValue = readiness?.models.value;
    const doctorValue = readiness?.doctor.value;
    const directMissing = modelMissingList(modelsValue);
    if (directMissing.length > 0) return directMissing;
    return doctorMissingList(doctorValue);
  },

  getSupportedTracks: () => {
    const readiness = get().readiness;
    const modelsValue = readiness?.models.value;
    if (isModelsCatalog(modelsValue) && Array.isArray(modelsValue.supported_tracks)) {
      return modelsValue.supported_tracks;
    }
    if (Array.isArray(readiness?.doctor.value?.supported_tracks)) {
      return readiness.doctor.value.supported_tracks;
    }
    if (Array.isArray(readiness?.info.value?.supported_tracks)) {
      return readiness.info.value.supported_tracks;
    }
    return uniqueStrings(
      catalogEntries(modelsValue, "models")
        .map((model) => stringField(model.screen_color))
        .filter(Boolean)
    );
  },

  getDoctorSummary: () => {
    const summary = get().readiness?.doctor.value?.summary;
    if (!summary) return null;
    if (summary.healthy === false || summary.video_healthy === false) {
      return typeof summary.message === "string" && summary.message.length > 0
        ? summary.message
        : "Runtime prerequisites need attention";
    }
    if (typeof summary.message === "string" && summary.message.length > 0) {
      return summary.message;
    }
    if (summary.healthy === true && summary.video_healthy === true) {
      return "Runtime ready";
    }
    return null;
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

function catalogEntries(
  value: RuntimeReadiness["models"]["value"] | RuntimeReadiness["presets"]["value"] | null | undefined,
  key: "models" | "presets"
): RuntimeCatalogEntry[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const entries = value[key];
  return Array.isArray(entries) ? (entries as RuntimeCatalogEntry[]) : [];
}

function modelChoices(readiness: RuntimeReadiness | null): RuntimeCatalogEntry[] {
  if (!readiness || readiness.status === "error") {
    return [];
  }

  const catalogModels = catalogEntries(readiness.models.value, "models");
  const doctorModels = doctorModelEntries(readiness.doctor.value);
  const doctorByFilename = new Map(
    doctorModels
      .map((model) => [modelIdentity(model), model] as const)
      .filter(([identity]) => identity.length > 0)
  );

  const models = catalogModels.length > 0
    ? catalogModels.map((model) => {
        const doctorModel = doctorByFilename.get(modelIdentity(model));
        return doctorModel ? { ...model, ...doctorModel } : model;
      })
    : doctorModels;

  return models.filter(isUsableModelChoice);
}

function doctorModelEntries(value: DoctorReport | null | undefined): RuntimeCatalogEntry[] {
  const models = value?.models;
  if (Array.isArray(models)) {
    return models;
  }
  if (isModelsCatalog(models)) {
    return catalogEntries(models, "models");
  }
  return [];
}

function isUsableModelChoice(model: RuntimeCatalogEntry): boolean {
  const artifactState = isRecord(model.artifact_state) ? model.artifact_state : null;
  const hasRuntimeState =
    "found" in model ||
    "usable" in model ||
    "path" in model ||
    artifactState !== null;

  if (!hasRuntimeState) {
    return false;
  }
  if (model.found === false || model.usable === false) {
    return false;
  }
  if (artifactState?.present === false || artifactState?.certified_for_active_device === false) {
    return false;
  }
  return true;
}

function modelIdentity(model: RuntimeCatalogEntry): string {
  return (
    stringField(model.filename) ||
    stringField(model.id) ||
    stringField(model.name) ||
    stringField(model.path)
  );
}

function modelMissingList(
  value: RuntimeModelsCatalog | RuntimeCatalogEntry[] | null | undefined
): string[] {
  if (!isModelsCatalog(value) || !Array.isArray(value.missing_models)) {
    return [];
  }
  return value.missing_models;
}

function doctorMissingList(value: DoctorReport | null | undefined): string[] {
  const models = value?.models;
  if (Array.isArray(models)) {
    return models
      .filter((model) => model.found === false || model.usable === false)
      .map((model) =>
        stringField(model.filename) ||
        stringField(model.name) ||
        stringField(model.id) ||
        stringField(model.path)
      )
      .filter(Boolean);
  }

  const missing = models?.missing_models;
  return Array.isArray(missing) ? missing : [];
}

function isModelsCatalog(
  value: RuntimeModelsCatalog | RuntimeCatalogEntry[] | null | undefined
): value is RuntimeModelsCatalog {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
