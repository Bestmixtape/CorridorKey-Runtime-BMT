export type QualityFallbackMode = "auto" | "direct" | "coarse_to_fine";
export type RefinementMode = "auto" | "full_frame" | "tiled";
export type PrecisionMode = "auto" | "fp16";
export type RuntimeResolution = 0 | 512 | 1024 | 1536 | 2048;
export type AdvancedControlStatus = "supported" | "awaiting_runtime_contract";

export interface AdvancedControlOption<T extends string | number> {
  value: T;
  label: string;
  enabled: boolean;
  status: AdvancedControlStatus;
}

export interface AdvancedProcessingSettings {
  qualityFallback: QualityFallbackMode;
  refinementMode: RefinementMode;
  precision: PrecisionMode;
  resolution: RuntimeResolution;
  batchSize: number;
  despill: number;
  despeckle: boolean;
  tiled: boolean;
}

export interface AdvancedProcessingPayload {
  quality_fallback?: QualityFallbackMode;
  refinement_mode?: RefinementMode;
  precision?: PrecisionMode;
  resolution?: RuntimeResolution;
  batch_size?: number;
  despill?: number;
  despeckle?: boolean;
  tiled?: boolean;
}

export const DEFAULT_ADVANCED_SETTINGS: AdvancedProcessingSettings = {
  qualityFallback: "auto",
  refinementMode: "auto",
  precision: "auto",
  resolution: 0,
  batchSize: 1,
  despill: 0.5,
  despeckle: false,
  tiled: false
};

export const QUALITY_FALLBACK_OPTIONS: Array<AdvancedControlOption<QualityFallbackMode>> = [
  { value: "auto", label: "Auto", enabled: true, status: "supported" },
  { value: "direct", label: "Direct", enabled: true, status: "supported" },
  { value: "coarse_to_fine", label: "Coarse to fine", enabled: true, status: "supported" }
];

export const REFINEMENT_MODE_OPTIONS: Array<AdvancedControlOption<RefinementMode>> = [
  { value: "auto", label: "Auto", enabled: true, status: "supported" },
  {
    value: "full_frame",
    label: "Full frame",
    enabled: false,
    status: "awaiting_runtime_contract"
  },
  {
    value: "tiled",
    label: "Tiled",
    enabled: false,
    status: "awaiting_runtime_contract"
  }
];

export const PRECISION_OPTIONS: Array<AdvancedControlOption<PrecisionMode>> = [
  { value: "auto", label: "Auto", enabled: true, status: "supported" },
  { value: "fp16", label: "FP16", enabled: true, status: "supported" }
];

export const RESOLUTION_OPTIONS: Array<AdvancedControlOption<RuntimeResolution>> = [
  { value: 0, label: "Auto", enabled: true, status: "supported" },
  { value: 512, label: "512", enabled: true, status: "supported" },
  { value: 1024, label: "1024", enabled: true, status: "supported" },
  { value: 1536, label: "1536", enabled: true, status: "supported" },
  { value: 2048, label: "2048", enabled: true, status: "supported" }
];

const QUALITY_FALLBACK_MODES = QUALITY_FALLBACK_OPTIONS.map((option) => option.value);
const REFINEMENT_MODES = enabledOptionValues(REFINEMENT_MODE_OPTIONS);
const PRECISION_MODES = PRECISION_OPTIONS.map((option) => option.value);
const RESOLUTIONS = RESOLUTION_OPTIONS.map((option) => option.value);

export function normalizeAdvancedSettings(
  input: Partial<AdvancedProcessingSettings>
): AdvancedProcessingSettings {
  return {
    qualityFallback: oneOf(input.qualityFallback, QUALITY_FALLBACK_MODES, DEFAULT_ADVANCED_SETTINGS.qualityFallback),
    refinementMode: oneOf(input.refinementMode, REFINEMENT_MODES, DEFAULT_ADVANCED_SETTINGS.refinementMode),
    precision: oneOf(input.precision, PRECISION_MODES, DEFAULT_ADVANCED_SETTINGS.precision),
    resolution: oneOf(input.resolution, RESOLUTIONS, DEFAULT_ADVANCED_SETTINGS.resolution),
    batchSize: clampInteger(input.batchSize, 1, 64, DEFAULT_ADVANCED_SETTINGS.batchSize),
    despill: clampNumber(input.despill, 0, 1, DEFAULT_ADVANCED_SETTINGS.despill),
    despeckle: input.despeckle === true,
    tiled: input.tiled === true
  };
}

export function advancedProcessingPayload(
  settings: AdvancedProcessingSettings
): AdvancedProcessingPayload {
  const normalized = normalizeAdvancedSettings(settings);
  const payload: AdvancedProcessingPayload = {};

  if (normalized.qualityFallback !== DEFAULT_ADVANCED_SETTINGS.qualityFallback) {
    payload.quality_fallback = normalized.qualityFallback;
  }
  if (normalized.refinementMode !== DEFAULT_ADVANCED_SETTINGS.refinementMode) {
    payload.refinement_mode = normalized.refinementMode;
  }
  if (normalized.precision !== DEFAULT_ADVANCED_SETTINGS.precision) {
    payload.precision = normalized.precision;
  }
  if (normalized.resolution !== DEFAULT_ADVANCED_SETTINGS.resolution) {
    payload.resolution = normalized.resolution;
  }
  if (normalized.batchSize !== DEFAULT_ADVANCED_SETTINGS.batchSize) {
    payload.batch_size = normalized.batchSize;
  }
  if (normalized.despill !== DEFAULT_ADVANCED_SETTINGS.despill) {
    payload.despill = normalized.despill;
  }
  if (normalized.despeckle !== DEFAULT_ADVANCED_SETTINGS.despeckle) {
    payload.despeckle = normalized.despeckle;
  }
  if (normalized.tiled !== DEFAULT_ADVANCED_SETTINGS.tiled) {
    payload.tiled = normalized.tiled;
  }

  return payload;
}

function oneOf<T extends string | number>(
  value: T | undefined,
  choices: readonly T[],
  fallback: T
): T {
  return value !== undefined && choices.includes(value) ? value : fallback;
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

function enabledOptionValues<T extends string | number>(
  options: Array<AdvancedControlOption<T>>
): T[] {
  return options.filter((option) => option.enabled).map((option) => option.value);
}
