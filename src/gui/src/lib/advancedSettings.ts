export type QualityFallbackMode = "auto" | "direct" | "coarse_to_fine";
export type RefinementMode = "auto" | "full_frame" | "tiled";
export type PrecisionMode = "auto" | "fp16";
export type RuntimeResolution = 0 | 512 | 1024 | 1536 | 2048;

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

export const QUALITY_FALLBACK_OPTIONS: Array<{ value: QualityFallbackMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "direct", label: "Direct" },
  { value: "coarse_to_fine", label: "Coarse to fine" }
];

export const REFINEMENT_MODE_OPTIONS: Array<{ value: RefinementMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "full_frame", label: "Full frame" },
  { value: "tiled", label: "Tiled" }
];

export const PRECISION_OPTIONS: Array<{ value: PrecisionMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "fp16", label: "FP16" }
];

export const RESOLUTION_OPTIONS: Array<{ value: RuntimeResolution; label: string }> = [
  { value: 0, label: "Auto" },
  { value: 512, label: "512" },
  { value: 1024, label: "1024" },
  { value: 1536, label: "1536" },
  { value: 2048, label: "2048" }
];

const QUALITY_FALLBACK_MODES = QUALITY_FALLBACK_OPTIONS.map((option) => option.value);
const REFINEMENT_MODES = REFINEMENT_MODE_OPTIONS.map((option) => option.value);
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
