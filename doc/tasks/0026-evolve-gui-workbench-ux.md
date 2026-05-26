# Task `0026`: Evolve GUI Workbench UX

**Status:** in-progress
**Created:** 2026-05-25
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Non-CLI users need the Tauri GUI to become a real review and processing
workbench, not only a runtime launcher with file pickers. The current GUI can
probe the runtime, launch a job, and show a basic preview, but user testing
showed that result preview reliability, duplicated Source/Alpha/Result
controls, sparse telemetry, weak diagnostics, unused screen space, and missing
advanced controls make the app feel less capable than CorridorKey's host
plugins and the Python reference tools.

This task tracks the usability and visual evolution of the accepted useful GUI
scope. It keeps the CorridorKey Runtime visual identity defined by `DESIGN.md`
and `src/gui/src/index.css`, while borrowing interaction patterns from
professional review tools: single viewer command surfaces, A/B buffers,
draggable wipes, progressive disclosure, and readable job telemetry.
It also treats runtime CLI commands as product capabilities that should have
GUI equivalents where they are safe and useful, rather than leaving users to
discover `doctor`, `models`, `presets`, or related diagnostics in a terminal.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] Completed jobs show a playable Result preview in the app for the
      `assets/video_samples/Jordan4k.mp4` real-runtime smoke path, including
      browser-friendly fallback when the runtime artifact codec is not directly
      previewable.
- [x] Video controls remain unobstructed during processing, completion,
      failure, cancellation, and preview-proxy generation states.
- [x] Source, Alpha Hint, and Result are represented by one coherent viewer
      control surface and one input/output setup surface; the UI no longer
      duplicates the same navigation in multiple places.
- [x] The viewer supports Source, Alpha Hint, and Result as comparable buffers
      with at least vertical wipe, horizontal wipe, diagonal wipe, opacity
      overlay, and difference or matte-focused inspection modes.
- [x] The default workflow remains simple enough to run a clip with source,
      optional hint, destination, preset/model, encoding, start, cancel, retry,
      and reveal/copy actions visible without opening advanced controls.
- [ ] Advanced controls expose the plugin/runtime contract in grouped panels:
      screen color, quality, alpha hint, matte cleanup, despill, output mode,
      tiling/refinement, and runtime diagnostics.
- [ ] Output recipe controls let the user choose final artifact family
      (movie, image sequence, EXR-capable sequence, or preview-only where the
      runtime supports it), alpha/composite behavior, preview background
      (checkerboard, solid color, transparent preview, replacement media), and
      color-management intent without hiding the simple default path.
- [x] Source, Alpha Hint, and Result previews stay synchronized by shared
      timeline state whenever their media durations or frame rates allow it;
      desynchronization is visible and recoverable instead of silent.
- [x] Comparison split geometry is correct for vertical, horizontal, and
      diagonal modes across the full viewer bounds, with no inverted line,
      partial-height split, or crossed overlay artifact.
- [x] A visible reset command clears selected source, alpha hint, result,
      output path, job state, comparison state, advanced settings, and preview
      proxy state back to the initial workbench state.
- [x] Job telemetry shows elapsed time, frame progress when available, FPS or
      throughput when reported or derivable, ETA when derivable, active backend,
      selected model/preset, output recipe, stage timings, warnings, and final
      artifact metadata.
- [ ] In-progress telemetry distinguishes render FPS, decode/encode/proxy
      work, active stage, processed frame count, total frame count when known,
      parallelism or worker count when reported by the runtime, and any
      preview-frame generation mode that can be enabled without hurting the
      render hot path.
- [x] Technical logs are grouped, copyable, and useful to users and maintainers
      without requiring a terminal; routine success does not force raw logs into
      the main workflow.
- [x] Hardware and diagnostics tabs report actionable runtime state from
      `info`, `doctor`, `models`, and `presets` without misleading empty or
      platform-incompatible model-pack messages.
- [x] A Runtime Commands or diagnostics command center exposes GUI-backed
      equivalents for user-safe runtime commands: `info`, `doctor`, `models`,
      `presets`, `check-update`, the active `process` request summary, and
      any supported benchmark/dry-run diagnostics. Maintainer-only or
      state-changing commands such as `download` and `compile-context` are
      hidden, disabled, or explicitly gated until product policy allows them.
- [x] The desktop sidebar can collapse or otherwise stop wasting horizontal
      workspace while preserving keyboard/mouse discoverability.
- [x] The desktop sidebar starts collapsed by default on workbench launches
      where the window is wide enough for icon-only navigation, while remaining
      usable and discoverable.
- [x] Long preview/proxy/thumbnail work runs off the webview path and does not
      freeze interaction. Any native runtime parallel-frame processing work is
      gated behind App/Core contracts and benchmark evidence before touching
      the render hot path.
- [ ] Advanced-control parity is audited against OFX, Adobe, EZ-CorridorKey,
      and CorridorKey Engine so the GUI exposes the relevant controls users
      expect without copying another product's visual identity.
- [ ] A dedicated performance spike records whether native parallel frame
      processing, pipelined decode/inference/encode, or preview-frame streaming
      is safe and worthwhile before any render hot path change lands.
- [x] Unit, integration, and e2e coverage exercise the workbench viewer states,
      preview fallback, advanced-control availability, telemetry rendering,
      diagnostics tabs, and fake-runtime success/failure/cancellation flows.
- [ ] Changed visual surfaces pass a design-system audit: sky-blue brand accent
      on zinc-near-black surfaces, Apple-system typography, declared radius
      tokens, declared elevation token, no second accent palette, and no copied
      EZ-CorridorKey visual identity.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Preserve the current result-preview fix by keeping
      `src/gui/src-tauri/src/lib.rs`, `src/gui/src/lib/preview.ts`, and
      `src/gui/scripts/smoke-job-lifecycle.mjs` covered by Rust, TypeScript,
      and fake-job smoke tests.
- [ ] Extract a workbench viewer model from
      `src/gui/src/components/workflow/ProcessFlow.tsx` into focused React
      components and testable state helpers under `src/gui/src/components/`
      and `src/gui/src/lib/`.
- [x] Replace duplicated Source/Alpha/Result surfaces with a single viewer mode
      control and a single setup rail, preserving file selection affordances
      when no media is loaded.
- [ ] Implement A/B comparison controls with draggable split geometry,
      orientation presets, diagonal angle, overlay opacity, and disabled states
      when a requested buffer has no media.
- [x] Build progressive workflow panels: default controls first, then advanced
      Matte, Despill, Output, Runtime, and Diagnostics groups that mirror the
      OFX/Adobe parameter vocabulary.
- [ ] Build the output recipe slice: final format selection, alpha/composite
      behavior, preview background controls, replacement-media selection, and
      color-management labels backed by runtime-supported options.
- [x] Add tested output recipe foundation for artifact family availability,
      alpha behavior labels, preview background controls, color-intent labels,
      destination readiness, and suggested output paths without inventing
      unsupported runtime process arguments.
- [ ] Fix synchronized preview playback and comparison geometry regressions:
      shared playhead, Result-vs-Source sync, full-height vertical split,
      non-inverted split line, diagonal wipe without crossed overlays, and
      regression coverage for each mode.
- [x] Add tested comparison-video synchronization for Source-vs-Result and
      Source-vs-Alpha stacked viewer modes, including equal-duration seeking,
      mismatched-duration progress mapping, play/pause propagation, and E2E
      smoke coverage with controlled media elements.
- [x] Make the sidebar collapsed by default and add a reset-all workbench
      command with unit and smoke coverage.
- [x] Extend job event normalization in `src/gui/src/lib/job.ts` so telemetry
      derives elapsed time, throughput, ETA, timings, warnings, final artifact
      metadata, and copyable diagnostic summaries from runtime events and logs.
- [ ] Extend telemetry only through runtime events or cheaply derived values:
      render FPS, processed/total frames, current stage, encode/decode/proxy
      stages, active backend, model, worker or parallelism count when reported,
      and optional preview-frame status.
- [x] Surface structured job metrics already present in runtime events:
      current stage, processed/total frames, render FPS, decode FPS, encode
      FPS, worker count, RAM, CPU, and copied diagnostic metrics, while keeping
      absent metrics hidden instead of fabricated.
- [ ] Rework Hardware, Settings, Support, and History surfaces in
      `src/gui/src/App.tsx` so each tab shows only trustworthy runtime-backed
      state and no stale placeholder content.
- [x] Add a Runtime Commands surface that runs or refreshes the safe runtime
      command contract through Tauri commands, renders structured results,
      copies JSON/user summaries, and explains disabled/gated commands without
      exposing arbitrary shell execution.
- [x] Add performance-specific UI plumbing for background preview/proxy and
      thumbnail work. Defer native parallel frame processing to a separate
      App/Core spike with `scripts/run_corpus.sh` and
      `scripts/compare_benchmarks.py` evidence if the render hot path changes.
- [ ] Audit the GUI advanced controls against OFX/Adobe parameters and the
      Python reference applications, then either wire missing supported options
      or record the missing runtime/App contract as a follow-up task.
- [ ] Run a performance grounding spike before parallel frame processing:
      identify current decode/inference/encode serialization, compare against
      existing plugin/runtime behavior, and require benchmark evidence before
      changing Core/App execution.
- [x] Add Playwright smoke coverage for viewer mode switching, preview fallback,
      advanced panel expansion, sidebar collapse, diagnostics content, and log
      copy affordances.
- [x] Run `pnpm test`, `cargo test`, `pnpm smoke:real-runtime`, and
      `git diff --check`; append exact results to Notes before review.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-25

Task created from user feedback on the Tauri GUI workbench. Grounding so far:
local diagnosis showed WebView/Chromium rejecting runtime `.mov` preview media
with unsupported-media errors while H.264 MP4 proxy media loads; Nuke and
Premiere documentation support A/B comparison and split-view review patterns;
EZ-CorridorKey already contains dual viewer, output modes, wipe geometry,
async decode, timeline coverage, and FPS/ETA status patterns; OFX and Adobe
plugins define the advanced-control vocabulary this GUI should expose through
progressive disclosure.

### 2026-05-25

User added that CLI/runtime commands such as `doctor` should not remain
terminal-only. The CLI currently exposes user-facing diagnostics and catalog
commands (`info`, `doctor`, `models`, `presets`, `check-update`) plus
processing and maintainer/state-changing commands (`process`, `benchmark`,
`download`, `compile-context`). The GUI plan now includes a runtime command
center for safe command-backed views while gating commands that mutate installs
or belong to release/maintainer workflows.

### 2026-05-25

Started TDD on the Runtime Commands slice. Baseline `pnpm test:unit` passed
with 2 files and 9 tests. RED added `runtimeCommands.test.ts` for the public
command-center behavior; it failed because `runtimeCommands` did not exist.
GREEN added `runtimeCommandCenterRows`, classifying probed safe commands
(`info`, `doctor`, `models`, `presets`), available safe actions
(`check-update`, `process`, `benchmark`), and gated commands (`download`,
`compile-context`). Refactor wired the Hardware tab Runtime Commands panel to
the tested helper. Verification passed: `pnpm test:unit` with 3 files and 10
tests, and `pnpm build`. Follow-up verification passed: `pnpm test`, covering
unit, build, readiness smoke, and fake-job smoke; `git diff --check` passed
with CRLF warnings only.

### 2026-05-25

Continued TDD on the viewer comparison slice. Baseline `pnpm test:unit`
passed. RED added `viewerCompare.test.ts` for resolving Source-vs-Result
comparison state and vertical wipe clipping; it failed because
`viewerCompare` did not exist. GREEN added `resolveComparisonState` and
`comparisonClipStyle`, then extended coverage for missing-buffer fallback,
horizontal wipe, and diagonal wipe. Refactor wired the workbench viewer to
Single, Vertical, Horizontal, Diagonal, Overlay, and Difference comparison
modes with a wipe-position control. E2E coverage in `smoke-job-lifecycle.mjs`
now completes a fake job, opens Result, exercises the comparison modes, and
moves the wipe position. Verification passed: `pnpm test:unit`, `pnpm build`,
and `pnpm smoke:job`.

### 2026-05-25

Continued TDD on telemetry, advanced controls, and diagnostics usability.
Telemetry RED added `jobTelemetry.test.ts`; GREEN added elapsed time, ETA,
FPS, and stage-count derivation and rendered those values in the job status
panel. Advanced-controls RED first added a Rust test proving process arguments
carry runtime-backed options; GREEN added `ProcessCommandOptions` and wired
`start_processing` for `quality-fallback`, `refinement-mode`, `precision`,
`resolution`, `batch-size`, `despill`, `despeckle`, and `tiled`. The frontend
RED added `advancedSettings.test.ts` and fake-job smoke assertions; GREEN added
normalized advanced settings, a progressive Advanced controls panel, and
payload forwarding through the public Tauri invoke surface.

### 2026-05-25

Continued TDD on user diagnostics. RED added `diagnosticLog.test.ts`; GREEN
added `buildDiagnosticSummary` and a Copy Diagnostics action that copies
status, backend, artifact, error, warnings, timings, and raw logs without
forcing raw logs into the default view. The fake-job smoke now verifies the
copied text. A readiness-smoke RED also captured the stale Settings tab copy
for tiling; GREEN replaced it with current workflow advanced-control defaults.

### 2026-05-25

Verification passed: `pnpm test` with 7 unit files and 16 tests plus build,
readiness smoke, and fake-job E2E; `cargo test` with 22 tests; `git diff
--check` with CRLF warnings only; and `pnpm smoke:real-runtime`, which processed
`assets/video_samples/Jordan4k.mp4` with
`assets/video_samples/Jordan4k_alphahint.mp4` and
`models/corridorkey_fp16_2048.onnx`, writing
`build/gui-real-e2e/Jordan4k_gui_smoke_2048.mov`. Comparison probe against
`A:\CorridorKey\Sample_CK\result.mov` showed matching 3840x2160, 24 fps, and
3.541667 second video duration; containers and streams differ because the
runtime smoke output is MPEG-4 video-only while the Resolve/plugin output is
H.264 with audio and timecode/data streams. PSNR/SSIM are therefore recorded as
diagnostic context only, not as an accepted golden equivalence threshold.

### 2026-05-25

Continued TDD on job recipe visibility. RED added `jobRecipe.test.ts`; GREEN
added `jobRecipeChips` for selected preset, model, encoding, artifact format,
resolution, precision, batch size, despill, cleanup, tiling, fallback, and
refinement. The fake-job E2E now selects balanced encoding with advanced
settings and verifies the visible status chips plus the forwarded Tauri payload.
Verification passed: `pnpm test` with 8 unit files and 17 tests plus build,
readiness smoke, and fake-job E2E; `git diff --check` passed with CRLF warnings
only.

### 2026-05-25

Fresh-context review found overclaims and correctness risks. The GUI no longer
auto-reveals the output folder on completion; Reveal Output is explicit and the
fake-job smoke asserts no automatic reveal before the user clicks it. Runtime
Commands now marks non-wired `check-update`, `process`, and `benchmark`
entries as planned instead of available. Preview proxy cache keys now include a
content hash so same-size fast overwrites do not reuse stale previews. Elapsed
and ETA telemetry now tick while processing even when runtime progress events
are sparse. Comparison videos hide native controls while stacked under the wipe
surface. Sidebar collapse has an explicit accessible label and readiness smoke
coverage. The Runtime Commands and draggable/angled comparison plan items were
unchecked until those behaviors are actually implemented.

Preview proxy generation now resolves a packaged `ffmpeg.exe` before falling
back to PATH, and the Windows Tauri runtime staging script copies `ffmpeg.exe`
into `resources/runtime`. Post-review verification passed: `pnpm test` with 8
unit files and 17 tests plus build, readiness smoke, and fake-job E2E; `cargo
test` with 24 tests; `git diff --check` with CRLF warnings only; and `pnpm
smoke:real-runtime` with the Jordan 2048 sample path.

### 2026-05-25

Remaining reviewed risk: the asset protocol scope is still broad because the
current viewer uses Tauri `convertFileSrc` for arbitrary user-selected files.
This needs a scoped preview-serving design rather than a config-only tweak.

### 2026-05-25

Resolved the reviewed asset-protocol risk by changing the static Tauri asset
scope from filesystem-wide to empty, adding an `allow_preview_asset` command,
and allowing only selected Source, selected Alpha Hint, completed artifacts,
and generated preview proxies. Verification passed after the scope change:
`pnpm test` with 8 unit files and 17 tests plus build, readiness smoke, and
fake-job E2E; `cargo test` with 24 tests; and `git diff --check` with CRLF
warnings only.

### 2026-05-25

Continued the Runtime Commands slice without overclaiming executable command
actions. RED extended `runtimeCommands.test.ts` for copyable command JSON;
GREEN added `runtimeCommandCopyText` and Hardware-tab copy buttons for probed
runtime results. Readiness smoke now copies Doctor JSON and verifies the copied
diagnostic content. Verification passed: `pnpm test` with 8 unit files and 18
tests plus build, readiness smoke, and fake-job E2E; `cargo test` with 24 tests;
`git diff --check` with CRLF warnings only; and `pnpm smoke:real-runtime` with
the Jordan 2048 sample path.

### 2026-05-26

User feedback converted into an ordered GUI queue before further implementation.
The workbench still needs output recipe controls for final artifact family,
alpha/composite behavior, replacement media, preview background, and color
management; synchronized Source/Alpha/Result playback; comparison geometry
fixes for full-height vertical and non-crossed diagonal wipes; sidebar
collapsed by default; a reset-all command; richer in-progress telemetry;
advanced-control parity against host plugins and Python reference tools; and a
separate performance spike before native parallel-frame processing changes.
These are now explicit acceptance criteria and plan items so the next slices
can proceed in order instead of folding unrelated GUI wishes into one patch.

Continued with the comparison/reset/sidebar slice. TDD RED extended
`viewerCompare.test.ts` for full-bounds diagonal clip geometry, divider
geometry, and pointer-derived wipe positions. GREEN updated
`viewerCompare.ts` so vertical, horizontal, and diagonal split lines share the
same geometry as the clipping surface, and `ProcessFlow.tsx` now uses an SVG
divider instead of a rotated div that could visually cross or invert the wipe.
The comparison surface is draggable for vertical, horizontal, and diagonal
wipes; overlay mode now exposes opacity through the same control surface.

The workflow now has a visible `Reset Workbench` action. It clears source,
alpha hint, result artifact, selected explicit model, output filename, job
state, comparison state, preview state, encoding, and advanced settings while
preserving the default output directory seed. The desktop sidebar now starts
collapsed on wide layouts, and the readiness smoke verifies expand/collapse
from that default state.

Verification passed:

- `pnpm test:unit`
- `pnpm build`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm test`
- `git diff --check` passed with only LF/CRLF normalization warnings.
- `rg -n "TODO|FIXME"` over changed files outside task docs found no matches.

### 2026-05-26

Continued with the output recipe foundation slice. Grounding against the local
runtime showed that current processing supports movie outputs for video source
paths and sequence-style directory outputs for image source paths, while alpha
composition modes, replacement-media merge, and color-management transforms do
not yet have a GUI-to-runtime command contract. TDD RED added
`outputRecipe.test.ts` for artifact family availability, destination readiness,
suggested output paths, preview background labels, and recipe chips. GREEN added
`outputRecipe.ts`, wired recipe state into the workbench, added the Output
Recipe panel, applied checkerboard/solid/transparent preview backgrounds, and
included output recipe chips in the job status.

The fake-job E2E now configures matte-only alpha, solid preview background, and
linear sRGB intent, then verifies the visible recipe chips and that unsupported
recipe fields are not forwarded as invented runtime arguments. Readiness smoke
was hardened to locate Preset and Model selects by label now that Output Recipe
selects appear earlier in the page. Verification passed: `pnpm test` with 9
unit files and 30 tests plus build, readiness smoke, and fake-job E2E.

Continued with the comparison playback sync slice. RED added
`viewerSync.test.ts` for equal-duration sync, in-tolerance drift, duration
progress mapping, clamping, and playback-rate propagation. GREEN added
`viewerSync.ts` and wired `ComparisonSurface` so stacked Source/Result or
Source/Alpha video previews register their media elements and sync play, pause,
rate, seek, and timeupdate events. The comparison overlay now labels synced
playback. Fake-job E2E now controls browser media metadata in the smoke harness
and verifies that a primary buffer time update moves the secondary buffer in
Source vs Result mode. Verification passed: `pnpm test` with 10 unit files and
35 tests plus build, readiness smoke, and fake-job E2E.

Continued with the in-progress telemetry slice. Grounding showed
`JobOrchestrator` already attaches `JobEvent.metrics` to progress events, but
both runtime-contract and CLI NDJSON serialization omitted that object. RED
extended `jobTelemetry.test.ts`, `diagnosticLog.test.ts`, and
`test_runtime_contracts.cpp`; GREEN serializes metrics in `to_json(JobEvent)`
and CLI event output, stores the latest metrics in the GUI job state, renders
stage, frames, render/decode/encode FPS, worker count, RAM, CPU, and copies
metrics into diagnostics. Fake-job E2E now emits structured progress metrics
and verifies the visible telemetry chips and copied metrics. Verification
passed: `pnpm test` with 10 unit files and 36 tests plus build, readiness smoke,
and fake-job E2E; `.\scripts\windows.ps1 -Task build -Preset debug`; and
`.\build\debug\tests\unit\test_unit.exe "job events serialize to stable NDJSON payloads"`.

### 2026-05-26

Continued TDD from the fresh-context review findings. RED added
`preview.test.ts` to prove the frontend can only request previewable assets
through native source, folder, alpha-hint, and proxy interfaces; GREEN removed
the public arbitrary `allow_preview_asset` invoke path and moved asset-scope
permissioning behind selected Source, selected Alpha Hint, runtime artifacts,
and generated preview proxies. Rust regression coverage now rejects preview
assets that were not registered through those native flows.

The same slice added source-folder selection, alpha-hint clear/status, grouped
advanced panels, replacement-media preview recipe selection, an executable
GUI `check-update` action, a copyable active `process` request summary, and
explicitly disabled benchmark/download/compile-context rows where product
policy or safety does not allow GUI execution yet. Windows runtime staging now
uses packaged `ffmpeg.exe` or explicit `CORRIDORKEY_FFMPEG_PATH` only, so the
Tauri preview pipeline no longer silently depends on whatever `ffmpeg` happens
to be first on PATH. Preview proxy cache keys now hash bounded source samples
instead of reading entire large media files.

Verification passed: `pnpm test:unit`, `pnpm build`, `pnpm test:e2e`,
`pnpm test`, `cargo test preview_`, full `cargo test` in
`src/gui/src-tauri`, `tests/regression/test_tauri_runtime_staging_ffmpeg_source.ps1`,
`scripts/windows.ps1 -Task build -Preset debug`, and
`ctest --test-dir build\debug -R regression_tauri_runtime_staging_ffmpeg_source --output-on-failure`.

### 2026-05-26

Fresh-context agent review of the GUI workbench TDD slice found two blockers:
`create_preview_proxy` still accepted a renderer-supplied source path before
checking the preview asset scope, and source folders were still being treated
as movie-capable paths in the output recipe. TDD fixes added Rust coverage for
unregistered preview proxy sources, removed the runtime preview fallback to a
bare PATH `ffmpeg.exe`, validated/probed staged `ffmpeg.exe`, made selected
folders sequence-capable, and persisted the native `file` or `folder` source
selection mode so dotted project folders such as `Project.v001` remain folder
workflows instead of being inferred as files.

The review concerns for process summaries and FFmpeg staging were also fixed:
the Runtime Commands `process` summary now includes input source mode, alpha
hint, output recipe, and advanced process settings; Tauri runtime staging now
accepts only a probed `ffmpeg.exe` from the portable bundle or
`CORRIDORKEY_FFMPEG_PATH`. Agent rereview reported no Standards findings and
no remaining Spec finding for the source-folder fix. Remaining product notes
stay tracked in the task for later slices, including visible desync recovery
and replacement-media preview rendering.

Verification passed after review fixes: `pnpm test` with 44 unit tests plus
build, readiness smoke, and fake-job E2E; full `cargo test` with 28 tests in
`src/gui/src-tauri`; `tests/regression/test_tauri_runtime_staging_ffmpeg_source.ps1`;
and `git diff --check` with CRLF normalization warnings only.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
