# Task `0027`: Align Model-Pack Contract

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Users cannot trust the GUI when it reports internal reference artifacts as
missing installable model packs. Runtime investigation showed that the current
Windows RTX product contract is Green ONNX FP16 at 512, 1024, 1536, and 2048
plus compiled context artifacts, and Blue as the dynamic TorchScript pack plus
its TorchTRT runtime. The GUI screenshot listed `fp32` variants and
`corridorkey_fp16_768.onnx`, but those are reference or legacy surfaces, not
the public Windows RTX model-pack ladder.

This task aligns the runtime catalog, doctor summary, CLI help/download
surface, installer inventory, and GUI missing-pack UX so users see only
actionable product state. Reference-validation artifacts may remain available
to maintainers, but they must not appear as missing user packs or selectable
Windows RTX quality choices.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] GUI missing-model surfaces on Windows RTX do not list `fp32` artifacts or
      `corridorkey_fp16_768.onnx` as missing model packs.
- [x] GUI advanced resolution choices match the public Windows quality ladder:
      Auto, 512, 1024, 1536, and 2048.
- [x] Runtime `doctor` and `models` output distinguish installable product
      packs from reference-validation catalog entries.
- [x] CLI `download` help and behavior no longer advertise model variants or
      resolutions that are not downloadable product artifacts.
- [x] Installer manifest, package validation, and diagnostics agree on Green
      FP16 512/1024/1536/2048 plus context artifacts, and Blue dynamic
      TorchScript plus TorchTRT runtime.
- [x] Existing maintainer validation paths can still inspect reference
      artifacts without surfacing them as user repair actions.
- [x] Unit, integration, and GUI smoke coverage verify the missing-pack list,
      resolution options, CLI help contract, and packaged-model inventory.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Add failing tests around `src/gui/src/lib/catalog.ts` and
      `src/gui/src/lib/advancedSettings.ts` for the Windows RTX product ladder.
- [x] Add App-layer tests proving product-pack missing state excludes
      reference-validation catalog entries while preserving maintainer catalog
      visibility.
- [x] Align `src/app/runtime_contracts.cpp`,
      `src/app/runtime_diagnostics.cpp`, and `src/app/job_orchestrator.cpp`
      so product-pack status and full catalog state are separate fields.
- [x] Align `src/cli/main.cpp` `download` help and behavior with the committed
      distribution manifest or gate unsupported legacy downloads clearly.
- [x] Update GUI rendering and readiness smoke coverage so only actionable
      Green/Blue pack recovery is shown to users.
- [x] Re-run focused C++ tests, GUI unit tests, readiness smoke, and
      `git diff --check`; record exact results in Notes.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created from user review of the GUI "Missing Model Packs" panel. Evidence
recorded locally: `src/plugins/ofx/ofx_model_selection.hpp` already rejects
768px as outside the current public Windows quality ladder; the installer
distribution manifest lists only Green FP16 512/1024/1536/2048 plus contexts
and Blue dynamic TorchScript/TorchTRT packs; EZ-CorridorKey exposes only
1024/2048 user-facing inference resolution. The immediate product decision is
to keep reference-validation artifacts out of user-facing missing-pack and
quality-selection UX.

Grounding and TDD loop closed. Runtime catalog JSON now exposes
`installable_model_pack`; installable Windows packs resolve to the Hugging Face
distribution paths used by `scripts/installer/distribution_manifest.json`;
reference-validation `corridorkey_fp16_768.onnx` and legacy `fp32` entries stay
visible to maintainer catalog tests but are marked non-installable for user
repair UX. GUI catalog filtering now hides non-installable/reference artifacts
from model choices and missing-pack lists, and advanced resolution controls
only expose Auto, 512, 1024, 1536, and 2048. CLI help/download now gates the
download surface to the supported Green pack only until an installer-aware Blue
runtime downloader exists.

Diagnostics and packaging alignment closed for the GUI/runtime contract.
`runtime_diagnostics` now reports a `blue_runtime` readiness block and treats
TorchTRT runtime DLLs as required when the packaged inventory expects
`corridorkey_dynamic_blue_fp16.ts`. `Get-CorridorKeyPortableRuntimeTargetModels`
now targets the installable Windows RTX set: Green 512/1024/1536/2048 plus
Blue dynamic TorchScript. `stage_tauri_runtime_windows.ps1` also stages a
`torchtrt-runtime` directory when the portable package provides one. The
larger component picker installer remains tracked separately in
`doc/tasks/0028-plan-unified-windows-installer.md`.

Fresh-context review findings were addressed before closure: do not expose a
Blue CLI download that cannot extract/install the runtime archive; isolate GUI
E2E smoke browser contexts; assert browser console/request failures; avoid
default advanced GUI controls overriding runtime preset defaults; filter model
choices by installable state; and require the Blue TorchTRT runtime in doctor
diagnostics.

Verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 -Task build -Preset debug`
- `build\debug\tests\unit\test_unit.exe "doctor bundle inspection requires TorchTRT runtime for Blue packs"`
- `build\debug\tests\unit\test_unit.exe "doctor bundle inspection honors packaged model inventory for Windows RTX bundles"`
- `build\debug\tests\unit\test_unit.exe "model catalog marks validated macOS entries"`
- `build\debug\tests\e2e\test_e2e.exe "[e2e][cli]"`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_runtime_product_contract.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_rtx_artifact_manifest.ps1`
- `ctest --test-dir build\debug -R regression_windows_runtime_product_contract --output-on-failure`
- `pnpm test` from `src/gui`
- `git diff --check` passed with only LF/CRLF normalization warnings.
- `rg -n "TODO|FIXME"` over changed files outside task docs found no matches.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
