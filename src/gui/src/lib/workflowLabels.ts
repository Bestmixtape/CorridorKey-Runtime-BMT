import type { RuntimeCatalogEntry, RuntimeReadiness } from "@/lib/engine";

export function presetOptionValue(entry: RuntimeCatalogEntry): string {
  return stringField(entry.id) || stringField(entry.name) || "";
}

export function presetOptionLabel(entry: RuntimeCatalogEntry): string {
  return stringField(entry.name) || stringField(entry.id) || "Runtime preset";
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
