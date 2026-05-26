# Task `0030`: Audit GUI Advanced Controls

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Users expect the standalone GUI to expose the meaningful CorridorKey controls
they already see in host plugins and reference tools, but the GUI must not copy
another product's layout or send options the native runtime cannot execute.
The current advanced panel exposes useful groups, but parity has not been
audited against OFX, Adobe, EZ-CorridorKey, and CorridorKey Engine.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] A parity matrix records OFX, Adobe, EZ-CorridorKey, CorridorKey Engine,
      runtime CLI, and current GUI controls by user-facing capability.
- [x] Each GUI advanced control is classified as wired, visible-readonly,
      disabled-awaiting-contract, or intentionally omitted.
- [x] The grouped advanced UI covers supported screen color/model family,
      quality, alpha hint, matte cleanup, despill, output mode,
      tiling/refinement, and runtime diagnostics controls.
- [x] Unsupported plugin/reference controls do not appear as runnable GUI
      controls unless an App/Core contract exists.
- [x] Missing runtime contracts discovered by the audit are recorded as
      follow-up tasks or linked to this task Notes.
- [x] Unit and E2E coverage verify that default runs do not override runtime
      preset defaults and advanced controls only send explicit user choices.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Inventory OFX parameters under `src/plugins/ofx/`.
- [x] Inventory Adobe parameters under `src/plugins/adobe/`.
- [x] Inventory runtime CLI/App process options in `src/cli/` and `src/app/`.
- [x] Compare those controls with `src/gui/src/lib/advancedSettings.ts` and
      `src/gui/src/components/workflow/ProcessFlow.tsx`.
- [x] Update the GUI only for controls that already have a supported runtime
      path.
- [x] Add tests in `src/gui/src/lib/advancedSettings.test.ts`,
      `src/gui/scripts/smoke-job-lifecycle.mjs`, and C++ runtime-contract tests
      when new process options are wired.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: `0027` already corrected user-facing model
and resolution choices to Auto, 512, 1024, 1536, and 2048 for Windows RTX; the
fresh review on `0026` established that GUI defaults must not override runtime
preset defaults. The parity work is an audit-first task because adding controls
before proving a runtime contract would violate Spec `0003`'s App/Core
ownership rule.

Grounding completed. `EZ-CorridorKey` and `CorridorKey-Engine` were both
updated with `git pull --ff-only origin main` and were already current.
Official implementation grounding used
[Tauri v2 command invocation](https://v2.tauri.app/develop/calling-rust/):
frontend calls pass serialized arguments to Rust command handlers, so GUI-only
controls must not invent `start_processing` fields that the Rust command does
not deserialize. Browser grounding used
[MDN's `<option disabled>` contract](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/option):
disabled `<option>` entries are unavailable for user selection, which matches
the GUI pattern for controls that should be visible but not runnable.

Parity matrix:

| Capability | OFX | Adobe | EZ-CorridorKey | CorridorKey Engine | Runtime CLI/App | GUI state | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Screen color / model family | Screen Color, Green/Blue routing | Screen Color, effect identity | Auto/Green/Blue with themed accents | Settings carry screen color/input domain | Model catalog and selected model infer screen color | Visible-readonly | Keep derived from preset/model until a GUI model-family contract exists. |
| Runtime preset / quality | Quality, requested/effective quality diagnostics | Quality popup | Model resolution preference | Model resolution and optimization settings | `--preset`, `--quality`, `--resolution` | Wired | GUI keeps Auto, 512, 1024, 1536, 2048; 768 remains retired. |
| Quality fallback | Auto, Direct, Coarse to Fine | Default/Direct/Coarse to Fine | Not primary UI | Optimization path and config | `--quality-fallback` | Wired | GUI sends only explicit non-default choice. |
| Coarse resolution override | Advanced override | Advanced override | Not primary UI | Pipeline can select lower artifacts | `--coarse-resolution` in CLI/App | Intentionally omitted | Needs GUI validation against selected preset/model resolution before becoming runnable. |
| Precision | Artifact precision through runtime selection | Runtime artifact path | Not primary UI | Model/runtime dependent | `--precision auto/fp16` | Wired | GUI exposes Auto and FP16 only; no FP32 options. |
| Batch size | Not primary UI | Not primary UI | Parallel frame setting | Pipeline batching and worker config | `--batch-size` | Wired | GUI sends only explicit non-default batch size. |
| Alpha hint | Alpha Hint clip | Alpha Hint Layer | Generated/imported hints, GVM, SAM2, VideoMaMa | Alpha paths and generators | `--alpha-hint` | Visible-readonly plus file slot | Current GUI supports external hint or runtime rough fallback; advanced panel summarizes source. |
| Input color space | Auto/sRGB/Linear path | sRGB/Linear | Source interpretation and EXR display transform | `input_is_linear` setting | No GUI/Tauri process field | Intentionally omitted | Requires a standalone color-management contract before exposing. |
| Despill strength | Slider | Slider | Slider | `despill_strength` | `--despill` | Wired | GUI sends only explicit non-default value. |
| Spill method | Average/Double Limit/Neutral | Average/Double Limit/Neutral | Not primary UI | `spill_method` exists | No CLI/Tauri process field | Disabled-awaiting-contract | Needs App/Core process argument and user-facing labels. |
| Despeckle cleanup | Toggle plus size | Toggle plus size | Toggle plus size | `auto_despeckle`, `despeckle_size` | `--despeckle` only | Wired for toggle; size omitted | Size needs CLI/Tauri field before becoming runnable. |
| Matte clip/shrink/blur/gamma | Matte controls | Matte controls | Chroma/matte cleanup controls | Post-process helpers exist | No standalone process fields | Disabled-awaiting-contract | Keep out of runnable GUI until App/Core exposes final-output matte controls. |
| Recover original details | Source passthrough | Recover Original Details | Not primary UI | `source_passthrough`, edge shrink/feather | No CLI/Tauri process field | Disabled-awaiting-contract | Needs screen-color-safe process contract. |
| Output mode | Processed, Matte, Foreground, Source+Matte, FG+Matte | Same | FG, Matte, Comp, Processed outputs | `output_layers`, comp format | Current GUI output recipe contract only | Visible-readonly / gated | Output Recipe owns current supported final outputs; plugin modes remain gated. |
| Tiling | Enable Tiling, Tile Overlap | Enable Tiling, Tile Overlap | Parallel frames / workers; optimized pipeline | `enable_tiling`, `tile_padding` | `--tiled` | Wired for force tiling; overlap omitted | Tile overlap needs CLI/Tauri field before becoming runnable. |
| Refinement mode | Defined advanced override | Not a primary Adobe UI | Not primary UI | Current artifacts reject non-auto overrides | `--refinement-mode` parses, App validation rejects non-auto | Disabled-awaiting-contract | GUI now disables Full frame and Tiled and no longer sends `refinement_mode`. |
| Runtime diagnostics | Status, backend, device, timings, guides | Status and runtime errors | Status bar, FPS, ETA, queue, GPU monitor | Job metrics and timings | `info`, `doctor`, `models`, `presets`, job JSON events | Wired / visible-readonly | Existing GUI shows readiness, commands, logs, metrics; richer telemetry remains task `0026`. |

Implemented the only needed runnable-control correction from the audit:
`REFINEMENT_MODE_OPTIONS` now marks Full frame and Tiled as
`awaiting_runtime_contract`, and the E2E job smoke proves the GUI shows the
disabled label and does not send `refinement_mode` while still sending explicit
supported choices such as quality fallback, precision, resolution, batch size,
despill, despeckle, and force tiling. No C++ process-option test was required
because this slice removed an unsupported GUI send path instead of adding a new
native argument.

Fresh-context review found two gaps before closure: disabled refinement modes
were visible-disabled but still accepted by the shared normalization/payload
path, and the parity matrix had not explicitly classified Batch size. The
normalizer now fails closed by accepting only enabled refinement options, the
unit test proves restored `tiled` state becomes Auto and emits no
`refinement_mode`, the E2E smoke reads the disabled `<option>` DOM property
directly, and the matrix records Batch size as wired.

Verification completed after the review fixes: `pnpm test:unit`,
`pnpm build`, `pnpm smoke:readiness`, `pnpm smoke:job`, and `pnpm test` in
`src/gui`; `cargo test` in `src/gui/src-tauri`.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
