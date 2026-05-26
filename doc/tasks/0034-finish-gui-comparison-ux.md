# Task `0034`: Finish GUI Comparison UX

**Status:** proposed
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

The GUI already supports Source, Alpha Hint, and Result comparison with
vertical, horizontal, diagonal, overlay, and difference modes. The remaining
work is to make this feel like an artist review tool rather than a set of
technical toggles: disabled states when buffers are missing, visible sync
health, better wipe handle behavior, useful side swapping, and recovery when
durations or frame rates do not line up.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] Comparison controls clearly show which buffers are available and disable
      invalid comparisons without hiding why.
- [ ] Source-vs-Result, Source-vs-Alpha Hint, and Alpha Hint-vs-Result modes
      have clear labels and side-swap behavior where useful.
- [ ] Vertical, horizontal, and diagonal wipes have draggable handles that work
      across the full viewer bounds and remain keyboard accessible where a
      range control is present.
- [ ] Overlay and difference modes communicate what the user is inspecting and
      do not obscure playback controls.
- [ ] Desynchronized media is visible and recoverable with a clear sync status
      or resync action.
- [ ] E2E coverage verifies missing-buffer disabled states, side swapping,
      wipe dragging, overlay opacity, difference mode, and desync recovery.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Extend `src/gui/src/lib/viewerCompare.test.ts` for missing-buffer and
      side-swap behavior.
- [ ] Extend `src/gui/src/lib/viewerSync.test.ts` for desync visibility and
      recovery behavior.
- [ ] Update the comparison controls in
      `src/gui/src/components/workflow/ProcessFlow.tsx` or extracted viewer
      components from task `0033`.
- [ ] Add E2E assertions to `src/gui/scripts/smoke-job-lifecycle.mjs`.
- [ ] Run `pnpm test` and inspect desktop/mobile viewport screenshots or
      Playwright captures for control overlap.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: Adobe Premiere's Comparison View exposes
side-by-side, vertical split, horizontal split, draggable divider, and reference
frame controls; Nuke's Viewer wipe exposes A/B buffers, split-screen detail
inspection, draggable position, rotation, and dissolve. Existing GUI helpers
already cover basic geometry and synchronized playback, so this task focuses
on review ergonomics and recoverable states.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
