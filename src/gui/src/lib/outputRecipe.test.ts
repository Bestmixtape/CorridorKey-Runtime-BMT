import { describe, expect, test } from "vitest";
import {
  DEFAULT_OUTPUT_RECIPE,
  isOutputPathReady,
  normalizeOutputRecipe,
  outputArtifactOptions,
  outputRecipeChips,
  outputRecipeLabel,
  suggestOutputPathForRecipe
} from "@/lib/outputRecipe";

describe("output recipe", () => {
  test("suggests movie output for video sources", () => {
    expect(
      suggestOutputPathForRecipe(
        "C:\\Shots\\Jordan4k.mp4",
        null,
        "C:\\Users\\Smoke\\Downloads",
        DEFAULT_OUTPUT_RECIPE
      )
    ).toBe("C:\\Users\\Smoke\\Downloads\\Jordan4k_corridorkey.mov");
  });

  test("suggests sequence output directories for image sources", () => {
    const exrRecipe = normalizeOutputRecipe({ artifactFamily: "exr_sequence" });
    const pngRecipe = normalizeOutputRecipe({ artifactFamily: "png_sequence" });

    expect(
      suggestOutputPathForRecipe("C:\\Shots\\plate.exr", null, "D:\\Renders", exrRecipe)
    ).toBe("D:\\Renders\\plate_corridorkey_exr");
    expect(
      suggestOutputPathForRecipe("C:\\Shots\\plate.png", null, "D:\\Renders", pngRecipe)
    ).toBe("D:\\Renders\\plate_corridorkey_png");
  });

  test("reports artifact availability from the selected source", () => {
    expect(outputArtifactOptions("C:\\Shots\\plate.mov").map((option) => [
      option.value,
      option.enabled
    ])).toEqual([
      ["movie", true],
      ["exr_sequence", false],
      ["png_sequence", false],
      ["preview_only", false]
    ]);

    expect(outputArtifactOptions("C:\\Shots\\plate.exr").map((option) => [
      option.value,
      option.enabled
    ])).toEqual([
      ["movie", false],
      ["exr_sequence", true],
      ["png_sequence", true],
      ["preview_only", false]
    ]);
  });

  test("checks output path readiness per artifact family", () => {
    expect(isOutputPathReady("C:\\Shots\\result.mov", DEFAULT_OUTPUT_RECIPE)).toBe(true);
    expect(isOutputPathReady("C:\\Shots\\result", DEFAULT_OUTPUT_RECIPE)).toBe(false);
    expect(
      isOutputPathReady("C:\\Shots\\result_exr", normalizeOutputRecipe({ artifactFamily: "exr_sequence" }))
    ).toBe(true);
  });

  test("builds concise user-facing labels and chips", () => {
    const recipe = normalizeOutputRecipe({
      artifactFamily: "exr_sequence",
      alphaMode: "transparent",
      previewBackground: "solid",
      previewSolidColor: "#111827",
      colorIntent: "linear_srgb"
    });

    expect(outputRecipeLabel(recipe)).toBe("EXR sequence");
    expect(outputRecipeChips(recipe)).toEqual([
      "Output EXR sequence",
      "Alpha Transparent",
      "Preview Solid #111827",
      "Color Linear sRGB"
    ]);
  });
});
