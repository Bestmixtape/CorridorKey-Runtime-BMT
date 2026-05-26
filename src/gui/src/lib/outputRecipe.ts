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
  status: "supported" | "needs_image_source" | "needs_video_source" | "awaiting_runtime_contract";
}

export type OutputRecipeControlStatus =
  | "supported"
  | "preview_only"
  | "awaiting_runtime_contract";

export interface OutputRecipeControlOption<TValue extends string = string> {
  value: TValue;
  label: string;
  enabled: boolean;
  status: OutputRecipeControlStatus;
}

export interface OutputRecipeControlOptions {
  alphaModes: OutputRecipeControlOption<OutputAlphaMode>[];
  previewBackgrounds: OutputRecipeControlOption<PreviewBackgroundMode>[];
  colorIntents: OutputRecipeControlOption<OutputColorIntent>[];
}

export interface OutputRecipeSourceContext {
  selectedAsFolder?: boolean;
}

export interface RuntimeOutputRecipeCapabilities {
  artifact_families?: OutputArtifactFamily[];
  movie_alpha_modes?: OutputAlphaMode[];
  sequence_alpha_modes?: OutputAlphaMode[];
  exr_sequence_outputs?: string[];
  replacement_media_output?: boolean;
  color_intents?: OutputColorIntent[];
}

interface NormalizedOutputRecipeCapabilities {
  artifactFamilies: OutputArtifactFamily[];
  movieAlphaModes: OutputAlphaMode[];
  sequenceAlphaModes: OutputAlphaMode[];
  colorIntents: OutputColorIntent[];
}

export const DEFAULT_OUTPUT_RECIPE: OutputRecipeSettings = {
  artifactFamily: "movie",
  alphaMode: "composited_preview",
  previewBackground: "checkerboard",
  previewSolidColor: "#111827",
  replacementMediaPath: null,
  colorIntent: "runtime_default"
};

export const CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES: RuntimeOutputRecipeCapabilities = {
  artifact_families: ["movie", "exr_sequence"],
  movie_alpha_modes: ["composited_preview"],
  sequence_alpha_modes: [],
  exr_sequence_outputs: ["matte_exr", "foreground_exr", "processed_exr", "comp_png"],
  replacement_media_output: false,
  color_intents: ["runtime_default"]
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
  sourceContext: OutputRecipeSourceContext = {},
  capabilities?: RuntimeOutputRecipeCapabilities
): OutputArtifactOption[] {
  const runtimeCapabilities = normalizeOutputRecipeCapabilities(capabilities);
  const sourceKind = inputSourceKind(inputPath, sourceContext);
  const sequenceCapable = sourceKind === "image" || sourceKind === "folder";
  return [
    artifactOption("movie", "Movie", sourceKind === "video" || sourceKind === "unknown", "needs_video_source", runtimeCapabilities),
    artifactOption("exr_sequence", "EXR sequence", sequenceCapable, "needs_image_source", runtimeCapabilities),
    artifactOption("png_sequence", "PNG sequence", sequenceCapable, "needs_image_source", runtimeCapabilities),
    artifactOption("preview_only", "Preview only", true, "needs_image_source", runtimeCapabilities)
  ];
}

export function preferredOutputArtifactFamily(
  inputPath: string | null,
  recipe: OutputRecipeSettings,
  sourceContext: OutputRecipeSourceContext = {},
  capabilities?: RuntimeOutputRecipeCapabilities
): OutputArtifactFamily {
  const normalized = normalizeOutputRecipe(recipe);
  const options = outputArtifactOptions(inputPath, sourceContext, capabilities);
  const current = options.find((option) => option.value === normalized.artifactFamily);
  if (current?.enabled) {
    return current.value;
  }
  return options.find((option) => option.enabled)?.value ?? normalized.artifactFamily;
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
    `Alpha ${recipe.artifactFamily === "exr_sequence" ? "EXR bundle" : formatMode(recipe.alphaMode)}`,
    `Preview ${previewBackgroundLabel(recipe)}`,
    `Color ${formatMode(recipe.colorIntent)}`
  ];
}

export function outputRecipeControlOptions(
  recipe: OutputRecipeSettings,
  capabilities?: RuntimeOutputRecipeCapabilities
): OutputRecipeControlOptions {
  const normalized = normalizeOutputRecipe(recipe);
  const runtimeCapabilities = normalizeOutputRecipeCapabilities(capabilities);
  return {
    alphaModes: OUTPUT_ALPHA_OPTIONS.map((option) => ({
      ...option,
      ...alphaModeSupport(normalized.artifactFamily, option.value, runtimeCapabilities)
    })),
    previewBackgrounds: PREVIEW_BACKGROUND_OPTIONS.map((option) => ({
      ...option,
      enabled: true,
      status: "preview_only" as const
    })),
    colorIntents: OUTPUT_COLOR_OPTIONS.map((option) => ({
      ...option,
      enabled: runtimeCapabilities.colorIntents.includes(option.value),
      status: runtimeCapabilities.colorIntents.includes(option.value)
        ? "supported" as const
        : "awaiting_runtime_contract" as const
    }))
  };
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
  sourceContext: OutputRecipeSourceContext = {},
  capabilities?: RuntimeOutputRecipeCapabilities
): string | null {
  const normalized = effectiveRecipeForSource(
    inputPath,
    normalizeOutputRecipe(recipe),
    sourceContext,
    capabilities
  );
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
    className: "ck-preview-checkerboard"
  };
}

function alphaModeSupport(
  artifactFamily: OutputArtifactFamily,
  alphaMode: OutputAlphaMode,
  capabilities: NormalizedOutputRecipeCapabilities
): Pick<OutputRecipeControlOption<OutputAlphaMode>, "enabled" | "status"> {
  if (artifactFamily === "movie") {
    return capabilities.movieAlphaModes.includes(alphaMode)
      ? { enabled: true, status: "supported" }
      : { enabled: false, status: "awaiting_runtime_contract" };
  }

  if (artifactFamily === "exr_sequence" || artifactFamily === "png_sequence") {
    return capabilities.sequenceAlphaModes.includes(alphaMode)
      ? { enabled: true, status: "supported" }
      : { enabled: false, status: "awaiting_runtime_contract" };
  }

  if (artifactFamily === "preview_only") {
    return { enabled: false, status: "awaiting_runtime_contract" };
  }

  return { enabled: true, status: "supported" };
}

function artifactOption(
  value: OutputArtifactFamily,
  label: string,
  sourceCompatible: boolean,
  sourceBlockedStatus: OutputArtifactOption["status"],
  capabilities: NormalizedOutputRecipeCapabilities
): OutputArtifactOption {
  const runtimeSupported = capabilities.artifactFamilies.includes(value);
  return {
    value,
    label,
    enabled: runtimeSupported && sourceCompatible,
    status: runtimeSupported
      ? sourceCompatible ? "supported" : sourceBlockedStatus
      : "awaiting_runtime_contract"
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
  sourceContext: OutputRecipeSourceContext = {},
  capabilities?: RuntimeOutputRecipeCapabilities
): OutputRecipeSettings {
  const artifactFamily = preferredOutputArtifactFamily(inputPath, recipe, sourceContext, capabilities);
  if (artifactFamily !== recipe.artifactFamily) {
    return { ...recipe, artifactFamily };
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

function normalizeOutputRecipeCapabilities(
  capabilities: RuntimeOutputRecipeCapabilities = CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES
): NormalizedOutputRecipeCapabilities {
  const usingDefaultCapabilities = capabilities === CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES;
  return {
    artifactFamilies: runtimeList(
      capabilities.artifact_families,
      ARTIFACT_FAMILIES,
      usingDefaultCapabilities ? CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES.artifact_families : undefined
    ),
    movieAlphaModes: runtimeList(
      capabilities.movie_alpha_modes,
      ALPHA_MODES,
      usingDefaultCapabilities ? CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES.movie_alpha_modes : undefined
    ),
    sequenceAlphaModes: runtimeList(
      capabilities.sequence_alpha_modes,
      ALPHA_MODES,
      usingDefaultCapabilities ? CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES.sequence_alpha_modes : undefined
    ),
    colorIntents: runtimeList(
      capabilities.color_intents,
      COLOR_INTENTS,
      usingDefaultCapabilities ? CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES.color_intents : undefined
    )
  };
}

function runtimeList<T extends string>(
  values: T[] | undefined,
  allowed: readonly T[],
  fallback: T[] | undefined
): T[] {
  const source = Array.isArray(values) ? values : fallback;
  return Array.isArray(source)
    ? source.filter((value) => allowed.includes(value))
    : [];
}

function joinLocalPath(directory: string, file: string): string {
  const trimmed = directory.replace(/[\\/]+$/, "");
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}${file}`;
}
