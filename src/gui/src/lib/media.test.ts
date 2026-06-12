import { describe, expect, test } from "vitest";
import {
  fileExtension,
  fileName,
  hasFileExtension,
  previewKindForPath,
  suggestOutputPath
} from "./media";

describe("media helpers", () => {
  test("extracts filenames and extensions from Windows paths", () => {
    expect(fileName("C:\\Shots\\Jordan4k.mp4")).toBe("Jordan4k.mp4");
    expect(fileExtension("C:\\Shots\\Jordan4k.mp4")).toBe("mp4");
    expect(hasFileExtension("C:\\Shots\\Jordan4k.mp4")).toBe(true);
  });

  test("classifies browser previewable media separately from EXR", () => {
    expect(previewKindForPath("C:\\Shots\\source.mov")).toBe("video");
    expect(previewKindForPath("C:\\Shots\\alpha.png")).toBe("image");
    expect(previewKindForPath("C:\\Shots\\plate.exr")).toBe("unsupported");
  });

  test("suggests a movie file when the default output is only a folder", () => {
    expect(
      suggestOutputPath(
        "C:\\Shots\\Jordan4k.mp4",
        "C:\\Users\\Smoke\\Downloads",
        "C:\\Users\\Smoke\\Downloads"
      )
    ).toBe("C:\\Users\\Smoke\\Downloads\\Jordan4k_corridorkey.mov");
  });

  test("does not replace an explicit output filename", () => {
    expect(
      suggestOutputPath(
        "C:\\Shots\\Jordan4k.mp4",
        "C:\\Renders\\manual.mov",
        "C:\\Users\\Smoke\\Downloads"
      )
    ).toBeNull();
  });
});
