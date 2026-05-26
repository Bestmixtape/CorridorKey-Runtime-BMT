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
        encode_fps: 30,
        ram_usage_mb: 512,
        cpu_usage_percent: 12.5
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
      stageLabel: "Matte",
      workerLabel: "3 workers",
      decodeFpsLabel: "62.25 fps decode",
      encodeFpsLabel: "30.00 fps encode",
      throughputLabel: "1.20 fps",
      proxyLabel: "n/a",
      ramLabel: "512MB RAM",
      cpuLabel: "12.5% CPU",
      vramLabel: "n/a",
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
    expect(summary.throughputLabel).toBe("n/a");
    expect(summary.frameLabel).toBe("n/a");
    expect(summary.stageLabel).toBe("n/a");
    expect(summary.ramLabel).toBe("n/a");
    expect(summary.cpuLabel).toBe("n/a");
    expect(summary.vramLabel).toBe("n/a");
  });

  test("turns proxy runtime telemetry into user-facing labels", () => {
    const summary = jobTelemetrySummary({
      progressPercent: 50,
      startedAtMs: 0,
      nowMs: 4_000,
      metrics: {
        active_stage: "proxy_generation",
        proxy_state: "building_preview",
        processed_frames: Number.NaN,
        total_frames: 24,
        render_fps: Number.POSITIVE_INFINITY,
        decode_fps: 48,
        encode_fps: 0,
        worker_count: 0,
        ram_usage_mb: Number.NaN,
        cpu_usage_percent: Number.POSITIVE_INFINITY,
        vram_usage_mb: Number.NEGATIVE_INFINITY
      }
    });

    expect(summary.stageLabel).toBe("Proxy generation");
    expect(summary.proxyLabel).toBe("Building preview");
    expect(summary.frameLabel).toBe("n/a");
    expect(summary.fpsLabel).toBe("n/a");
    expect(summary.decodeFpsLabel).toBe("48.00 fps decode");
    expect(summary.encodeFpsLabel).toBe("0.00 fps encode");
    expect(summary.throughputLabel).toBe("n/a");
    expect(summary.workerLabel).toBe("n/a");
    expect(summary.ramLabel).toBe("n/a");
    expect(summary.cpuLabel).toBe("n/a");
    expect(summary.vramLabel).toBe("n/a");
  });

  test("updates throughput from frame count and elapsed time", () => {
    const earlySummary = jobTelemetrySummary({
      progressPercent: 50,
      startedAtMs: 0,
      nowMs: 4_000,
      metrics: {
        processed_frames: 20,
        total_frames: 40
      }
    });
    const laterSummary = jobTelemetrySummary({
      progressPercent: 50,
      startedAtMs: 0,
      nowMs: 8_000,
      metrics: {
        processed_frames: 20,
        total_frames: 40
      }
    });

    expect(earlySummary.throughputLabel).toBe("5.00 fps");
    expect(laterSummary.throughputLabel).toBe("2.50 fps");
  });
});
