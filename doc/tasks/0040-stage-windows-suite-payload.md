# Task `0040`: Stage Windows Suite Payload From Package Outputs

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The suite installer compile path accepts a fully staged payload root. That is
useful for a deterministic compile contract, but too manual for maintainers who
already have runtime, GUI, OFX, and Adobe package outputs in `dist/`. The suite
packager must be able to assemble its thin payload tree from those existing
outputs before invoking Inno Setup, while still keeping the explicit
`-SuitePayloadRoot` path available for advanced release debugging.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] `scripts/package_suite_installer_windows.ps1` can stage a suite payload
      root from explicit runtime, OFX, and Adobe package roots.
- [x] The staged runtime payload excludes portable-package-only files and model
      directories that are installed through the suite model packs.
- [x] The staged GUI payload exposes `CorridorKey.exe` from the portable runtime
      GUI executable.
- [x] The staged OFX Resolve/Fusion and OFX Nuke payloads copy the same
      `CorridorKey.ofx.bundle` contents into the suite payload contract.
- [x] The staged Adobe payload accepts the existing Adobe package layout and
      copies the MediaCore `CorridorKey` contents into the suite payload
      contract.
- [x] Passing both an explicit `-SuitePayloadRoot` and generated staging output
      fails clearly instead of silently choosing one.
- [x] Regression coverage proves staged payload generation, generated `.iss`
      resolution, and at least one missing-input failure.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Add a failing PowerShell regression test for staged suite payload
      generation from fake package outputs.
- [x] Add staging parameters and path validation to
      `scripts/package_suite_installer_windows.ps1`.
- [x] Copy runtime, GUI, OFX, and Adobe payloads into the suite payload
      contract and validate the result through the existing payload-root
      assertion.
- [x] Register the regression in `tests/regression/CMakeLists.txt`.
- [x] Run suite package regressions and `git diff --check`.
- [x] Run fresh-context review before closing.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created after `0039` closed. This slice intentionally assembles from
explicit package roots; automatic discovery or invocation of `package-runtime`,
`package-ofx`, and `package-adobe` remains a later orchestration slice.

Implemented generated suite payload staging through `-SuitePayloadOutputRoot`,
`-RuntimePackageRoot`, `-OfxPackageRoot`, and `-AdobePackageRoot`. Runtime
staging now separates shared runtime files into `runtime\win64` and
`runtime\resources`, excludes portable-only files, `models`, and `outputs`,
stages `CorridorKey_Runtime.exe` as `gui\CorridorKey.exe`, and adds
`runtime\win64\corridorkey.exe` as a CLI/runtime alias when the portable
package provides only `ck-engine.exe`. The shared runtime now also sources the
host plugin runtime server and TorchTRT wrapper from the existing OFX/Adobe
package outputs when the portable runtime package does not contain them.

Fresh-context review found that the first implementation could still clean an
overlapping output root, accepted overly broad Adobe roots, copied full
standalone OFX/Adobe payloads into host destinations, and staged
`torchtrt-runtime` under the Win64 runtime payload. The implementation now
validates component roots before cleanup, restricts generated staging output
to a child of `dist` or `%TEMP%`, rejects source/output ancestor-descendant
overlap, accepts only the Adobe package root or exact MediaCore `CorridorKey`
payload shape, stages OFX/Adobe host payloads as plugin binaries only, writes
suite shared-runtime INI entries through the generated Inno script, and keeps
TorchTRT wrapper resources under `Contents\Resources`.

Rereview caught that host plugins still resolved their runtime server beside
the plugin binary, and that the portable runtime package does not contain the
per-build `corridorkey_torchtrt.dll` wrapper. The host runtime resolver now
consumes the generated `corridorkey_runtime.ini` and points OFX/Adobe host
plugins at the shared runtime root for the server and model root. Host payloads
remain thin: plugin binaries plus configuration only, excluding runtime
provider DLLs, sidecar server copies, model packs, CLI binaries, and model
inventories from host destinations.

Final review caught the same shared-runtime config gap in the suite-installed
Tauri GUI. The GUI runtime resolver now reads `corridorkey_runtime.ini` beside
`CorridorKey.exe` and searches the configured shared runtime
`Contents\Win64` before standalone GUI resource locations.

Regression coverage proves staging from fake package outputs, concrete `.iss`
payload-root substitution, mutually exclusive explicit/generated payload roots,
missing runtime-package input failure, safe overlap rejection without deleting
the sentinel, Adobe ancestor rejection, host payload de-duplication, and
runtime resource placement.

Verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_payload_staging.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_compile_scaffold.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_iss_render.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_installer_scaffold.ps1`
- `cmd.exe /d /s /c "\"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat\" -arch=x64 -host_arch=x64 && cmake --build --preset debug --target test_unit"`
- `build\debug\tests\unit\test_unit.exe "[unit][ofx][runtime][regression]"`
- `cargo test --manifest-path src\gui\src-tauri\Cargo.toml candidate_runtime_roots_read_suite_shared_runtime_config`
- `cargo test --manifest-path src\gui\src-tauri\Cargo.toml runtime_root_from_config_ignores_other_ini_sections`
- `ctest --test-dir build\debug -R "regression_windows_suite_(installer_scaffold|iss_render|compile_scaffold|payload_staging)" --output-on-failure`
- `git diff --check`

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
