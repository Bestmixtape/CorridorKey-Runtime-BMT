import { describe, expect, test } from "vitest";
import {
  advancedProcessingPayload,
  normalizeAdvancedSettings,
  RESOLUTION_OPTIONS,
  type AdvancedProcessingSettings
} from "@/lib/advancedSettings";

describe("advanced processing settings", () => {
  test("normalizes runtime controls into the Tauri process payload", () => {
    const settings = normalizeAdvancedSettings({
      qualityFallback: "coarse_to_fine",
      refinementMode: "tiled",
      precision: "fp16",
      resolution: 2048,
      batchSize: 3,
      despill: 0.25,
      despeckle: true,
      tiled: true
    } satisfies Partial<AdvancedProcessingSettings>);

    expect(advancedProcessingPayload(settings)).toEqual({
      quality_fallback: "coarse_to_fine",
      refinement_mode: "tiled",
      precision: "fp16",
      resolution: 2048,
      batch_size: 3,
      despill: 0.25,
      despeckle: true,
      tiled: true
    });
  });

  test("omits untouched defaults from the Tauri process payload", () => {
    const settings = normalizeAdvancedSettings({});

    expect(advancedProcessingPayload(settings)).toEqual({});
  });

  test("omits retired 768px resolution from Windows runtime choices", () => {
    expect(RESOLUTION_OPTIONS.map((option) => option.value)).toEqual([
      0,
      512,
      1024,
      1536,
      2048
    ]);

    expect(normalizeAdvancedSettings({ resolution: 768 as never }).resolution).toBe(0);
  });
});
