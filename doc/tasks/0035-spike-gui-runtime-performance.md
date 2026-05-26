# Task `0035`: Spike GUI Runtime Performance

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Users want faster processing and richer progress, but the render hot path is
shared with CLI and host-plugin workflows. The GUI already keeps preview/proxy
work off the webview path. Any deeper change to frame parallelism,
decode/inference/encode pipelining, or preview-frame streaming must be
measured before implementation so a usability improvement does not regress the
runtime.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] Current decode, inference/render, post-process, encode, and preview proxy
      stages are mapped from App/Core code and existing benchmark output.
- [x] At least three candidate approaches are evaluated: native frame
      parallelism, pipelined decode/inference/encode, and lightweight
      preview-frame streaming.
- [x] Each candidate records expected user benefit, required App/Core contract,
      risk to CLI/OFX/Adobe behavior, and benchmark needed before coding.
- [x] No render hot path code changes land in this spike.
- [x] The spike recommends one implementation task, one explicit rejection, or
      a decision to defer with evidence.
- [x] Benchmark commands and comparison criteria are recorded, including the
      existing 10 percent regression rule for hot-path changes.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Read `docs/OPTIMIZATION_MEASUREMENTS.md`,
      `src/app/job_orchestrator.cpp`, `src/core/engine.cpp`,
      `src/core/inference_session.cpp`, `src/frame_io/`, and
      `src/post_process/`.
- [x] Run or identify the required `scripts/run_corpus.sh` and
      `scripts/compare_benchmarks.py` baseline for any candidate that touches
      hot-path code.
- [x] Compare GUI needs against plugin/runtime behavior before proposing an
      App/Core change.
- [x] Record the spike result in this task Notes and create a follow-up
      implementation task only if evidence supports it.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: `AGENTS.md` requires measurement against
the `phase_8_gpu_prepare` baseline for hot-path changes and rejects regressions
above 10 percent. Nuke's viewer documentation notes that visible-area caching
can improve playback but full-frame processing exists for workflows that need
it, which maps to this task's rule: optimize deliberately and measure the
trade-off.

Spike result: do not implement GUI-driven frame parallelism or deeper
decode/inference/encode changes now. `Engine::process_video` already prefetches
the next batch asynchronously and encodes the previous batch asynchronously
while the current batch runs inference. `Engine::process_sequence` batches image
sequence inference. Post-process code already uses `common::parallel_for_rows`
across color, alpha-edge, despill, despeckle, and source-passthrough paths.
The remaining performance risk is therefore not "no parallelism"; it is adding
another concurrency layer without knowing whether decode, inference, output
resize, encode, or GUI preview proxy work is the current bottleneck.

Pipeline map:

- Decode/read: `video_open_reader`, `video_decode_frame`, `video_decode_hint`,
  `sequence_read_input`, and `sequence_read_hint`.
- Hint generation: `video_generate_hint` and `sequence_generate_hint`.
- Inference/render: `video_infer_batch`, `sequence_infer_batch`,
  `render_frame`, `render_batch`, and nested session timings such as
  `frame_prepare_inputs`, `ort_run`, and `frame_extract_outputs`.
- Encode/write: `video_encode_frame`, `video_wait_for_encode`,
  `video_flush_writer`, and `sequence_write_output`.
- GUI preview proxy: Tauri `create_preview_proxy` uses the staged `ffmpeg`
  binary and a cache under the app cache directory; it is already outside the
  webview rendering path.

Candidate evaluation:

- Native frame parallelism: rejected for now. Expected benefit is higher
  throughput if multiple independent frames can keep CPU and GPU saturated, but
  it requires a clear App/Core contract for ordering, cancellation, progress,
  per-frame errors, memory ceilings, and possibly multiple sessions or execution
  contexts. Risk is high for CLI, OFX, Adobe, and Windows RTX because ONNX
  Runtime already owns intra-op threading and TensorRT RTX measurements are
  sensitive to GPU clocks, synchronization mode, transfer boundaries, and
  concurrent GPU work. This candidate needs corpus and OFX-style benchmark
  proof before any implementation.
- Deeper decode/inference/encode pipelining: deferred. Expected benefit is
  smoother utilization when decode or encode becomes visible, but the current
  video path already overlaps next-batch fetch and previous-batch encode.
  A stronger bounded-queue pipeline would need queue-depth telemetry,
  deterministic cancellation, bounded frame memory, and ordered output.
  Benchmark first; do not assume the added scheduler beats the existing simple
  overlap.
- Lightweight preview-frame streaming: held as the safest future GUI usability
  candidate, not a hot-path optimization. Expected benefit is user feedback:
  seeing representative progress frames before the final output proxy exists.
  Required contract is an optional process/event feature that emits bounded,
  low-frequency preview artifacts or thumbnails without changing default CLI,
  OFX, or Adobe rendering behavior. It still needs measurement because
  thumbnail extraction can compete with encode or disk I/O.

Benchmark gate for any follow-up that touches render or video processing:

- Build through the canonical Windows wrapper before Windows RTX claims.
- Capture a before/after corpus with stable output roots, for example
  `CORRIDORKEY_OUTPUT_ROOT=build/runtime_corpus_before scripts/run_corpus.sh`
  and `CORRIDORKEY_OUTPUT_ROOT=build/runtime_corpus_after scripts/run_corpus.sh`.
- Compare matching JSON reports with `scripts/compare_benchmarks.py`, including
  `benchmark_synthetic_primary.json`, `frame_4k/benchmark.json`,
  `video_4k_short/benchmark.json`, and `benchmark_ofx_primary.json` when the
  OFX harness is present.
- Reject the change when `avg_latency_ms` or `ort_run` regresses by more than
  10 percent against the `phase_8_gpu_prepare` baseline or the current
  benchmark gate for the touched path.
- Record GPU state during RTX measurements. TensorRT RTX guidance recommends
  monitoring GPU clocks, power, temperature, and utilization while measuring;
  use `nvidia-smi -q` before the run and `nvidia-smi dmon` during the run when
  practical.

External grounding used for the spike: TensorRT RTX performance guidance
prioritizes stable benchmarking, GPU monitoring, and transfer-isolated
measurement; ONNX Runtime documents intra-op/inter-op thread controls and warns
about contention when multiple sessions run in parallel; FFmpeg exposes
codec-level `thread_count` and `thread_type`, with frame threading increasing
decode delay by one frame per thread.

Conclusion: explicit rejection of native frame parallelism as the next GUI
slice. Defer deeper runtime pipeline changes until a measured bottleneck
supports them. The next GUI work should continue with design-system audit
(`0036`) before any performance implementation task is opened.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
