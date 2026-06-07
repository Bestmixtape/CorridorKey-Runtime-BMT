# Task `0046`: Complete GUI Suite Release

**Status:** proposed
**Created:** 2026-06-07
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md; doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The Windows suite installer can package the shared runtime, optional GUI,
optional host plugins, and online Green/Blue model packs, but the standalone
Tauri GUI is not yet release-complete for users who do not want to use host
plugins or the CLI. The current GUI exposes too many technical controls at the
top level, hides some useful export behavior behind incomplete contracts, and
still has a deterministic result-preview proxy failure caused by writing FFmpeg
output to a temporary path whose final extension is `.tmp`.

This task turns the GUI and suite release work into a finite release-readiness
slice. The product direction is a viewer-centered workbench with progressive
disclosure: simple default operation, persisted quality preset, contextual
advanced controls, professional export choices, useful render telemetry, and
clear diagnostics. The installer scope remains the complete Windows suite:
runtime and CLI core are fixed, while GUI, OFX, Adobe, Green, and Blue remain
optional online-first components.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] A formal grounding pass records the GUI/export release decisions against
      Apple-style progressive disclosure, reference editor viewer/export
      patterns, CorridorKey plugins, EZ-CorridorKey, CorridorKey Engine, current
      GUI code, and relevant git history.
- [ ] Result preview proxy generation succeeds for a real `.mov` result whose
      browser playback requires an MP4/H.264 proxy, while preserving atomic
      cache writes and surfacing actionable proxy diagnostics.
- [ ] The main GUI flow is a viewer-centered workbench: sidebar collapsed by
      default, no duplicated source/result tabs or tags, and only controls that
      are valid for the current media/job state are visible at the primary
      level.
- [ ] The primary quality control is a compact preset dropdown that defaults to
      the lowest compatible preset, persists the user's selected preset locally,
      and explains each option with model, resolution, backend, precision,
      tiling, and cost information when available.
- [ ] Manual model selection and other advanced runtime controls are removed
      from the primary flow and exposed through contextual disclosure sections
      only when the runtime contract supports them.
- [ ] Export/Delivery supports the agreed professional set: MOV/MP4
      composited review output, EXR sequence outputs, PNG sequence when the
      runtime reports support, configurable preview background, and no runnable
      merge/background/color option without an App/Core contract.
- [ ] During processing, the job status headline shows FPS and ETA when enough
      data exists, with phase/frame/backend/preset visible and technical logs
      or rich metrics behind disclosure.
- [ ] On completion, the workbench switches to Result automatically and loads a
      previewable result through the direct asset path or generated proxy.
- [ ] Comparison controls appear only when at least two buffers are available,
      use icon buttons with tooltips, and include Auto Compare with a central
      draggable handle that locks vertical, horizontal, or diagonal behavior at
      drag start.
- [ ] Unit, integration, and E2E coverage verify the release-critical GUI
      behaviors, including proxy creation, persisted preset selection,
      state-driven control visibility, export option gating, telemetry display,
      Result auto-focus, and comparison controls.
- [ ] The canonical Windows wrapper produces a suite installer that includes the
      fixed GUI/runtime payload and can be handed to the user with explicit
      local test expectations.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Run `ad-ground` for the complete GUI suite release scope and append the
      grounding summary to this task's Notes.
- [ ] Fix the preview proxy failure in `src/gui/src-tauri/src/lib.rs` with a
      regression test that proves FFmpeg can write the temporary MP4 output.
- [ ] Update `src/gui/src/lib/job.ts`, `src/gui/src/components/workflow/*`, and
      related tests so preset selection is compact, persisted, and explained.
- [ ] Refactor the workflow shell so the sidebar starts collapsed, the viewer is
      the visual center, and primary controls are state-driven rather than
      duplicated.
- [ ] Replace the global advanced panel with contextual disclosure sections for
      preset/runtime, output/export, alpha hint, processing, and diagnostics.
- [ ] Audit and wire export gating across `src/gui/src/lib/outputRecipe.ts`,
      `src/gui/src/components/workflow/OutputRecipePanel.tsx`, Tauri process
      payloads, CLI/App contracts, and tests.
- [ ] Add render status headline behavior in the job telemetry/status
      components and prove FPS/ETA fallback behavior with tests.
- [ ] Implement Result auto-focus and preview retry/error reporting in the
      viewer flow, with E2E coverage for completed jobs.
- [ ] Replace comparison controls with the icon toolbar and Auto Compare handle,
      keeping available-buffer gating and synchronized playback coverage.
- [ ] Run focused unit/integration/E2E tests after each slice and a final GUI
      smoke suite before packaging.
- [ ] Run fresh-context `ad-review` with agents against the completed task
      scope.
- [ ] Build, package, and validate the Windows suite through `scripts/windows.ps1`
      before handing an installer to the user.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
