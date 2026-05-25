# Task `0024`: Implement GUI Runtime Readiness

**Status:** proposed
**Created:** 2026-05-25
**Owner:** `<TODO>`
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Non-CLI users need the desktop GUI to tell the truth about whether the packaged
runtime is usable before they choose files or start a job. The current GUI can
present a healthy-looking fallback when the runtime probe fails, which hides
packaging, backend, and model-pack problems until the workflow is already
broken.

This task establishes the first useful GUI slice: runtime readiness and
diagnostics driven by the embedded runtime contract, with smoke coverage against
a fake runtime binary.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] Startup calls runtime `info`, `doctor`, `models`, and `presets` through
      the Tauri bridge and renders their combined readiness state.
- [ ] Runtime probe failure renders an explicit package or prerequisite error
      and never renders "Engine Standby" or a fake CPU device.
- [ ] Missing model packs, unsupported backend state, packaged runtime path,
      supported tracks, and last `doctor` summary are visible in diagnostics.
- [ ] Frontend model and preset choices come from runtime-provided catalogs
      instead of hard-coded TypeScript defaults.
- [ ] Tauri command errors are typed so the frontend can distinguish missing
      runtime, invalid JSON, non-zero runtime exit, and prerequisite failures.
- [ ] A GUI smoke test passes against a fake runtime covering successful
      readiness, missing runtime, missing models, invalid JSON, and non-zero
      `doctor` output.
- [ ] Changed GUI surfaces use `DESIGN.md` and `src/gui/src/index.css` tokens
      without introducing a second accent palette, external font, ad hoc
      shadow, or ad hoc radius.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Replace the healthy fallback in `src/gui/src/lib/store.ts` with an
      explicit runtime probe error state.
- [ ] Add typed Tauri readiness and diagnostics payloads in
      `src/gui/src-tauri/src/lib.rs`.
- [ ] Wire frontend readiness, model catalog, preset catalog, and diagnostics
      state through `src/gui/src/lib/job.ts` or adjacent GUI state modules.
- [ ] Update the workflow and diagnostics components under
      `src/gui/src/components/` to render runtime truth using existing design
      tokens.
- [ ] Add a fake runtime test fixture and smoke coverage for the Tauri command
      bridge without requiring GPU models.
- [ ] Run focused GUI verification and record exact commands/results in Notes.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-25


## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
