import { describe, expect, test } from "vitest";
import { jobRecipeChips } from "@/lib/jobRecipe";
import { normalizeOutputRecipe } from "@/lib/outputRecipe";

describe("job recipe chips", () => {
  test("keeps the visible runtime recipe summary concise", () => {
    const chips = jobRecipeChips({
      presetLabel: "Preview",
      modelLabel: "Green Matting",
      videoEncodeMode: "balanced",
      artifactPath: "C:\\Shots\\result.mov",
      outputRecipe: normalizeOutputRecipe({})
    });

    expect(chips).toEqual([
      "Preset Preview",
      "Model Green Matting",
      "Encode balanced",
      "Output Movie",
      "Format MOV"
    ]);
  });
});
