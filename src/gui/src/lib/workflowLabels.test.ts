import { describe, expect, test } from "vitest";
import {
  artifactOptionStatusLabel,
  displayModeLabel,
  hintModeLabel,
  modelOptionLabel,
  modelOptionValue,
  presetOptionLabel,
  presetOptionValue,
  screenColorLabel
} from "@/lib/workflowLabels";

describe("workflow labels", () => {
  test("formats preset and model options from runtime catalog entries", () => {
    expect(presetOptionValue({ id: "fast", name: "Fast Green" })).toBe("fast");
    expect(presetOptionLabel({ id: "fast", name: "Fast Green" })).toBe("Fast Green");
    expect(modelOptionValue({ path: "models\\green.onnx", filename: "green.onnx" })).toBe("models\\green.onnx");
    expect(modelOptionLabel({
      filename: "green.onnx",
      resolution: 1024,
      artifact_state: { state: "recommended" }
    })).toBe("green.onnx - 1024px - recommended");
  });

  test("uses conservative readable labels for workflow modes", () => {
    expect(artifactOptionStatusLabel("needs_image_source")).toBe("Image source");
    expect(artifactOptionStatusLabel("awaiting_runtime_contract")).toBe("Needs runtime support");
    expect(displayModeLabel("runtime_default")).toBe("Runtime default");
    expect(hintModeLabel(null)).toBe("Runtime fallback");
    expect(screenColorLabel(null)).toBe("Runtime preset");
  });
});
