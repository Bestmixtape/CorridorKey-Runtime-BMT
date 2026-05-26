import { invoke } from "@tauri-apps/api/core";
import type { RuntimeOutputRecipeCapabilities } from "@/lib/outputRecipe";

export interface DeviceInfo {
  name: string;
  memory_mb: number;
  backend: string;
}

export interface SystemInfo {
  version?: string;
  active_device?: DeviceInfo;
  devices?: DeviceInfo[];
  capabilities?: {
    platform?: string;
    apple_silicon?: boolean;
    tensorrt_rtx_available?: boolean;
    multi_gpu_available?: boolean;
    cpu_fallback_available?: boolean;
    supported_backends?: string[];
    output_recipe?: RuntimeOutputRecipeCapabilities;
  };
  supported_tracks?: string[];
}

export type RuntimeReadinessStatus = "ready" | "degraded" | "error";

export type RuntimeCommandErrorKind =
  | "missing_runtime"
  | "spawn_failed"
  | "non_zero_exit"
  | "invalid_json"
  | "prerequisite_failed";

export interface RuntimeCommandError {
  kind: RuntimeCommandErrorKind;
  command: string;
  message: string;
  stderr: string | null;
  stdout: string | null;
  exit_code: number | null;
}

export interface RuntimeCommandResult<TValue = unknown> {
  command: string;
  ok: boolean;
  value: TValue | null;
  error: RuntimeCommandError | null;
}

export interface RuntimeCatalogEntry {
  id?: string;
  name?: string;
  filename?: string;
  description?: string;
  found?: boolean;
  usable?: boolean;
  artifact_error?: string;
  artifact_state?: Record<string, unknown>;
  path?: string;
  screen_color?: string;
  intended_use?: string;
  intended_platforms?: string[];
  installable_model_pack?: boolean;
  validated_platforms?: string[];
  recommended_backend?: string;
  recommended_model?: string;
  default_for_windows?: boolean;
  default_for_macos?: boolean;
  packaged_for_windows?: boolean;
  packaged_for_macos?: boolean;
  [key: string]: unknown;
}

export interface RuntimeModelsCatalog {
  models?: RuntimeCatalogEntry[];
  missing_models?: string[];
  missing_count?: number;
  supported_tracks?: string[];
  [key: string]: unknown;
}

export interface RuntimePresetsCatalog {
  presets?: RuntimeCatalogEntry[];
  [key: string]: unknown;
}

export interface DoctorReport {
  summary?: {
    healthy?: boolean;
    video_healthy?: boolean;
    message?: string;
    [key: string]: unknown;
  };
  models?: RuntimeCatalogEntry[] | RuntimeModelsCatalog;
  supported_tracks?: string[];
  [key: string]: unknown;
}

export interface RuntimeReadiness {
  status: RuntimeReadinessStatus;
  runtime_path: string | null;
  searched_roots: string[];
  info: RuntimeCommandResult<SystemInfo>;
  doctor: RuntimeCommandResult<DoctorReport>;
  models: RuntimeCommandResult<RuntimeModelsCatalog | RuntimeCatalogEntry[]>;
  presets: RuntimeCommandResult<RuntimePresetsCatalog | RuntimeCatalogEntry[]>;
}

export async function getRuntimeReadiness(): Promise<RuntimeReadiness> {
  return await invoke<RuntimeReadiness>("get_runtime_readiness");
}

export async function checkRuntimeUpdate(): Promise<RuntimeCommandResult> {
  return await invoke<RuntimeCommandResult>("check_runtime_update");
}

export async function getEngineInfo(): Promise<SystemInfo> {
  const readiness = await getRuntimeReadiness();
  if (readiness.info.ok && readiness.info.value) {
    return readiness.info.value;
  }

  throw readiness.info.error ?? new Error("Runtime info probe failed.");
}

export function formatRuntimeError(error: unknown): string {
  if (isRuntimeCommandError(error)) {
    const details = error.stderr || error.stdout;
    return details ? `${error.message} ${details}` : error.message;
  }

  if (error instanceof Error) {
    if (error.message.includes("reading 'invoke'")) {
      return "Tauri IPC is unavailable. Launch the desktop app to probe the packaged runtime.";
    }
    return error.message;
  }

  return String(error);
}

export function firstRuntimeError(readiness: RuntimeReadiness): RuntimeCommandError | null {
  return (
    readiness.info.error ||
    readiness.doctor.error ||
    readiness.models.error ||
    readiness.presets.error ||
    null
  );
}

function isRuntimeCommandError(error: unknown): error is RuntimeCommandError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "command" in error &&
    "message" in error
  );
}
