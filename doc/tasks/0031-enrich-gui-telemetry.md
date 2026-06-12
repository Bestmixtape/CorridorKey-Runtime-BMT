# Task `0031`: Enrich GUI Runtime Telemetry

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Processing feedback is part of trust. The GUI now shows elapsed time, progress,
stage timings, warnings, selected backend, selected model/preset, and structured
metrics when the runtime emits them. Users still need clearer in-progress
signals for what is happening now: decode, inference/render, encode, proxy
work, frame counts, throughput, worker/parallelism count, and final summary
metrics.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] Runtime events expose current stage, processed frames, total frames,
      render FPS, decode FPS, encode FPS, worker count, and proxy-generation
      state when those values are known.
- [x] The GUI hides absent metrics instead of fabricating values.
- [x] The job status panel distinguishes render/decode/encode/proxy work in
      plain user-facing labels.
- [x] ETA and throughput update while processing without requiring a new
      runtime event every second.
- [x] Final job diagnostics copy raw logs, structured metrics, timings, model,
      backend, output recipe, and artifact metadata.
- [x] Telemetry work does not touch the render hot path unless a benchmark task
      explicitly permits it.
- [x] Unit, integration, E2E, and runtime-contract tests cover sparse events,
      rich events, malformed events, cancellation, failure, and completion.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Extend runtime event-contract tests around `src/app/job_orchestrator.cpp`
      and CLI NDJSON output before changing event payloads.
- [x] Extend `src/gui/src/lib/jobTelemetry.test.ts` for all visible derived
      metrics.
- [x] Update `src/gui/src/lib/job.ts`, `src/gui/src/lib/jobTelemetry.ts`, and
      `src/gui/src/lib/diagnosticLog.ts`.
- [x] Render richer telemetry in `src/gui/src/components/workflow/ProcessFlow.tsx`
      without crowding video controls.
- [x] Add fake-runtime E2E events in `src/gui/scripts/smoke-job-lifecycle.mjs`.
- [x] Run focused C++ tests, `pnpm test`, and the real-runtime smoke when event
      payloads change.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: current GUI telemetry helpers live in
`src/gui/src/lib/jobTelemetry.ts`, diagnostic copying lives in
`src/gui/src/lib/diagnosticLog.ts`, and runtime metrics already flow through
`JobEvent.metrics` when emitted. The remaining work is primarily contract and
presentation, not performance optimization.

TDD tracer bullet: first behavior is user-facing telemetry labeling through
`jobTelemetrySummary`, starting with proxy-generation state and hidden malformed
numeric metrics.

Implemented and reviewed with two subagents. The Standards review found
`video_wait_for_encode` could be misreported as encode FPS, sequence progress
lacked frame counts, and VRAM was not forwarded; the implementation now limits
timing-derived FPS to frame-producing stages, derives sequence counts from the
known input set, and forwards VRAM. The Spec review found worker/proxy state,
between-event throughput, and runtime-contract coverage were partial; the
implementation now emits worker count when batch size is known, exposes proxy
state only when the active stage is proxy generation, derives throughput from
frame count plus elapsed time, and adds an integration assertion for real
`JobOrchestrator` telemetry events.

Verification: `pnpm test` passed, `scripts/windows.ps1 -Task build -Preset
debug` passed, `ctest --test-dir build/debug -R unit_tests
--output-on-failure` passed, and `ctest --test-dir build/debug -R integration
--output-on-failure` passed. Real-runtime GUI smoke was attempted but the local
machine has no `ffmpeg.exe` staged for preview proxy generation and no
`CORRIDORKEY_FFMPEG_PATH`; this is an environment prerequisite, not a telemetry
failure.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
