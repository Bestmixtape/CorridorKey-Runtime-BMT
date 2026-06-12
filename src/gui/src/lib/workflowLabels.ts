import type { RuntimeCatalogEntry, RuntimeReadiness } from "@/lib/engine";

export function presetOptionValue(entry: RuntimeCatalogEntry): string {
  return stringField(entry.id) || stringField(entry.name) || "";
}

export function presetOptionLabel(entry: RuntimeCatalogEntry): string {
  return stringField(entry.name) || stringField(entry.id) || "Runtime preset";
}

export function presetOptionHelp(
  entry: RuntimeCatalogEntry,
  recommendedModel: RuntimeCatalogEntry | null = null
): string {
  const params = recordField(entry.params);
  const modelName =
    stringField(entry.recommended_model) ||
    stringField(recommendedModel?.filename) ||
    stringField(recommendedModel?.name);
  const resolution =
    numberField(params?.target_resolution) ||
    numberField(recommendedModel?.resolution) ||
    resolutionFromName(modelName);
  const precision = precisionLabel(
    stringField(recommendedModel?.variant) ||
    modelName ||
    stringField(recommendedModel?.filename)
  );
  const backend = backendLabel(
    stringField(recommendedModel?.recommended_backend) ||
    stringField(entry.recommended_backend)
  );
  const tiling = params?.enable_tiling === true ? "tiling enabled" : "single-frame pass";
  const cost = costLabel(resolution);

  return [
    resolution > 0 ? `${resolution}px` : "runtime resolution",
    precision,
    backend,
    tiling,
    cost,
    modelName
  ].filter(Boolean).join(" - ");
}

export function modelOptionValue(entry: RuntimeCatalogEntry): string {
  return stringField(entry.path) || stringField(entry.filename) || stringField(entry.id) || stringField(entry.name) || "";
}

export function modelOptionLabel(entry: RuntimeCatalogEntry): string {
  const name = stringField(entry.filename) || stringField(entry.name) || "Runtime model";
  const resolution = numberField(entry.resolution);
  const state = stringField(entry.artifact_state?.state);
  return [
    name,
    resolution > 0 ? `${resolution}px` : "",
    state
  ].filter(Boolean).join(" - ");
}

export function artifactOptionStatusLabel(status: string): string {
  if (status === "needs_image_source") return "Image source";
  if (status === "needs_video_source") return "Video source";
  if (status === "awaiting_runtime_contract") return "Needs runtime support";
  return "Supported";
}

export function screenColorLabel(model: RuntimeCatalogEntry | null): string {
  const screenColor = stringField(model?.screen_color);
  if (!screenColor) return "Runtime preset";
  return displayModeLabel(screenColor);
}

export function displayModeLabel(value: string): string {
  return value
    .split("_")
    .map((part, index) => index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(" ");
}

export function hintModeLabel(hintPath: string | null): string {
  return hintPath ? "External hint" : "Runtime fallback";
}

export function presetUnavailableLabel(readiness: RuntimeReadiness | null): string {
  if (!readiness) return "Runtime catalog loading";
  if (readiness.status === "error") return "Runtime unavailable";
  if (!readiness.presets.ok) return "Preset probe failed";
  return "No compatible presets";
}

export function modelUnavailableLabel(readiness: RuntimeReadiness | null): string {
  if (!readiness) return "Runtime models loading";
  if (readiness.status === "error") return "Runtime unavailable";
  if (!readiness.models.ok) return "Model probe failed";
  return "No compatible models";
}

export function readinessLabel(status: string) {
  if (status === "ready") return "Runtime ready";
  if (status === "degraded") return "Runtime usable";
  return "Runtime error";
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recordField(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function resolutionFromName(value: string): number {
  const match = value.match(/(?:^|_)(512|1024|1536|2048)(?:\.|_|$)/);
  return match ? Number(match[1]) : 0;
}

function precisionLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("fp16")) return "FP16";
  if (normalized.includes("fp32")) return "FP32";
  if (normalized.includes("int8")) return "INT8";
  if (normalized.includes("mlx")) return "MLX";
  return "";
}

function backendLabel(value: string): string {
  switch (value.toLowerCase()) {
    case "tensorrt":
      return "TensorRT";
    case "torchtrt":
      return "TorchTRT";
    case "dml":
    case "directml":
      return "DirectML";
    case "mlx":
      return "MLX";
    case "coreml":
      return "CoreML";
    case "cpu":
      return "CPU";
    default:
      return displayModeLabel(value);
  }
}

function costLabel(resolution: number): string {
  if (resolution <= 0) return "";
  if (resolution <= 512) return "light GPU cost";
  if (resolution <= 1024) return "balanced GPU cost";
  if (resolution <= 1536) return "high GPU cost";
  return "maximum GPU cost";
}
