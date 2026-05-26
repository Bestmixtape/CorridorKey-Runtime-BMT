import type { AdvancedProcessingSettings } from "@/lib/advancedSettings";
import { outputRecipeChips, type OutputRecipeSettings } from "@/lib/outputRecipe";

export interface JobRecipeInput {
  presetLabel: string | null;
  modelLabel: string | null;
  videoEncodeMode: "lossless" | "balanced";
  artifactPath: string | null;
  outputRecipe: OutputRecipeSettings;
  advancedSettings: AdvancedProcessingSettings;
}

export function jobRecipeChips(input: JobRecipeInput): string[] {
  const chips = [
    `Preset ${input.presetLabel || "Default"}`,
    `Model ${input.modelLabel || "Auto"}`,
    `Encode ${input.videoEncodeMode}`,
    ...outputRecipeChips(input.outputRecipe)
  ];
  const format = artifactFormat(input.artifactPath);

  if (format) {
    chips.push(`Format ${format}`);
  }

  if (input.advancedSettings.resolution > 0) {
    chips.push(`Resolution ${input.advancedSettings.resolution}`);
  }

  chips.push(`Precision ${input.advancedSettings.precision.toUpperCase()}`);
  chips.push(`Batch ${input.advancedSettings.batchSize}`);
  chips.push(`Despill ${input.advancedSettings.despill.toFixed(2)}`);
  chips.push(`Cleanup ${input.advancedSettings.despeckle ? "on" : "off"}`);
  chips.push(`Tiling ${input.advancedSettings.tiled ? "forced" : "off"}`);
  chips.push(`Fallback ${formatMode(input.advancedSettings.qualityFallback)}`);
  chips.push(`Refine ${formatMode(input.advancedSettings.refinementMode)}`);

  return chips;
}

function artifactFormat(path: string | null): string | null {
  if (!path) {
    return null;
  }

  const match = path.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : null;
}

function formatMode(value: string): string {
  const parts = value.split("_");
  return parts
    .map((part, index) => index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(" ");
}
