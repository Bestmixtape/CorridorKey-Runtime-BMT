import { describe, expect, test } from "vitest";
import {
  CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES,
  DEFAULT_OUTPUT_RECIPE,
  isOutputPathReady,
  normalizeOutputRecipe,
  outputArtifactOptions,
  primaryOutputArtifactOptions,
  outputRecipeControlOptions,
  outputRecipeChips,
  outputRecipeLabel,
  previewBackgroundStyle,
  suggestOutputPathForRecipe,
  type RuntimeOutputRecipeCapabilities
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
    ).toBe("D:\\Renders\\plate_corridorkey_exr");
  });

  test("treats selected source folders as sequence-capable inputs", () => {
    expect(outputArtifactOptions("C:\\Shots\\JordanSequence").map((option) => [
      option.value,
      option.enabled
    ])).toEqual([
      ["movie", false],
      ["exr_sequence", true],
      ["png_sequence", false],
      ["preview_only", false]
    ]);

    expect(
      suggestOutputPathForRecipe(
        "C:\\Shots\\JordanSequence",
        null,
        "D:\\Renders",
        DEFAULT_OUTPUT_RECIPE
      )
    ).toBe("D:\\Renders\\JordanSequence_corridorkey_exr");
  });

  test("uses native folder selection context for dotted project folder names", () => {
    const dottedFolder = "C:\\Shots\\Project.v001";
    const selectedAsFolder = { selectedAsFolder: true };

    expect(outputArtifactOptions(dottedFolder, selectedAsFolder).map((option) => [
      option.value,
      option.enabled
    ])).toEqual([
      ["movie", false],
      ["exr_sequence", true],
      ["png_sequence", false],
      ["preview_only", false]
    ]);
    expect(
      suggestOutputPathForRecipe(
        dottedFolder,
        null,
        "D:\\Renders",
        DEFAULT_OUTPUT_RECIPE,
        selectedAsFolder
      )
    ).toBe("D:\\Renders\\Project.v001_corridorkey_exr");
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
      ["png_sequence", false],
      ["preview_only", false]
    ]);
  });

  test("keeps primary output choices limited to currently runnable artifacts", () => {
    expect(
      primaryOutputArtifactOptions(outputArtifactOptions("C:\\Shots\\plate.mov")).map((option) => option.value)
    ).toEqual(["movie"]);

    expect(
      primaryOutputArtifactOptions(outputArtifactOptions("C:\\Shots\\plate.exr")).map((option) => option.value)
    ).toEqual(["exr_sequence"]);
  });

  test("uses runtime capabilities to reopen future output families", () => {
    const expandedCapabilities: RuntimeOutputRecipeCapabilities = {
      ...CURRENT_RUNTIME_OUTPUT_RECIPE_CAPABILITIES,
      artifact_families: ["movie", "exr_sequence", "png_sequence", "preview_only"],
      movie_alpha_modes: ["transparent", "composited_preview"],
      replacement_media_output: true,
      color_intents: ["runtime_default", "linear_srgb"]
    };

    expect(outputArtifactOptions("C:\\Shots\\plate.exr", {}, expandedCapabilities).map((option) => [
      option.value,
      option.enabled,
      option.status
    ])).toEqual([
      ["movie", false, "needs_video_source"],
      ["exr_sequence", true, "supported"],
      ["png_sequence", true, "supported"],
      ["preview_only", true, "supported"]
    ]);

    const controls = outputRecipeControlOptions(DEFAULT_OUTPUT_RECIPE, expandedCapabilities);

    expect(controls.alphaModes.find((option) => option.value === "transparent")).toMatchObject({
      enabled: true,
      status: "supported"
    });
    expect(controls.previewBackgrounds.find((option) => option.value === "replacement_media")).toMatchObject({
      enabled: true,
      status: "preview_only"
    });
    expect(controls.colorIntents.find((option) => option.value === "linear_srgb")).toMatchObject({
      enabled: true,
      status: "supported"
    });
    expect(
      suggestOutputPathForRecipe(
        "C:\\Shots\\plate.png",
        null,
        "D:\\Renders",
        normalizeOutputRecipe({ artifactFamily: "png_sequence" }),
        {},
        expandedCapabilities
      )
    ).toBe("D:\\Renders\\plate_corridorkey_png");
  });

  test("checks output path readiness per artifact family", () => {
    expect(isOutputPathReady("C:\\Shots\\result.mov", DEFAULT_OUTPUT_RECIPE)).toBe(true);
    expect(isOutputPathReady("C:\\Shots\\result.mp4", DEFAULT_OUTPUT_RECIPE)).toBe(true);
    expect(isOutputPathReady("C:\\Shots\\result.exr", DEFAULT_OUTPUT_RECIPE)).toBe(false);
    expect(isOutputPathReady("C:\\Shots\\result", DEFAULT_OUTPUT_RECIPE)).toBe(false);
    expect(
      isOutputPathReady("C:\\Shots\\result_exr", normalizeOutputRecipe({ artifactFamily: "exr_sequence" }))
    ).toBe(true);
  });

  test("replaces invalid movie extensions with a runnable movie suggestion", () => {
    expect(
      suggestOutputPathForRecipe(
        "C:\\Shots\\Jordan4k.mp4",
        "C:\\Users\\Smoke\\Downloads\\Jordan4k_corridorkey.exr",
        "C:\\Users\\Smoke\\Downloads",
        DEFAULT_OUTPUT_RECIPE
      )
    ).toBe("C:\\Users\\Smoke\\Downloads\\Jordan4k_corridorkey.mov");
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
      "Alpha EXR bundle",
      "Preview Solid #111827",
      "Color Linear sRGB"
    ]);
  });

  test("tracks replacement media as a preview background choice", () => {
    const recipe = normalizeOutputRecipe({
      previewBackground: "replacement_media",
      replacementMediaPath: "C:\\Shots\\clean_plate.mov"
    });

    expect(recipe.replacementMediaPath).toBe("C:\\Shots\\clean_plate.mov");
    expect(outputRecipeChips(recipe)).toContain("Preview Replacement clean_plate.mov");
  });

  test("uses design-system utility classes for preview backgrounds", () => {
    expect(previewBackgroundStyle(DEFAULT_OUTPUT_RECIPE)).toEqual({
      className: "ck-preview-checkerboard"
    });

    expect(
      previewBackgroundStyle(normalizeOutputRecipe({
        previewBackground: "solid",
        previewSolidColor: "#101010"
      }))
    ).toEqual({
      className: "bg-zinc-950",
      style: { backgroundColor: "#101010" }
    });
  });

  test("classifies recipe controls by the current runtime output contract", () => {
    const controls = outputRecipeControlOptions(DEFAULT_OUTPUT_RECIPE);

    expect(controls.alphaModes.map((option) => [
      option.value,
      option.enabled,
      option.status
    ])).toEqual([
      ["transparent", false, "awaiting_runtime_contract"],
      ["matte_only", false, "awaiting_runtime_contract"],
      ["composited_preview", true, "supported"]
    ]);
    expect(controls.previewBackgrounds.find((option) => option.value === "replacement_media")).toMatchObject({
      enabled: true,
      status: "preview_only"
    });
    expect(controls.colorIntents.map((option) => [
      option.value,
      option.enabled,
      option.status
    ])).toEqual([
      ["runtime_default", true, "supported"],
      ["linear_srgb", false, "awaiting_runtime_contract"]
    ]);
  });

  test("fails closed for partial runtime output contracts", () => {
    const partialCapabilities: RuntimeOutputRecipeCapabilities = {
      artifact_families: ["movie"]
    };

    expect(outputArtifactOptions("C:\\Shots\\plate.mov", {}, partialCapabilities).map((option) => [
      option.value,
      option.enabled,
      option.status
    ])).toEqual([
      ["movie", true, "supported"],
      ["exr_sequence", false, "awaiting_runtime_contract"],
      ["png_sequence", false, "awaiting_runtime_contract"],
      ["preview_only", false, "awaiting_runtime_contract"]
    ]);

    const controls = outputRecipeControlOptions(DEFAULT_OUTPUT_RECIPE, partialCapabilities);

    expect(controls.alphaModes.every((option) => !option.enabled)).toBe(true);
    expect(controls.previewBackgrounds.map((option) => [
      option.value,
      option.enabled,
      option.status
    ])).toEqual([
      ["checkerboard", true, "preview_only"],
      ["solid", true, "preview_only"],
      ["transparent", true, "preview_only"],
      ["replacement_media", true, "preview_only"]
    ]);
    expect(controls.colorIntents.every((option) => !option.enabled)).toBe(true);
  });
});
