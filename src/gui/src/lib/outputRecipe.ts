import { fileExtension, fileName, hasFileExtension } from "@/lib/media";

export type OutputArtifactFamily = "movie" | "exr_sequence" | "png_sequence" | "preview_only";
export type OutputAlphaMode = "transparent" | "matte_only" | "composited_preview";
export type PreviewBackgroundMode = "checkerboard" | "solid" | "transparent" | "replacement_media";
export type OutputColorIntent = "runtime_default" | "linear_srgb";

export interface OutputRecipeSettings {
  artifactFamily: OutputArtifactFamily;
  alphaMode: OutputAlphaMode;
  previewBackground: PreviewBackgroundMode;
  previewSolidColor: string;
  replacementMediaPath: string | null;
  colorIntent: OutputColorIntent;
}

export interface OutputArtifactOption {
  value: OutputArtifactFamily;
  label: string;
  enabled: boolean;
  status: "supported" | "needs_image_source" | "needs_video_source" | "planned";
}

export interface OutputRecipeSourceContext {
  selectedAsFolder?: boolean;
}

export const DEFAULT_OUTPUT_RECIPE: OutputRecipeSettings = {
  artifactFamily: "movie",
  alphaMode: "transparent",
  previewBackground: "checkerboard",
  previewSolidColor: "#111827",
  replacementMediaPath: null,
  colorIntent: "runtime_default"
};

export const OUTPUT_ALPHA_OPTIONS: Array<{ value: OutputAlphaMode; label: string }> = [
  { value: "transparent", label: "Transparent" },
  { value: "matte_only", label: "Matte only" },
  { value: "composited_preview", label: "Composite preview" }
];

export const PREVIEW_BACKGROUND_OPTIONS: Array<{ value: PreviewBackgroundMode; label: string }> = [
  { value: "checkerboard", label: "Checkerboard" },
  { value: "solid", label: "Solid" },
  { value: "transparent", label: "Transparent" },
  { value: "replacement_media", label: "Replacement media" }
];

export const OUTPUT_COLOR_OPTIONS: Array<{ value: OutputColorIntent; label: string }> = [
  { value: "runtime_default", label: "Runtime default" },
  { value: "linear_srgb", label: "Linear sRGB" }
];

const ARTIFACT_FAMILIES: OutputArtifactFamily[] = [
  "movie",
  "exr_sequence",
  "png_sequence",
  "preview_only"
];
const ALPHA_MODES = OUTPUT_ALPHA_OPTIONS.map((option) => option.value);
const PREVIEW_BACKGROUND_MODES = PREVIEW_BACKGROUND_OPTIONS.map((option) => option.value);
const COLOR_INTENTS = OUTPUT_COLOR_OPTIONS.map((option) => option.value);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi"]);
const IMAGE_EXTENSIONS = new Set(["png", "exr", "jpg", "jpeg"]);
type InputSourceKind = "video" | "image" | "folder" | "unknown";

export function normalizeOutputRecipe(
  input: Partial<OutputRecipeSettings>
): OutputRecipeSettings {
  return {
    artifactFamily: oneOf(input.artifactFamily, ARTIFACT_FAMILIES, DEFAULT_OUTPUT_RECIPE.artifactFamily),
    alphaMode: oneOf(input.alphaMode, ALPHA_MODES, DEFAULT_OUTPUT_RECIPE.alphaMode),
    previewBackground: oneOf(
      input.previewBackground,
      PREVIEW_BACKGROUND_MODES,
      DEFAULT_OUTPUT_RECIPE.previewBackground
    ),
    previewSolidColor: normalizeHexColor(input.previewSolidColor, DEFAULT_OUTPUT_RECIPE.previewSolidColor),
    replacementMediaPath: normalizeReplacementMediaPath(input.replacementMediaPath),
    colorIntent: oneOf(input.colorIntent, COLOR_INTENTS, DEFAULT_OUTPUT_RECIPE.colorIntent)
  };
}

export function outputArtifactOptions(
  inputPath: string | null,
  sourceContext: OutputRecipeSourceContext = {}
): OutputArtifactOption[] {
  const sourceKind = inputSourceKind(inputPath, sourceContext);
  const sequenceCapable = sourceKind === "image" || sourceKind === "folder";
  return [
    {
      value: "movie",
      label: "Movie",
      enabled: sourceKind === "video" || sourceKind === "unknown",
      status: sequenceCapable ? "needs_video_source" : "supported"
    },
    {
      value: "exr_sequence",
      label: "EXR sequence",
      enabled: sequenceCapable,
      status: sequenceCapable ? "supported" : "needs_image_source"
    },
    {
      value: "png_sequence",
      label: "PNG sequence",
      enabled: sequenceCapable,
      status: sequenceCapable ? "supported" : "needs_image_source"
    },
    {
      value: "preview_only",
      label: "Preview only",
      enabled: false,
      status: "planned"
    }
  ];
}

export function outputRecipeLabel(recipe: OutputRecipeSettings): string {
  switch (recipe.artifactFamily) {
    case "exr_sequence":
      return "EXR sequence";
    case "png_sequence":
      return "PNG sequence";
    case "preview_only":
      return "Preview only";
    default:
      return "Movie";
  }
}

export function outputRecipeChips(recipe: OutputRecipeSettings): string[] {
  return [
    `Output ${outputRecipeLabel(recipe)}`,
    `Alpha ${formatMode(recipe.alphaMode)}`,
    `Preview ${previewBackgroundLabel(recipe)}`,
    `Color ${formatMode(recipe.colorIntent)}`
  ];
}

export function isOutputPathReady(
  outputPath: string | null,
  recipe: OutputRecipeSettings
): boolean {
  if (!outputPath) {
    return false;
  }
  if (recipe.artifactFamily === "movie") {
    return hasFileExtension(outputPath);
  }
  if (recipe.artifactFamily === "preview_only") {
    return true;
  }
  return !hasFileExtension(outputPath);
}

export function suggestOutputPathForRecipe(
  inputPath: string | null,
  currentOutputPath: string | null,
  defaultOutputDir: string | null,
  recipe: OutputRecipeSettings,
  sourceContext: OutputRecipeSourceContext = {}
): string | null {
  const normalized = effectiveRecipeForSource(inputPath, normalizeOutputRecipe(recipe), sourceContext);
  if (!inputPath || isOutputPathReady(currentOutputPath, normalized)) {
    return null;
  }

  const directory = defaultOutputDir || currentOutputPath;
  if (!directory) {
    return null;
  }

  const inputName = fileName(inputPath);
  const inputBase = sourceContext.selectedAsFolder
    ? inputName
    : inputName.replace(/\.[^.]+$/, "");
  const suffix = outputSuffix(normalized);
  return joinLocalPath(directory, `${inputBase || "corridorkey_output"}_${suffix}`);
}

export function previewBackgroundStyle(
  recipe: OutputRecipeSettings
): { className: string; style?: Record<string, string> } {
  const normalized = normalizeOutputRecipe(recipe);
  if (normalized.previewBackground === "solid") {
    return {
      className: "bg-zinc-950",
      style: { backgroundColor: normalized.previewSolidColor }
    };
  }
  if (normalized.previewBackground === "transparent") {
    return { className: "bg-transparent" };
  }
  return {
    className:
      "bg-[linear-gradient(45deg,#18181b_25%,transparent_25%),linear-gradient(-45deg,#18181b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#18181b_75%),linear-gradient(-45deg,transparent_75%,#18181b_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] bg-zinc-950"
  };
}

function inputSourceKind(
  inputPath: string | null,
  sourceContext: OutputRecipeSourceContext = {}
): InputSourceKind {
  if (!inputPath) return "unknown";
  if (sourceContext.selectedAsFolder) return "folder";
  const extension = fileExtension(inputPath);
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (!extension) return "folder";
  return "unknown";
}

function effectiveRecipeForSource(
  inputPath: string | null,
  recipe: OutputRecipeSettings,
  sourceContext: OutputRecipeSourceContext = {}
): OutputRecipeSettings {
  const sourceKind = inputSourceKind(inputPath, sourceContext);
  if ((sourceKind === "image" || sourceKind === "folder") && recipe.artifactFamily === "movie") {
    return { ...recipe, artifactFamily: "png_sequence" };
  }
  return recipe;
}

function outputSuffix(recipe: OutputRecipeSettings): string {
  if (recipe.artifactFamily === "exr_sequence") return "corridorkey_exr";
  if (recipe.artifactFamily === "png_sequence") return "corridorkey_png";
  return "corridorkey.mov";
}

function previewBackgroundLabel(recipe: OutputRecipeSettings): string {
  if (recipe.previewBackground === "replacement_media") {
    return `Replacement ${fileName(recipe.replacementMediaPath) || "not selected"}`;
  }
  if (recipe.previewBackground === "solid") {
    return `Solid ${recipe.previewSolidColor}`;
  }
  return formatMode(recipe.previewBackground);
}

function formatMode(value: string): string {
  if (value === "runtime_default") return "Runtime default";
  if (value === "linear_srgb") return "Linear sRGB";
  return value
    .split("_")
    .map((part, index) => index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function normalizeReplacementMediaPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}

function oneOf<T extends string>(
  value: T | undefined,
  choices: readonly T[],
  fallback: T
): T {
  return value !== undefined && choices.includes(value) ? value : fallback;
}

function joinLocalPath(directory: string, file: string): string {
  const trimmed = directory.replace(/[\\/]+$/, "");
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}${file}`;
}
