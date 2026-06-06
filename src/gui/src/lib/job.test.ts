import { describe, expect, test } from "vitest";
import {
  artifactPreviewPathFromProgress,
  type JobProgress
} from "@/lib/job";

describe("job artifact preview path", () => {
  test("prefers preview artifact when runtime output is a directory", () => {
    const payload: JobProgress = {
      type: "artifact_written",
      artifact_path: "C:\\renders\\shot001",
      preview_artifact_path: "C:\\renders\\shot001\\comp_0001.png"
    };

    expect(artifactPreviewPathFromProgress(payload)).toBe(
      "C:\\renders\\shot001\\comp_0001.png"
    );
  });

  test("falls back to primary artifact path", () => {
    const payload: JobProgress = {
      type: "artifact_written",
      artifact_path: "C:\\renders\\shot001.mov"
    };

    expect(artifactPreviewPathFromProgress(payload)).toBe(
      "C:\\renders\\shot001.mov"
    );
  });
});
