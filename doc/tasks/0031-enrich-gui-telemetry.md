# Task `0031`: Enrich GUI Runtime Telemetry

**Status:** proposed
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

- [ ] Runtime events expose current stage, processed frames, total frames,
      render FPS, decode FPS, encode FPS, worker count, and proxy-generation
      state when those values are known.
- [ ] The GUI hides absent metrics instead of fabricating values.
- [ ] The job status panel distinguishes render/decode/encode/proxy work in
      plain user-facing labels.
- [ ] ETA and throughput update while processing without requiring a new
      runtime event every second.
- [ ] Final job diagnostics copy raw logs, structured metrics, timings, model,
      backend, output recipe, and artifact metadata.
- [ ] Telemetry work does not touch the render hot path unless a benchmark task
      explicitly permits it.
- [ ] Unit, integration, E2E, and runtime-contract tests cover sparse events,
      rich events, malformed events, cancellation, failure, and completion.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Extend runtime event-contract tests around `src/app/job_orchestrator.cpp`
      and CLI NDJSON output before changing event payloads.
- [ ] Extend `src/gui/src/lib/jobTelemetry.test.ts` for all visible derived
      metrics.
- [ ] Update `src/gui/src/lib/job.ts`, `src/gui/src/lib/jobTelemetry.ts`, and
      `src/gui/src/lib/diagnosticLog.ts`.
- [ ] Render richer telemetry in `src/gui/src/components/workflow/ProcessFlow.tsx`
      without crowding video controls.
- [ ] Add fake-runtime E2E events in `src/gui/scripts/smoke-job-lifecycle.mjs`.
- [ ] Run focused C++ tests, `pnpm test`, and the real-runtime smoke when event
      payloads change.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: current GUI telemetry helpers live in
`src/gui/src/lib/jobTelemetry.ts`, diagnostic copying lives in
`src/gui/src/lib/diagnosticLog.ts`, and runtime metrics already flow through
`JobEvent.metrics` when emitted. The remaining work is primarily contract and
presentation, not performance optimization.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
