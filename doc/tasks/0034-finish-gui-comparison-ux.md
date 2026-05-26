# Task `0034`: Finish GUI Comparison UX

**Status:** done
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

- [x] Comparison controls clearly show which buffers are available and disable
      invalid comparisons without hiding why.
- [x] Source-vs-Result, Source-vs-Alpha Hint, and Alpha Hint-vs-Result modes
      have clear labels and side-swap behavior where useful.
- [x] Vertical, horizontal, and diagonal wipes have draggable handles that work
      across the full viewer bounds and remain keyboard accessible where a
      range control is present.
- [x] Overlay and difference modes communicate what the user is inspecting and
      do not obscure playback controls.
- [x] Desynchronized media is visible and recoverable with a clear sync status
      or resync action.
- [x] E2E coverage verifies missing-buffer disabled states, side swapping,
      wipe dragging, overlay opacity, difference mode, and desync recovery.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Extend `src/gui/src/lib/viewerCompare.test.ts` for missing-buffer and
      side-swap behavior.
- [x] Extend `src/gui/src/lib/viewerSync.test.ts` for desync visibility and
      recovery behavior.
- [x] Update the comparison controls in
      `src/gui/src/components/workflow/ProcessFlow.tsx` or extracted viewer
      components from task `0033`.
- [x] Add E2E assertions to `src/gui/scripts/smoke-job-lifecycle.mjs`.
- [x] Run `pnpm test` and inspect Playwright smoke coverage for comparison
      control overlap.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: Adobe Premiere's Comparison View exposes
side-by-side, vertical split, horizontal split, draggable divider, and reference
frame controls; Nuke's Viewer wipe exposes A/B buffers, split-screen detail
inspection, draggable position, rotation, and dissolve. Existing GUI helpers
already cover basic geometry and synchronized playback, so this task focuses
on review ergonomics and recoverable states.

TDD completed in vertical cycles. `viewerCompare.test.ts` now covers explicit
Source/Result, Source/Alpha Hint, and Alpha Hint/Result pair availability,
missing-buffer reasons, explicit pair resolution, and side swapping.
`viewerSync.test.ts` now covers visible desync status and recovery targets.

The workbench viewer now shows dedicated comparison-pair controls with visible
missing-buffer reasons, a side-swap action, clearer mode labels for vertical,
horizontal, diagonal, overlay, and difference modes, and sync status with
check/resync actions. Wipe dragging now tracks explicit pointer drag state
instead of relying on browser-specific `event.buttons`, making the E2E drag
coverage deterministic.

E2E coverage in `smoke-job-lifecycle.mjs` now verifies Source/Alpha availability
when a hint is selected, Alpha/Result and Source/Alpha disabled reasons when
buffers are missing, Source/Result side swapping, wipe dragging, overlay
opacity, difference mode labeling, and desync/resync recovery.

Verification: `pnpm exec vitest run src/lib/viewerCompare.test.ts
src/lib/viewerSync.test.ts`, `pnpm exec tsc --noEmit --pretty false`,
`pnpm smoke:job`, and final `pnpm test` passed from `src/gui`.

Fresh-context review completed through `ad-review` against the working-tree
diff. Standards and Spec findings were clear.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
