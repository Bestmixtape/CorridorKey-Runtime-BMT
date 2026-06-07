import { outputRecipeChips, type OutputRecipeSettings } from "@/lib/outputRecipe";

export interface JobRecipeInput {
  presetLabel: string | null;
  modelLabel: string | null;
  videoEncodeMode: "lossless" | "balanced";
  artifactPath: string | null;
  outputRecipe: OutputRecipeSettings;
}

export function jobRecipeChips(input: JobRecipeInput): string[] {
  const chips = [
    `Preset ${input.presetLabel || "Default"}`
  ];
  if (input.modelLabel) {
    chips.push(`Model ${input.modelLabel}`);
  }
  chips.push(`Encode ${input.videoEncodeMode}`);

  const outputChip = outputRecipeChips(input.outputRecipe).find((chip) =>
    chip.startsWith("Output ")
  );
  if (outputChip) {
    chips.push(outputChip);
  }

  const format = artifactFormat(input.artifactPath);

  if (format) {
    chips.push(`Format ${format}`);
  }

  return chips;
}

function artifactFormat(path: string | null): string | null {
  if (!path) {
    return null;
  }

  const match = path.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : null;
}
