import { describe, expect, test } from "vitest";
import { jobRecipeChips } from "@/lib/jobRecipe";
import type { AdvancedProcessingSettings } from "@/lib/advancedSettings";
import { normalizeOutputRecipe } from "@/lib/outputRecipe";

describe("job recipe chips", () => {
  test("summarizes selected runtime recipe and artifact metadata", () => {
    const chips = jobRecipeChips({
      presetLabel: "Preview",
      modelLabel: "Green Matting",
      videoEncodeMode: "balanced",
      artifactPath: "C:\\Shots\\result.mov",
      outputRecipe: normalizeOutputRecipe({}),
      advancedSettings: {
        qualityFallback: "coarse_to_fine",
        refinementMode: "tiled",
        precision: "fp16",
        resolution: 2048,
        batchSize: 3,
        despill: 0.25,
        despeckle: true,
        tiled: true
      } satisfies AdvancedProcessingSettings
    });

    expect(chips).toEqual([
      "Preset Preview",
      "Model Green Matting",
      "Encode balanced",
      "Output Movie",
      "Alpha Composited preview",
      "Preview Checkerboard",
      "Color Runtime default",
      "Format MOV",
      "Resolution 2048",
      "Precision FP16",
      "Batch 3",
      "Despill 0.25",
      "Cleanup on",
      "Tiling forced",
      "Fallback Coarse to fine",
      "Refine Tiled"
    ]);
  });
});
