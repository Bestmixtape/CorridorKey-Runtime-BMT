# Task `0033`: Extract GUI Workbench Viewer

**Status:** in-progress
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

The workbench viewer now does real work: source/hint/result buffers, preview
fallback, comparison modes, synchronized playback, output backgrounds, status
chips, and reset behavior. Most of that behavior still sits inside
`ProcessFlow.tsx`, making future output, comparison, telemetry, and design work
riskier than it needs to be. This task extracts the viewer into focused,
testable pieces without changing product behavior.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] `ProcessFlow.tsx` is split into focused workflow shell, setup rail,
      viewer stage, comparison surface, preview surface, job status, and
      advanced/output panels where that reduces complexity.
- [ ] Viewer state helpers remain testable under `src/gui/src/lib/` and do not
      depend on React component internals.
- [ ] Existing behaviors are preserved: result preview fallback, source/hint
      selection, comparison modes, synchronized playback, output backgrounds,
      reset, and diagnostics actions.
- [ ] No new dependency is added for comparison or viewer state unless a
      separate review shows it is smaller and safer than local code.
- [ ] Unit and E2E coverage remain green before, during, and after extraction.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Establish a green baseline with `pnpm test` and real-preview smoke.
- [x] Extract pure helper logic first from `ProcessFlow.tsx` into
      `src/gui/src/lib/` only when tests pin behavior.
- [x] Extract React components under `src/gui/src/components/workflow/` in
      vertical slices, one behavior-preserving move at a time.
- [x] Keep prop surfaces small: pass buffer descriptors and callbacks rather
      than entire stores when possible.
- [x] Run smoke tests after each meaningful extraction.
- [ ] Finish with a fresh-context review focused on behavior preservation.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: existing helpers already prove the preferred
direction: `viewerCompare.ts`, `viewerSync.ts`, `outputRecipe.ts`,
`jobTelemetry.ts`, and `runtimeCommands.ts` keep complex behavior testable
outside React. Public comparison-slider implementations show the same shape:
small state/control APIs around arbitrary viewer content rather than a single
monolithic component.

First behavior-preserving extraction completed. `WorkbenchViewer.tsx` now owns
viewer tabs, comparison modes, comparison surfaces, preview surfaces, preview
proxy fallback, and playback synchronization. `JobStatusPanel.tsx` now owns
the job progress/status surface and diagnostic-copy action. `jobStatus.ts`
keeps status-title and timing formatting testable outside React, with unit
coverage in `jobStatus.test.ts`. `ProcessFlow.tsx` remains the workflow shell
and setup rail owner.

Verification: `pnpm test` passed from `src/gui` after extraction. The
real-runtime smoke was attempted and blocked before launch because preview
`ffmpeg.exe` is not staged and `CORRIDORKEY_FFMPEG_PATH` is not set; no
behavioral regression was observed in fake-runtime unit, readiness, or job
smoke coverage.

Second behavior-preserving extraction completed. `WorkflowSetupRail.tsx` now
owns the setup rail, output recipe controls, quality controls, advanced
controls, and run/reset controls. `ComparisonSurface.tsx` and
`PreviewSurface.tsx` split comparison geometry/playback sync from preview
loading/proxy fallback. `workflowLabels.ts` keeps runtime catalog and workflow
labels testable outside React, with unit coverage in `workflowLabels.test.ts`.
`ProcessFlow.tsx` is now the workflow shell: it coordinates store state,
runtime-derived options, side effects, and callbacks passed to focused child
components.

Verification: `pnpm test` passed from `src/gui` after the second extraction.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
