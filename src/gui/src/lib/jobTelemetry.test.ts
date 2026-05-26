import { describe, expect, test } from "vitest";
import { jobTelemetrySummary } from "@/lib/jobTelemetry";

describe("job telemetry", () => {
  test("derives elapsed time, ETA, and FPS from progress and frame timings", () => {
    const summary = jobTelemetrySummary({
      progressPercent: 25,
      startedAtMs: 0,
      nowMs: 10_000,
      metrics: {
        active_stage: "matte",
        processed_frames: 12,
        total_frames: 48,
        render_fps: 18.5,
        worker_count: 3,
        decode_fps: 62.25,
        encode_fps: 30
      },
      timings: [
        { name: "frame_total", total_ms: 2_000, sample_count: 48 },
        { name: "matte", total_ms: 500, sample_count: 48 }
      ]
    });

    expect(summary).toEqual({
      elapsedLabel: "10.0s",
      etaLabel: "30.0s",
      fpsLabel: "18.50 fps",
      frameLabel: "12 / 48 frames",
      stageLabel: "matte",
      workerLabel: "3 workers",
      decodeFpsLabel: "62.25 fps decode",
      encodeFpsLabel: "30.00 fps encode",
      stageCount: 2
    });
  });

  test("falls back to timing-derived FPS when runtime metrics are absent", () => {
    const summary = jobTelemetrySummary({
      progressPercent: 100,
      startedAtMs: 0,
      finishedAtMs: 2_000,
      nowMs: 3_000,
      timings: [
        { name: "frame_total", total_ms: 2_000, sample_count: 48 }
      ]
    });

    expect(summary.fpsLabel).toBe("24.00 fps");
    expect(summary.frameLabel).toBe("n/a");
    expect(summary.stageLabel).toBe("n/a");
  });
});
