# Task `0033`: Extract GUI Workbench Viewer

**Status:** done
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

- [x] `ProcessFlow.tsx` is split into focused workflow shell, setup rail,
      viewer stage, comparison surface, preview surface, job status, and
      advanced/output panels where that reduces complexity.
- [x] Viewer state helpers remain testable under `src/gui/src/lib/` and do not
      depend on React component internals.
- [x] Existing behaviors are preserved: result preview fallback, source/hint
      selection, comparison modes, synchronized playback, output backgrounds,
      reset, and diagnostics actions.
- [x] No new dependency is added for comparison or viewer state unless a
      separate review shows it is smaller and safer than local code.
- [x] Unit and E2E coverage remain green before, during, and after extraction.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Establish a green baseline with `pnpm test`; real-preview smoke was
      attempted and blocked by missing preview `ffmpeg.exe`.
- [x] Extract pure helper logic first from `ProcessFlow.tsx` into
      `src/gui/src/lib/` only when tests pin behavior.
- [x] Extract React components under `src/gui/src/components/workflow/` in
      vertical slices, one behavior-preserving move at a time.
- [x] Keep prop surfaces small: pass buffer descriptors and callbacks rather
      than entire stores when possible.
- [x] Run smoke tests after each meaningful extraction.
- [x] Finish with a fresh-context review focused on behavior preservation.

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

Fresh-context review completed through `ad-review` against the setup-rail
extraction commit. Standards had no findings. Spec had one concern: the setup
rail still owned too many panels to close this task. The concern was addressed
by extracting `WorkflowInputsPanel.tsx`, `OutputRecipePanel.tsx`,
`QualityControlsPanel.tsx`, `WorkflowRunPanel.tsx`, and
`WorkflowPanelPrimitives.tsx`. `WorkflowSetupRail.tsx` now assembles those
panels and no longer owns their markup directly.

Verification after the panel extraction: `pnpm exec tsc --noEmit --pretty
false` passed. `pnpm test` initially hit two transient E2E failures: a local
`net::ERR_NO_BUFFER_SPACE` CSS load failure and one comparison-drag assertion
that immediately passed when the job smoke was rerun in isolation. A final
`pnpm test` passed from `src/gui`, including unit, build, readiness smoke, and
job lifecycle E2E coverage. Real-runtime smoke remains blocked by the missing
preview `ffmpeg.exe` prerequisite documented above.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
