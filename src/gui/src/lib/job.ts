import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { downloadDir } from "@tauri-apps/api/path";
import { formatRuntimeError } from "@/lib/engine";
import {
  advancedProcessingPayload,
  DEFAULT_ADVANCED_SETTINGS,
  normalizeAdvancedSettings,
  type AdvancedProcessingSettings
} from "@/lib/advancedSettings";
import type { JobMetrics } from "@/lib/jobTelemetry";
import {
  DEFAULT_OUTPUT_RECIPE,
  normalizeOutputRecipe,
  type OutputRecipeSettings
} from "@/lib/outputRecipe";

const HISTORY_KEY = "corridorkey_history";
const MAX_HISTORY_RECORDS = 50;
const MAX_LOG_LINES = 200;

export type JobTerminalStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface JobProgress {
  type:
    | "job_started"
    | "backend_selected"
    | "progress"
    | "warning"
    | "artifact_written"
    | "completed"
    | "failed"
    | "cancelled";
  message?: string;
  progress?: number;
  phase?: string;
  backend?: string;
  artifact_path?: string;
  error?: {
    code?: number;
    message?: string;
  };
  fallback?: {
    reason?: string;
  };
  timings?: Array<{
    name?: string;
    total_ms?: number;
    avg_ms?: number;
    sample_count?: number;
  }>;
  metrics?: JobMetrics;
}

export interface JobRecord {
  id: string;
  timestamp: string;
  completed_at?: string;
  input: string;
  output: string;
  status: "success" | "failed";
  backend: string | null;
  preset?: string | null;
  model?: string | null;
  video_encode?: "lossless" | "balanced";
  duration_ms?: number;
  diagnostic_summary?: string | null;
}

interface JobRunContext {
  inputPath: string;
  outputPath: string;
  preset: string | null;
  model: string | null;
  videoEncodeMode: "lossless" | "balanced";
  startTime: number;
}

interface JobState {
  inputPath: string | null;
  outputPath: string | null;
  hintPath: string | null;
  selectedPresetId: string | null;
  selectedModelId: string | null;
  videoEncodeMode: "lossless" | "balanced";
  advancedSettings: AdvancedProcessingSettings;
  outputRecipe: OutputRecipeSettings;
  defaultOutputDir: string | null;
  isProcessing: boolean;
  terminalStatus: JobTerminalStatus;
  currentProgress: number;
  statusMessage: string;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  activeBackend: string | null;
  artifactPath: string | null;
  warnings: string[];
  timings: JobProgress["timings"];
  metrics: JobMetrics;
  error: string | null;
  logs: string[];
  history: JobRecord[];

  setInput: (path: string | null) => void;
  setOutput: (path: string | null) => void;
  setHint: (path: string | null) => void;
  setSelectedPresetId: (presetId: string | null) => void;
  setSelectedModelId: (modelId: string | null) => void;
  setVideoEncodeMode: (mode: "lossless" | "balanced") => void;
  setOutputRecipeSetting: <Key extends keyof OutputRecipeSettings>(
    key: Key,
    value: OutputRecipeSettings[Key]
  ) => void;
  setAdvancedSetting: <Key extends keyof AdvancedProcessingSettings>(
    key: Key,
    value: AdvancedProcessingSettings[Key]
  ) => void;
  initDefaults: () => Promise<void>;
  startJob: () => Promise<void>;
  cancelJob: () => Promise<void>;
  reset: () => void;
  loadHistory: () => void;
  clearHistory: () => void;
}

export const useJobStore = create<JobState>((set, get) => ({
  inputPath: null,
  outputPath: null,
  hintPath: null,
  selectedPresetId: null,
  selectedModelId: null,
  videoEncodeMode: "lossless",
  advancedSettings: DEFAULT_ADVANCED_SETTINGS,
  outputRecipe: DEFAULT_OUTPUT_RECIPE,
  defaultOutputDir: null,
  isProcessing: false,
  terminalStatus: "idle",
  currentProgress: 0,
  statusMessage: "Ready",
  startedAtMs: null,
  finishedAtMs: null,
  activeBackend: null,
  artifactPath: null,
  warnings: [],
  timings: [],
  metrics: {},
  error: null,
  logs: [],
  history: [],

  setInput: (path) => set({ inputPath: path, error: null }),
  setOutput: (path) => set({ outputPath: path, error: null }),
  setHint: (path) => set({ hintPath: path }),
  setSelectedPresetId: (presetId) => set({ selectedPresetId: presetId }),
  setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
  setVideoEncodeMode: (mode) => set({ videoEncodeMode: mode }),
  setOutputRecipeSetting: (key, value) => set((state) => ({
    outputRecipe: normalizeOutputRecipe({
      ...state.outputRecipe,
      [key]: value
    }),
    outputPath: key === "artifactFamily" ? null : state.outputPath
  })),
  setAdvancedSetting: (key, value) => set((state) => ({
    advancedSettings: normalizeAdvancedSettings({
      ...state.advancedSettings,
      [key]: value
    })
  })),
  initDefaults: async () => {
    try {
      const dir = await downloadDir();
      if (!dir) return;
      set((state) =>
        state.outputPath
          ? { defaultOutputDir: dir }
          : { outputPath: dir, defaultOutputDir: dir }
      );
    } catch {
      return;
    }
  },

  loadHistory: () => {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        set({ history: parsed });
      }
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  },

  clearHistory: () => {
    localStorage.removeItem(HISTORY_KEY);
    set({ history: [] });
  },

  reset: () => set((state) => ({
    inputPath: null,
    outputPath: state.defaultOutputDir,
    hintPath: null,
    selectedPresetId: null,
    selectedModelId: null,
    videoEncodeMode: "lossless",
    advancedSettings: DEFAULT_ADVANCED_SETTINGS,
    outputRecipe: DEFAULT_OUTPUT_RECIPE,
    isProcessing: false,
    terminalStatus: "idle",
    currentProgress: 0,
    statusMessage: "Ready",
    startedAtMs: null,
    finishedAtMs: null,
    activeBackend: null,
    artifactPath: null,
    warnings: [],
    timings: [],
    metrics: {},
    error: null,
    logs: []
  })),

  cancelJob: async () => {
    if (!get().isProcessing) return;

    set({ statusMessage: "Cancelling..." });
    try {
      const cancelled = await invoke<boolean>("cancel_processing");
      if (!cancelled) {
        set({
          statusMessage: "Finishing runtime shutdown..."
        });
      }
    } catch (err: unknown) {
      set({
        error: formatRuntimeError(err),
        statusMessage: "Cancellation failed"
      });
    }
  },

  startJob: async () => {
    const {
      inputPath,
      outputPath,
      hintPath,
      selectedPresetId,
      selectedModelId,
      videoEncodeMode,
      advancedSettings
    } = get();

    if (!inputPath || !outputPath || get().isProcessing) return;

    let unlisten: UnlistenFn | null = null;
    const context: JobRunContext = {
      inputPath,
      outputPath,
      preset: selectedPresetId,
      model: selectedModelId,
      videoEncodeMode,
      startTime: Date.now()
    };

    const stopListening = () => {
      if (!unlisten) return;
      void unlisten();
      unlisten = null;
    };

    const addHistoryRecord = (status: "success" | "failed", diagnostic: string | null) => {
      const finishedAt = new Date().toISOString();
      const finalOutputPath = get().artifactPath || get().outputPath || context.outputPath;
      const newRecord: JobRecord = {
        id: createRecordId(),
        timestamp: finishedAt,
        completed_at: finishedAt,
        input: context.inputPath,
        output: finalOutputPath,
        status,
        backend: get().activeBackend,
        preset: context.preset,
        model: context.model,
        video_encode: context.videoEncodeMode,
        duration_ms: Date.now() - context.startTime,
        diagnostic_summary: diagnostic
      };
      const updatedHistory = [newRecord, ...get().history].slice(0, MAX_HISTORY_RECORDS);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
      set({ history: updatedHistory });
    };

    const finishJob = (
      terminalStatus: Exclude<JobTerminalStatus, "idle" | "running">,
      statusMessage: string,
      error: string | null
    ) => {
      set({
        isProcessing: false,
        terminalStatus,
        statusMessage,
        finishedAtMs: Date.now(),
        error
      });
      stopListening();
    };

    set({
      isProcessing: true,
      terminalStatus: "running",
      currentProgress: 0,
      statusMessage: "Starting engine...",
      startedAtMs: context.startTime,
      finishedAtMs: null,
      activeBackend: null,
      artifactPath: null,
      warnings: [],
      timings: [],
      metrics: {},
      error: null,
      logs: []
    });

    try {
      unlisten = await listen<string>("engine-event", (event) => {
        const line = event.payload;
        set((state) => ({
          logs: [...state.logs, line].slice(-MAX_LOG_LINES)
        }));

        let payload: JobProgress;
        try {
          payload = JSON.parse(line) as JobProgress;
        } catch {
          const diagnostic = "Runtime emitted malformed JSON event output.";
          if (get().terminalStatus === "running") {
            addHistoryRecord("failed", diagnostic);
            finishJob("failed", "Runtime event stream failed", diagnostic);
          }
          return;
        }

        if (get().terminalStatus !== "running") {
          return;
        }

        switch (payload.type) {
          case "job_started":
            set({
              statusMessage: payload.message || "Runtime job started",
              currentProgress: normalizeProgress(payload.progress)
            });
            break;
          case "backend_selected":
            set({
              activeBackend: payload.backend || null,
              statusMessage: payload.message || "Backend selected"
            });
            break;
          case "progress":
            set({
              currentProgress: normalizeProgress(payload.progress),
              statusMessage: payload.message || payload.phase || "Processing..."
            });
            break;
          case "warning":
            if (payload.message || payload.fallback?.reason) {
              const warning = payload.message || payload.fallback?.reason || "Runtime warning";
              set((state) => ({
                warnings: [...state.warnings, warning],
                statusMessage: warning
              }));
            }
            break;
          case "artifact_written":
            if (payload.artifact_path) {
              void invoke("allow_preview_asset", { path: payload.artifact_path });
            }
            set({
              artifactPath: payload.artifact_path || null,
              statusMessage: payload.message || "Artifact written"
            });
            break;
          case "completed": {
            const diagnostic = payload.message || get().statusMessage || "Completed";
            addHistoryRecord("success", diagnostic);
            set({
              currentProgress: 100,
              timings: payload.timings || get().timings
            });
            finishJob("completed", payload.message || "Finished", null);
            break;
          }
          case "failed": {
            const diagnostic = payload.error?.message || payload.message || "Runtime processing failed.";
            addHistoryRecord("failed", diagnostic);
            finishJob("failed", "Processing failed", diagnostic);
            break;
          }
          case "cancelled":
            finishJob("cancelled", payload.message || "Cancelled", null);
            break;
        }

        if (payload.timings) {
          set({ timings: payload.timings });
        }
        if (payload.metrics) {
          set({ metrics: payload.metrics });
        }
      });

      await invoke("start_processing", {
        input: inputPath,
        output: outputPath,
        hint: hintPath,
        preset: selectedPresetId,
        model: selectedModelId,
        video_encode: videoEncodeMode,
        ...advancedProcessingPayload(advancedSettings)
      });
    } catch (err: unknown) {
      stopListening();
      const diagnostic = formatRuntimeError(err);
      addHistoryRecord("failed", diagnostic);
      set({
        isProcessing: false,
        terminalStatus: "failed",
        statusMessage: "Processing failed",
        finishedAtMs: Date.now(),
        error: diagnostic
      });
    }
  }
}));

function normalizeProgress(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

function createRecordId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2, 11);
}
