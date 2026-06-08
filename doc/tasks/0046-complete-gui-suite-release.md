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

- [x] A formal grounding pass records the GUI/export release decisions against
      Apple-style progressive disclosure, reference editor viewer/export
      patterns, CorridorKey plugins, EZ-CorridorKey, CorridorKey Engine, current
      GUI code, and relevant git history.
- [x] Result preview proxy generation succeeds for a real `.mov` result whose
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
- [x] Export/Delivery supports the agreed professional set: MOV/MP4
      composited review output, EXR sequence outputs, PNG sequence when the
      runtime reports support, configurable preview background, and no runnable
      merge/background/color option without an App/Core contract.
- [x] During processing, the job status headline shows FPS and ETA when enough
      data exists, with phase/frame/backend/preset visible and technical logs
      or rich metrics behind disclosure.
- [x] On completion, the workbench switches to Result automatically and loads a
      previewable result through the direct asset path or generated proxy.
- [x] Comparison controls appear only when at least two buffers are available,
      use icon buttons with tooltips, and include Auto Compare with a central
      draggable handle that locks vertical, horizontal, or diagonal behavior at
      drag start.
- [x] Unit, integration, and E2E coverage verify the release-critical GUI
      behaviors, including proxy creation, persisted preset selection,
      state-driven control visibility, export option gating, telemetry display,
      Result auto-focus, and comparison controls.
- [ ] The canonical Windows wrapper produces a suite installer that includes the
      fixed GUI/runtime payload and can be handed to the user with explicit
      local test expectations.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Run `ad-ground` for the complete GUI suite release scope and append the
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
- [x] Audit and wire export gating across `src/gui/src/lib/outputRecipe.ts`,
      `src/gui/src/components/workflow/OutputRecipePanel.tsx`, Tauri process
      payloads, CLI/App contracts, and tests.
- [x] Add render status headline behavior in the job telemetry/status
      components and prove FPS/ETA fallback behavior with tests.
- [x] Implement Result auto-focus and preview retry/error reporting in the
      viewer flow, with E2E coverage for completed jobs.
- [x] Replace comparison controls with the icon toolbar and Auto Compare handle,
      keeping available-buffer gating and synchronized playback coverage.
- [x] Run focused unit/integration/E2E tests after each slice and a final GUI
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

Status-chip reduction TDD slice:

- Source C: `src/gui/src/lib/jobRecipe.ts` previously emitted every advanced
  processing setting as a visible chip under the viewer.
- Source C: `src/gui/src/components/workflow/JobStatusPanel.tsx` already has
  dedicated telemetry pills for FPS, ETA, stages, workers, and resource usage.
- Source C: `src/gui/src/lib/diagnosticLog.ts` preserves copyable rich
  diagnostics separately from the visible status surface.

Decision: keep visible recipe chips limited to high-signal choices: preset,
explicit model override, encode mode, output family, and finished format. Move
advanced settings into `artifactMetadata` for diagnostics instead of showing
them as default UI tags. Verification passed with
`pnpm vitest run src/lib/jobRecipe.test.ts`, `pnpm test:unit`, `pnpm build`, and
a Playwright DOM check against the local Vite app confirming the old
`Precision/Batch/Despill/Cleanup/Tiling/Model Auto` chips are absent.

Viewer comparison gating and diagonal-wipe TDD slice:

- Source C: `src/gui/src/components/workflow/WorkbenchViewer.tsx` displayed
  compare pairs and wipe modes even when the source, hint, or result buffers
  were unavailable.
- Source C: `src/gui/src/lib/viewerCompare.ts` built diagonal clip paths with
  negative or out-of-bounds endpoints, which can draw confusing partial or
  inverted divider lines.

Decision: comparison controls render only for available media pairs, and the
diagonal divider/clip polygon is now derived from the line's intersection with
the viewer bounds. Verification passed with
`pnpm vitest run src/lib/viewerCompare.test.ts`, `pnpm test:unit`,
`pnpm build`, and a Playwright DOM check confirming no compare controls render
when fewer than two buffers are available.

Output recipe primary-option TDD slice:

- Source C: `src/gui/src/lib/outputRecipe.ts` already computes artifact
  support from the current media type and runtime output contract.
- Source C: `src/gui/src/components/workflow/OutputRecipePanel.tsx` still
  displayed disabled artifact families as primary choices, which made unsupported
  PNG/preview/sequence actions look like runnable workflow decisions.

Decision: the primary output selector now shows only currently runnable artifact
families; future/runtime-blocked families remain represented in the contract
tests and capabilities gate instead of occupying the main panel. Verification
passed with `pnpm vitest run src/lib/outputRecipe.test.ts`, `pnpm test:unit`,
`pnpm build`, and a Playwright DOM check confirming the initial output panel
shows only `Movie`.

Render telemetry headline TDD slice:

- Source C: `src/gui/src/lib/jobTelemetry.ts` already computed ETA, render FPS,
  phase, frame counts, workers, throughput, and resource labels.
- Source C: `src/gui/src/components/workflow/JobStatusPanel.tsx` displayed that
  information as many equally weighted pills, which made the most useful
  render feedback hard to scan during processing.

Decision: the status headline now promotes phase, render FPS, and ETA when
available, while the pill row keeps supporting details such as elapsed time,
frame count, throughput, workers, backend, preset, output, and resources.
Verification passed with `pnpm vitest run src/lib/jobTelemetry.test.ts`,
`pnpm test:unit`, and `pnpm build`.

Formal GUI/export release grounding:

- Source A: Apple Human Interface Guidelines disclosure controls page states
  the relevant pattern for hiding details until they are relevant:
  https://developer.apple.com/design/human-interface-guidelines/disclosure-controls
- Source A: Adobe Premiere Pro's comparison-view guide places comparison in the
  Program Monitor and exposes vertical split, horizontal split, side-by-side,
  reference/current switching, and swap-sides controls:
  https://helpx.adobe.com/ph_fil/premiere-pro/how-to/frame-comparison-view.html
- Source A: Blackmagic's DaVinci Resolve Color page frames wipe and split-screen
  modes as viewer-native comparison tools, with horizontal, vertical, mixed,
  alpha, difference matte, and picture-in-picture variants:
  https://www.blackmagicdesign.com/ca/products/davinciresolve/color
- Source B: `C:\Dev\EZ-CorridorKey\ui\widgets\view_mode_bar.py` gates viewer
  modes by clip/stem availability and uses per-mode tooltips.
- Source B: `C:\Dev\EZ-CorridorKey\ui\widgets\status_bar.py` foregrounds
  frame count, percent, FPS, elapsed time, ETA, phases, and warnings.
- Source B: `C:\Dev\EZ-CorridorKey\ui\widgets\preferences_dialog.py` persists
  infrequently changed model-resolution preferences and documents compression
  choices.
- Source B: `C:\Dev\CorridorKey-Engine\ck_engine\cli.py` exposes rich progress
  and output knobs such as EXR/PNG/none composite format, EXR compression, and
  selectable output layers.
- Source C: `src/plugins/ofx/ofx_constants.hpp` and
  `src/plugins/adobe/adobe_effect_parameters.cpp` define the host-plugin quality
  ladder as Default/Draft 512, High 1024, Ultra 1536, and Maximum 2048.
- Source C: `src/gui/src` owns the Tauri workbench, output recipe, status,
  preview, comparison, and catalog-selection behavior now covered by focused
  unit tests.
- Source D: Recent GUI history (`3c99f95`, `1c1f30e`, `22a20d2`, `d330c3f`,
  `53912bd`) shows the viewer/proxy/comparison surfaces were already being
  stabilized and should be evolved rather than replaced wholesale.

Decision: the release GUI follows an editor-style viewer-first workbench:
simple runnable controls at the primary level, details behind disclosure,
availability-gated comparison/export options, compact persisted quality preset,
and visible render telemetry. Deviations from plugins/EZ/Engine are allowed only
where the App/Core runtime contract does not yet support the richer option; such
options must remain disabled, hidden, or documented as contract-gated rather
than presented as runnable.

Comparison toolbar and Auto Compare TDD slice:

- Source A: Adobe Premiere Pro's comparison-view guide places comparison in the
  viewer and exposes split comparison modes as direct monitor controls:
  https://helpx.adobe.com/ph_fil/premiere-pro/how-to/frame-comparison-view.html
- Source A: DaVinci Resolve presents wipe/split comparison as a viewer-native
  color-page operation with multiple split modes:
  https://www.blackmagicdesign.com/ca/products/davinciresolve/color
- Source B: `C:\Dev\EZ-CorridorKey\ui\widgets\view_mode_bar.py` gates viewer
  modes by available media and uses tooltip-backed mode buttons.
- Source C: `src/gui/src/lib/viewerCompare.ts` already owned comparison state,
  available-pair filtering, wipe position, and divider geometry.

Decision: comparison controls now stay hidden until at least two buffers are
available, use icon buttons with accessible tooltips, default to Auto Compare,
and show a central draggable handle on the wipe divider. Auto Compare derives a
vertical, horizontal, or diagonal wipe from the drag direction while preserving
explicit split, overlay, difference, swap, and synchronized playback controls.
Verification passed with `pnpm vitest run src/lib/viewerCompare.test.ts`,
`pnpm test:unit`, `pnpm build`, and `pnpm smoke:job` in `src/gui`.

Result preview retry TDD slice:

- Source C: `src/gui/src/components/workflow/WorkbenchViewer.tsx` already
  switches to Result when an artifact path becomes available.
- Source C: `src/gui/src/components/workflow/PreviewSurface.tsx` already
  requests a browser-friendly proxy when direct video playback fails, but the
  error state had no user action to retry a transient proxy failure.
- Source C: `src/gui/scripts/smoke-job-lifecycle.mjs` already covers completed
  job preview fallback, synchronized comparison videos, reset, and history.

Decision: keep Result auto-focus on artifact availability and add a retry action
to the preview error state. The job E2E smoke now forces one transient preview
proxy failure, verifies the actionable error, clicks `Retry preview`, and then
expects the generated proxy video to load. Verification passed with
`pnpm build`, `pnpm smoke:job`, and `pnpm test:unit` in `src/gui`.

Contextual runtime override TDD slice:

- Source C: `src/gui/src/components/workflow/QualityControlsPanel.tsx` already
  moved manual model selection out of the primary quality row and into Advanced
  controls.
- Source C: `src/gui/scripts/smoke-runtime-readiness.mjs` covers runtime-ready,
  missing-runtime, missing-model, invalid JSON, and nonzero doctor states.

Decision: the manual model override remains hidden in the primary workflow and
now appears inside Advanced controls only when it is useful: multiple usable
models are available, or no preset exists and a model fallback is needed. When
the selected preset is the only viable model path, the override stays hidden and
screen-color context follows the preset's recommended model. Verification
passed with `pnpm smoke:readiness`, `pnpm test:unit`, and `pnpm build` in
`src/gui`.

Export/Delivery gating TDD slice:

- Source B: `C:\Dev\CorridorKey-Engine\docs\cli_reference.md` defines Python
  engine composite sequence output as `exr`, `png`, or `none`, and
  `C:\Dev\EZ-CorridorKey\ui\widgets\parameter_panel.py` exposes EXR/PNG output
  format choices with tooltips.
- Source C: the C++ runtime CLI currently exposes `--video-encode` for video
  output and `frame_io::save_result` writes the sequence bundle as Matte EXR,
  FG EXR, Processed EXR, and Comp PNG for image/folder inputs.
- Source C: `src/app/runtime_contracts.cpp` reports the current GUI output
  contract as `movie` and `exr_sequence`, with PNG sequence left contract-gated.
- Source C: `src/gui/src/lib/outputRecipe.ts` already gates primary output
  options by runtime capability and selected source kind.

Decision: keep video delivery limited to movie outputs until the C++ runtime
adds a video-to-sequence App/Core contract. Keep EXR sequence delivery for
image/folder sources, expose PNG sequence only when the runtime advertises it,
and keep preview background/color options preview-only unless the runtime
contract grows merge/color delivery support. Movie output readiness now rejects
non-video extensions such as `.exr` and suggests a runnable `.mov` output path.
Verification passed with `pnpm vitest run src/lib/outputRecipe.test.ts`.

Coverage closure:

- GUI unit/build/integration/E2E coverage passed with `pnpm test` in `src/gui`;
  this includes persisted preset selection, state-driven control visibility,
  export gating, telemetry headline, Result auto-focus, preview-proxy retry, and
  comparison controls.
- Native preview/runtime coverage passed with `cargo test --lib` in
  `src/gui/src-tauri`; this includes preview proxy creation, retry, source
  scoping, result preview asset registration, and runtime readiness failure
  modes.
- C++ runtime contract coverage passed with
  `build\debug\tests\unit\test_unit.exe "[runtime]"`; this includes the runtime
  preset/model contract used by the GUI.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
