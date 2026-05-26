import { describe, expect, test } from "vitest";
import {
  comparisonClipStyle,
  comparisonDividerGeometry,
  comparisonPositionFromPoint,
  resolveComparisonState
} from "@/lib/viewerCompare";

describe("viewer comparison", () => {
  test("compares source against result with a vertical wipe when result is active", () => {
    const state = resolveComparisonState(
      [
        { id: "source", label: "Source", path: "C:\\Shots\\input.mp4" },
        { id: "hint", label: "Alpha Hint", path: "C:\\Shots\\hint.mp4" },
        { id: "result", label: "Result", path: "C:\\Shots\\output.mov" }
      ],
      "result",
      "vertical"
    );

    expect(state).toEqual({
      mode: "vertical",
      canCompare: true,
      primary: { id: "source", label: "Source", path: "C:\\Shots\\input.mp4" },
      secondary: { id: "result", label: "Result", path: "C:\\Shots\\output.mov" },
      title: "Source vs Result"
    });
    expect(comparisonClipStyle("vertical", 50)).toEqual({ clipPath: "inset(0 50% 0 0)" });
  });

  test("falls back to single view when comparison buffers are missing", () => {
    const state = resolveComparisonState(
      [
        { id: "source", label: "Source", path: "C:\\Shots\\input.mp4" },
        { id: "hint", label: "Alpha Hint", path: null },
        { id: "result", label: "Result", path: null }
      ],
      "source",
      "diagonal"
    );

    expect(state.mode).toBe("single");
    expect(state.canCompare).toBe(false);
    expect(state.title).toBe("Source");
  });

  test("builds horizontal and full-bounds diagonal clip styles", () => {
    expect(comparisonClipStyle("horizontal", 25)).toEqual({ clipPath: "inset(0 0 75% 0)" });
    expect(comparisonClipStyle("diagonal", 40)).toEqual({
      clipPath: "polygon(0 0, 80% 0, -20% 100%, 0 100%)"
    });
  });

  test("builds divider geometry that matches the wipe surface", () => {
    expect(comparisonDividerGeometry("vertical", 35)).toEqual({
      kind: "vertical",
      x1: 35,
      y1: 0,
      x2: 35,
      y2: 100
    });
    expect(comparisonDividerGeometry("horizontal", 65)).toEqual({
      kind: "horizontal",
      x1: 0,
      y1: 65,
      x2: 100,
      y2: 65
    });
    expect(comparisonDividerGeometry("diagonal", 40)).toEqual({
      kind: "diagonal",
      x1: 80,
      y1: 0,
      x2: -20,
      y2: 100
    });
  });

  test("derives wipe position from pointer coordinates", () => {
    expect(comparisonPositionFromPoint("vertical", 10, 90)).toBe(10);
    expect(comparisonPositionFromPoint("horizontal", 10, 90)).toBe(90);
    expect(comparisonPositionFromPoint("diagonal", 80, 20)).toBe(50);
    expect(comparisonPositionFromPoint("diagonal", 200, 200)).toBe(100);
  });
});
