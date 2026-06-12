import { describe, expect, test } from "vitest";
import {
  availableComparisonPairOptions,
  comparisonPairOptions,
  comparisonClipStyle,
  comparisonDividerGeometry,
  comparisonDividerHandlePoint,
  comparisonPositionFromPoint,
  autoComparisonModeFromPoint,
  autoComparisonModeFromDrag,
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

  test("keeps auto compare active when comparison buffers are available", () => {
    const state = resolveComparisonState(
      [
        { id: "source", label: "Source", path: "C:\\Shots\\input.mp4" },
        { id: "hint", label: "Alpha Hint", path: null },
        { id: "result", label: "Result", path: "C:\\Shots\\output.mov" }
      ],
      "result",
      "auto"
    );

    expect(state.mode).toBe("auto");
    expect(state.canCompare).toBe(true);
    expect(state.title).toBe("Source vs Result");
  });

  test("describes comparison pair availability and swapped labels", () => {
    const options = comparisonPairOptions(
      [
        { id: "source", label: "Source", path: "C:\\Shots\\input.mp4" },
        { id: "hint", label: "Alpha Hint", path: null },
        { id: "result", label: "Result", path: "C:\\Shots\\output.mov" }
      ],
      true
    );

    expect(options).toEqual([
      {
        id: "source-result",
        label: "Result / Source",
        primaryId: "result",
        secondaryId: "source",
        available: true,
        unavailableReason: null
      },
      {
        id: "source-hint",
        label: "Alpha Hint / Source",
        primaryId: "hint",
        secondaryId: "source",
        available: false,
        unavailableReason: "Missing Alpha Hint"
      },
      {
        id: "hint-result",
        label: "Result / Alpha Hint",
        primaryId: "result",
        secondaryId: "hint",
        available: false,
        unavailableReason: "Missing Alpha Hint"
      }
    ]);
  });

  test("filters comparison controls to available media pairs", () => {
    const options = availableComparisonPairOptions([
      { id: "source", label: "Source", path: "C:\\Shots\\input.mp4" },
      { id: "hint", label: "Alpha Hint", path: null },
      { id: "result", label: "Result", path: "C:\\Shots\\output.mov" }
    ]);

    expect(options.map((option) => option.id)).toEqual(["source-result"]);
  });

  test("resolves explicit pair selection and side swapping", () => {
    const buffers = [
      { id: "source", label: "Source", path: "C:\\Shots\\input.mp4" },
      { id: "hint", label: "Alpha Hint", path: "C:\\Shots\\hint.mp4" },
      { id: "result", label: "Result", path: "C:\\Shots\\output.mov" }
    ];

    expect(resolveComparisonState(buffers, "source", "overlay", {
      pairId: "hint-result",
      swapped: false
    })).toMatchObject({
      mode: "overlay",
      canCompare: true,
      primary: buffers[1],
      secondary: buffers[2],
      title: "Alpha Hint vs Result"
    });

    expect(resolveComparisonState(buffers, "source", "overlay", {
      pairId: "hint-result",
      swapped: true
    })).toMatchObject({
      primary: buffers[2],
      secondary: buffers[1],
      title: "Result vs Alpha Hint"
    });
  });

  test("builds horizontal and full-bounds diagonal clip styles", () => {
    expect(comparisonClipStyle("horizontal", 25)).toEqual({ clipPath: "inset(0 0 75% 0)" });
    expect(comparisonClipStyle("diagonal", 40)).toEqual({
      clipPath: "polygon(0 0, 80% 0, 0 80%)"
    });
    expect(comparisonClipStyle("diagonal", 75)).toEqual({
      clipPath: "polygon(0 0, 100% 0, 100% 50%, 50% 100%, 0 100%)"
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
      x2: 0,
      y2: 80
    });
    expect(comparisonDividerGeometry("diagonal", 75)).toEqual({
      kind: "diagonal",
      x1: 100,
      y1: 50,
      x2: 50,
      y2: 100
    });
  });

  test("places the draggable handle at the center of each divider", () => {
    expect(comparisonDividerHandlePoint("vertical", 35)).toEqual({ x: 35, y: 50 });
    expect(comparisonDividerHandlePoint("horizontal", 65)).toEqual({ x: 50, y: 65 });
    expect(comparisonDividerHandlePoint("diagonal", 75)).toEqual({ x: 75, y: 75 });
  });

  test("derives wipe position from pointer coordinates", () => {
    expect(comparisonPositionFromPoint("vertical", 10, 90)).toBe(10);
    expect(comparisonPositionFromPoint("horizontal", 10, 90)).toBe(90);
    expect(comparisonPositionFromPoint("diagonal", 80, 20)).toBe(50);
    expect(comparisonPositionFromPoint("diagonal", 200, 200)).toBe(100);
  });

  test("chooses an auto wipe mode from the drag direction", () => {
    expect(autoComparisonModeFromPoint(90, 52)).toBe("vertical");
    expect(autoComparisonModeFromPoint(52, 90)).toBe("horizontal");
    expect(autoComparisonModeFromPoint(82, 82)).toBe("diagonal");
    expect(autoComparisonModeFromPoint(50, 50)).toBe("vertical");
  });

  test("locks auto wipe mode from the first drag movement", () => {
    expect(autoComparisonModeFromDrag(
      { xPercent: 50, yPercent: 50 },
      { xPercent: 50.25, yPercent: 50.25 }
    )).toBeNull();
    expect(autoComparisonModeFromDrag(
      { xPercent: 20, yPercent: 50 },
      { xPercent: 35, yPercent: 90 }
    )).toBe("horizontal");
    expect(autoComparisonModeFromDrag(
      { xPercent: 50, yPercent: 50 },
      { xPercent: 82, yPercent: 82 }
    )).toBe("diagonal");
  });

});
