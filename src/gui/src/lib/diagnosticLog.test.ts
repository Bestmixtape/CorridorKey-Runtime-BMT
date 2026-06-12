import { describe, expect, test } from "vitest";
import { buildDiagnosticSummary } from "@/lib/diagnosticLog";

describe("diagnostic log summary", () => {
  test("builds a copyable job summary from status, timings, warnings, and raw logs", () => {
    const summary = buildDiagnosticSummary({
      status: "failed",
      statusMessage: "Processing failed",
      backend: "tensorrt",
      artifactPath: "C:\\Shots\\result.mov",
      error: "Runtime fixture failed",
      warnings: ["Fallback probe skipped"],
      recipeChips: [
        "Preset Preview",
        "Model Green Matting",
        "Output Movie",
        "Alpha Composited preview"
      ],
      artifactMetadata: {
        output_recipe: "Movie",
        artifact_family: "movie",
        video_encode: "balanced"
      },
      metrics: {
        render_fps: 18.5,
        processed_frames: 12,
        total_frames: 24,
        worker_count: 3
      },
      timings: [
        { name: "frame_total", total_ms: 1000, sample_count: 24 },
        { name: "matte", total_ms: 12.5 }
      ],
      logs: [
        "{\"type\":\"backend_selected\",\"backend\":\"tensorrt\"}",
        "{\"type\":\"failed\",\"message\":\"Runtime fixture failed\"}"
      ]
    });

    expect(summary).toContain("Status: failed");
    expect(summary).toContain("Backend: tensorrt");
    expect(summary).toContain("Artifact: C:\\Shots\\result.mov");
    expect(summary).toContain("Error: Runtime fixture failed");
    expect(summary).toContain("Warnings:");
    expect(summary).toContain("- Fallback probe skipped");
    expect(summary).toContain("Job recipe:");
    expect(summary).toContain("- Model Green Matting");
    expect(summary).toContain("Artifact metadata:");
    expect(summary).toContain("output_recipe: Movie");
    expect(summary).toContain("video_encode: balanced");
    expect(summary).toContain("Metrics:");
    expect(summary).toContain("render_fps: 18.5");
    expect(summary).toContain("processed_frames: 12");
    expect(summary).toContain("frame_total: 1000.0ms (24 samples)");
    expect(summary).toContain("Raw logs:");
  });
});
