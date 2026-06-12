# Task `0025`: Implement GUI Job Lifecycle

**Status:** done
**Created:** 2026-05-25
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Non-CLI users need the GUI to own a complete local processing lifecycle after
runtime readiness succeeds. The current GUI can start a runtime process, but
the first useful desktop workflow needs observable terminal states, cancellation
and retry behavior, structured event handling, and smoke coverage for fake
runtime jobs before result preview work builds on top of it.

This task owns the single-active-job lifecycle only. It preserves App/Core
ownership of processing policy by adapting runtime `process --json` events in
Tauri and React without reimplementing model selection, fallback policy, output
recipes, or diagnostics in TypeScript.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] Starting a job launches one packaged runtime `process --json` child and
      streams structured events into the GUI without blocking the Tauri webview.
- [x] The frontend handles `job_started`, `backend_selected`, `progress`,
      `warning`, `artifact_written`, `completed`, `failed`, and `cancelled`
      events as typed job state transitions.
- [x] Cancellation signals the active runtime process, emits a terminal
      cancelled state, and leaves no active child process owned by the GUI.
- [x] Failed runtime exit, malformed NDJSON, and stderr-only runtime failure
      render terminal failed state with user-visible diagnostics instead of an
      indefinite processing state.
- [x] Retry is available after completed, failed, or cancelled states and
      starts from clean job state using the user's current input, output,
      preset, model override, and output recipe selections.
- [x] Persistent history records completed and failed jobs with input, output,
      preset, model override when selected, backend, status, completion time,
      and diagnostic summary.
- [x] A GUI fake-job smoke test covers successful completion, runtime failure,
      cancellation, and malformed event output without requiring GPU models.
- [x] Changed GUI surfaces use `DESIGN.md` and `src/gui/src/index.css` tokens
      without introducing a second accent palette, external font, ad hoc
      shadow, or ad hoc radius.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Extend `src/gui/src-tauri/src/lib.rs` with single-active-child process
      supervision, terminal exit handling, and a `cancel_processing` Tauri
      command.
- [x] Normalize job event types and terminal-state transitions in
      `src/gui/src/lib/job.ts`, including malformed NDJSON and stderr-derived
      failure diagnostics.
- [x] Update `src/gui/src/components/workflow/ProcessFlow.tsx` and adjacent GUI
      state surfaces to expose cancel, retry, terminal status, active backend,
      warnings, timings, and artifact path without changing runtime policy.
- [x] Persist richer job records in GUI history while preserving existing
      records that lack the new fields.
- [x] Add a fake-job GUI smoke script or extend the existing smoke harness under
      `src/gui/scripts/` for success, failure, cancellation, and malformed event
      scenarios.
- [x] Add focused Rust and TypeScript verification where the behavior is not
      covered by the GUI smoke.
- [x] Run focused GUI verification and record exact commands/results in Notes.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

- 2026-05-25: Implementation started. Grounding checked Tauri state/events
  docs, Rust `std::process::Child` docs, Tauri sidecar lifecycle references,
  existing GUI runtime readiness code, CLI `process --json` event contract, and
  git history for prior GUI job-event work.
- 2026-05-25: Implemented single-active runtime process supervision,
  `cancel_processing`, close/drop cleanup, deferred terminal event emission
  until native child cleanup, malformed stdout child termination,
  stderr-derived failure payloads, typed React job transitions, cancel/retry UI,
  richer persistent history, and fake-job smoke coverage.
- 2026-05-25: Fresh-context agent review found process cleanup and retry-race
  blockers. Follow-up fixes added app/window close cleanup, terminal-event
  emission after active-slot clearing, malformed stdout kill behavior, kept
  output selection separate from artifact path, and added native Rust tests.
  Re-review reported no remaining blockers; one coverage concern was closed by
  adding focused malformed-stdout and stderr-only failure tests.
- 2026-05-25: Verification passed: `cargo test` from
  `src/gui/src-tauri` (16 tests); `pnpm build` from `src/gui`;
  `pnpm smoke:job` from `src/gui`; `pnpm smoke:readiness` from `src/gui`;
  `git diff --check` from repository root.
- 2026-05-25: Diagnosed the dev GUI `Runtime missing` state. The packaged
  Tauri layout uses `ck-engine.exe`, while the local CMake build produces
  `build/debug/src/cli/corridorkey.exe`. Updated debug/runtime resolution to
  keep packaged `ck-engine.exe` support and also discover the local CMake CLI
  binary. Verification passed with `cargo test` from `src/gui/src-tauri`
  (18 tests), direct `corridorkey.exe info/doctor/models/presets --json`
  probes, and `git diff --check`.
- 2026-05-25: Added GUI catalog guardrails after runtime testing showed the
  readiness UI could list platform-incompatible presets. Moved catalog choice
  filtering into a testable TypeScript module, hid Mac MLX presets and models
  on active Windows RTX runtimes, hid presets whose recommended model pack is
  missing or not usable for the active device, and added Vitest unit coverage
  plus a mixed Mac/Windows fake-runtime readiness smoke. Verification passed:
  `pnpm test`, `pnpm build`, `cargo test`, and `git diff --check`.
- 2026-05-25: Ran the real Jordan4k sample with
  `assets/video_samples/Jordan4k.mp4` and
  `assets/video_samples/Jordan4k_alphahint.mp4` through the local runtime using
  `models/corridorkey_fp16_2048.onnx`. Added opt-in
  `pnpm smoke:real-runtime` coverage for that path. The 2048 runtime job
  completes and writes `build/gui-real-e2e/Jordan4k_gui_smoke_2048.mov`.
  Comparing against `A:/CorridorKey/Sample_CK/result.mov` showed matching
  duration, frame count, and resolution, but different output recipe: CLI/GUI
  video output currently writes the runtime checkerboard preview while the
  Fusion render is composited over black. Adjusted catalog filtering so loaded
  Windows RTX models remain selectable even when not the active-device
  recommendation.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
