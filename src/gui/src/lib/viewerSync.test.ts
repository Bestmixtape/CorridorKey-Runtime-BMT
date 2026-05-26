import { describe, expect, test } from "vitest";
import { mediaSyncAction, synchronizedMediaTime } from "@/lib/viewerSync";

describe("viewer media sync", () => {
  test("aligns follower time to the anchor when durations match", () => {
    const action = mediaSyncAction(
      { currentTime: 1.5, duration: 4, paused: false, playbackRate: 1 },
      { currentTime: 0.25, duration: 4, paused: true, playbackRate: 1 }
    );

    expect(action).toEqual({
      currentTime: 1.5,
      paused: false,
      playbackRate: null
    });
  });

  test("does not seek when drift is inside tolerance", () => {
    const action = mediaSyncAction(
      { currentTime: 1.5, duration: 4, paused: true, playbackRate: 1 },
      { currentTime: 1.55, duration: 4, paused: true, playbackRate: 1 }
    );

    expect(action.currentTime).toBeNull();
    expect(action.paused).toBeNull();
  });

  test("maps playback progress when media durations differ", () => {
    expect(synchronizedMediaTime(
      { currentTime: 2, duration: 4 },
      { duration: 8 }
    )).toBe(4);
  });

  test("clamps target time to the follower duration", () => {
    expect(synchronizedMediaTime(
      { currentTime: 12, duration: Number.NaN },
      { duration: 3 }
    )).toBe(3);
  });

  test("syncs playback rate only when it materially differs", () => {
    const action = mediaSyncAction(
      { currentTime: 1, duration: 4, paused: false, playbackRate: 0.5 },
      { currentTime: 1, duration: 4, paused: false, playbackRate: 1 }
    );

    expect(action.playbackRate).toBe(0.5);
  });
});
