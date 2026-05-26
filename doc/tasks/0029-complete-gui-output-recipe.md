# Task `0029`: Complete GUI Output Recipe

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Artists need the GUI to describe and produce the output they actually want
without guessing what the runtime supports. The current workbench has an output
recipe foundation for artifact family, alpha behavior labels, preview
background controls, and suggested paths, but unsupported recipe fields are
intentionally not forwarded to the runtime. This task closes the product gap by
making output choices explicit, runtime-backed, and testable.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] The GUI shows only runtime-supported final artifact families for the
      selected source: movie, image sequence, EXR-capable sequence, or
      preview-only when that contract exists.
- [x] The GUI lets the user choose alpha behavior for supported outputs:
      matte-only, RGBA/transparent, premultiplied composite, or external merge
      only when the runtime/App contract can honor it.
- [x] Preview background controls affect preview only and remain distinct from
      final output composition: checkerboard, transparent, solid color, and
      replacement media.
- [x] Replacement-media output is either fully wired through a native runtime
      contract with color-management intent or clearly disabled with recovery
      text; no invented `process` argument is sent.
- [x] Suggested output paths and validation rules match the selected artifact
      family for files and folders, including dotted project folders.
- [x] Result metadata and job chips show the effective output recipe after a
      run.
- [x] Unit, integration, and E2E coverage exercise supported/unsupported recipe
      choices, output path validation, process payloads, and visible Result
      recipe metadata.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Audit current runtime process arguments and output behavior in
      `src/cli/main.cpp`, `src/app/job_orchestrator.cpp`, and
      `src/frame_io/`.
- [x] Extend `src/gui/src/lib/outputRecipe.ts` tests before changing UI
      behavior.
- [x] Add or expose an App-layer capability field for supported output recipe
      choices instead of hard-coding GUI assumptions.
- [x] Wire `src/gui/src/components/workflow/ProcessFlow.tsx` so unsupported
      recipe choices are unavailable or clearly gated.
- [x] Add fake-runtime E2E coverage in
      `src/gui/scripts/smoke-job-lifecycle.mjs`.
- [x] Run the real-runtime Jordan smoke when movie output behavior changes.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: `doc/specs/0003-useful-tauri-gui.md`
requires output recipe controls but keeps App/Core ownership of processing
behavior; `src/gui/src/lib/outputRecipe.ts` already owns GUI recipe labels and
path readiness; `src/gui/src/components/workflow/ProcessFlow.tsx` already keeps
unsupported recipe fields out of `start_processing`. Nuke's viewer process
documentation separates display transforms from rendered output, which matches
the rule that preview backgrounds must not silently change final artifacts.

Execution started. Current runtime audit: `src/cli/main.cpp` exposes
`--video-encode` for video output encoding; `src/app/job_orchestrator.cpp`
resolves video output from input kind, output path, and `VideoOutputOptions`;
image and folder inputs are processed as sequences; replacement-media merge,
alpha/composite modes, and color-management intent do not yet have a native
`process` argument. Therefore the first implementation slice must make the GUI
explicitly classify unsupported recipe controls as preview-only or
awaiting-runtime-contract rather than forwarding invented arguments.

Implemented runtime-backed output recipe capabilities. `to_json(RuntimeCapabilities)`
now exposes `output_recipe` with movie and EXR-sequence artifact families,
movie-only composited-preview alpha, the current EXR-sequence output bundle,
replacement-media output disabled, and runtime-default color intent. The GUI
consumes that contract to enable only supported artifact families and final
output controls; GUI preview backgrounds remain preview-only and are not
presented as native render output support. PNG sequence, preview-only output,
movie transparent/matte alpha, replacement media final merge, and linear sRGB
remain visibly gated until the App/Core contract exists. Folder and still-image
sources now suggest EXR sequence output instead of unsupported PNG sequence
output.

Fresh-context review found two contract-accuracy issues before commit:
preview backgrounds were initially advertised as native runtime capabilities,
and sequence alpha modes were initially advertised as selectable final-output
modes even though the runtime writes a fixed EXR/Comp bundle. The contract now
uses `exr_sequence_outputs` for the fixed bundle and omits preview backgrounds
from runtime final-output capabilities; the GUI still supports them as preview
controls.

Verification completed: `pnpm test:unit`, `pnpm build`, `pnpm smoke:job`,
`pnpm smoke:readiness`, `cargo test` in `src/gui/src-tauri`,
`pnpm test`, `scripts/windows.ps1 -Task build -Preset debug`,
`build/debug/tests/unit/test_unit.exe "runtime capabilities expose stable diagnostics"`,
and `pnpm smoke:real-runtime` with `CORRIDORKEY_FFMPEG_PATH` set to the local
WinGet `ffmpeg.exe`.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
