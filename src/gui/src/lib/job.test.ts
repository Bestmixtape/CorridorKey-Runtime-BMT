import { describe, expect, test } from "vitest";
import {
  artifactOutputPathFromProgress,
  artifactPreviewPathFromProgress,
  loadSelectedPresetPreference,
  persistSelectedPresetPreference,
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
    expect(artifactOutputPathFromProgress(payload)).toBe(
      "C:\\renders\\shot001"
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

describe("job preset preference", () => {
  test("persists the selected preset id and clears blank selections", () => {
    const storage = new MemoryStorage();

    persistSelectedPresetPreference("win-rtx-ultra-quality", storage);
    expect(loadSelectedPresetPreference(storage)).toBe("win-rtx-ultra-quality");

    persistSelectedPresetPreference("", storage);
    expect(loadSelectedPresetPreference(storage)).toBeNull();
  });
});

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}
