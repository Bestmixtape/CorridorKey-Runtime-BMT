# Task `0046`: Complete GUI Suite Release

**Status:** in_progress
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
- [x] The primary quality control is a compact preset dropdown that defaults to
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
- [x] Fix the preview proxy failure in `src/gui/src-tauri/src/lib.rs` with a
      regression test that proves FFmpeg can write the temporary MP4 output.
- [x] Update `src/gui/src/lib/job.ts`, `src/gui/src/components/workflow/*`, and
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

### 2026-06-07

Preview proxy grounding and TDD slice:

- Source A: FFmpeg command documentation defines `-f fmt` as the way to force
  input or output format when extension-based guessing is insufficient:
  https://www.ffmpeg.org/ffmpeg.html#Main-options
- Source A: FFmpeg formats documentation shows muxer options such as
  `movflags=+faststart` applied to MP4-family output:
  https://ffmpeg.org/ffmpeg-formats.html
- Source B: A validated FFmpeg failure case resolves "Unable to find a suitable
  output format" by adding `-f mp4` before the output path:
  https://stackoverflow.com/questions/76315677/unable-to-find-suitable-output-format-for-ffmpeg
- Source B: A validated atomic conversion pattern writes to a temporary file and
  replaces the final output only after FFmpeg succeeds:
  https://stackoverflow.com/questions/75151280/how-to-make-ffmpeg-delete-original-file-after-conversion
- Source C: `src/gui/src-tauri/src/lib.rs` already owns preview proxy cache
  generation, success markers, retry behavior, and FFmpeg timeout coverage.
- Source D: `3c99f95` introduced atomic temporary proxy writes,
  `1c1f30e` retried transient proxy failures, and `22a20d2` established result
  preview registration after processing.

Decision: keep the atomic temporary proxy write and final rename, but force the
MP4 muxer with `-f mp4` before the temporary output path so FFmpeg does not rely
on the final `.tmp` extension. The regression test
`preview_proxy_uses_explicit_mp4_muxer_for_atomic_temp_output` fails without the
explicit muxer and passes after the fix. Verification passed with
`cargo test --lib` in `src/gui/src-tauri`, and the packaged GUI FFmpeg generated
a real proxy for `C:\Users\alexa\Downloads\Jordan4k_corridorkey.mov` into a
temporary `*.mp4.libx264.tmp` output in 1.21 seconds before cleanup.

Preset contract grounding and TDD slice:

- Source C: `src/plugins/ofx/ofx_constants.hpp` defines the host plugin quality
  ladder as Draft 512, High 1024, Ultra 1536, and Maximum 2048.
- Source C: `src/plugins/adobe/adobe_effect_parameters.cpp` exposes the same
  quality labels to Adobe hosts.
- Source B: `C:\Dev\EZ-CorridorKey\ui\widgets\preferences_dialog.py` persists a
  model-resolution dropdown instead of keeping model files as a primary action.
- Source C: `src/app/runtime_contracts.cpp` is the shared catalog used by CLI,
  diagnostics, plugins, and the GUI runtime bridge.

Decision: Windows RTX default now resolves to `win-rtx-draft`, recommends
`corridorkey_fp16_512.onnx`, and keeps `balanced` as the explicit 1024 preset.
The product-facing `default` and `draft` aliases route to Draft on Windows RTX,
while macOS keeps `mac-balanced`. Verification passed with
`scripts\windows.ps1 -Task build -Preset debug` and
`build\debug\tests\unit\test_unit.exe "[runtime]"`.

GUI preset selection TDD slice:

- Source C: `src/gui/src/components/workflow/ProcessFlow.tsx` previously picked
  the first compatible preset every time the runtime catalog changed.
- Source C: `src/gui/src/lib/job.ts` already persisted history in local storage,
  but had no user preset preference.
- Source C: `src/gui/src/components/workflow/QualityControlsPanel.tsx` exposed
  both preset and manual model at the primary level, duplicating information the
  preset contract already carries.
- Source C: `src/gui/src/lib/workflowLabels.ts` owned option labels and is the
  right local place for preset explanation text.

Decision: keep the primary quality surface as one preset dropdown plus compact
encoding controls. The dropdown restores a valid saved preset, otherwise chooses
the runtime default flag, and explains the selected preset with resolution,
model, backend, precision, tiling, and GPU-cost guidance. Manual model override
now lives under Advanced controls. Verification passed with
`pnpm vitest run src/lib/catalog.test.ts src/lib/job.test.ts
src/lib/workflowLabels.test.ts`, `pnpm test:unit`, and `pnpm build` in
`src/gui`.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
