# Task `0039`: Compile Windows Suite Installer With Explicit Inputs

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The suite installer can render a deterministic manifest and Inno Setup script.
The next step is to make the non-render package path real without pretending to
own automatic staging yet. Maintainers must be able to pass explicit staged
suite payload roots, offline model payload roots, and an ISCC path; the package
script must validate those inputs, compile through Inno, and fail clearly when
required payloads are missing.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] Non-render `scripts/package_suite_installer_windows.ps1` requires a
      staged suite payload root containing runtime, GUI, OFX Resolve/Fusion,
      OFX Nuke, and Adobe payload directories.
- [x] Offline non-render packaging requires a model payload root matching the
      existing `stage_offline_payload.ps1` `dest_subdir` layout.
- [x] The package script accepts an explicit `-ISCCPath` and invokes it with
      the generated `.iss` script.
- [x] The generated `.iss` used for compilation contains concrete suite payload,
      offline payload, output directory, and output basename values.
- [x] The package script fails if ISCC exits non-zero or if the expected
      installer executable is not produced.
- [x] The package script writes or preserves the generated suite manifest and
      reports the installer path and SHA-256 after a successful compile.
- [x] Regression coverage proves online and offline compile paths with fake
      payloads and a fake ISCC, plus missing-payload failure.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Add a failing PowerShell regression test for suite compilation using a
      fake ISCC and temporary payload roots.
- [x] Add `-SuitePayloadRoot`, `-ModelPayloadDir`, `-ISCCPath`, and
      `-OutputBaseFilename` support to
      `scripts/package_suite_installer_windows.ps1`.
- [x] Validate suite payload and offline model payload roots before invoking
      ISCC.
- [x] Render concrete `.iss` values for compile mode while preserving
      render-only placeholders.
- [x] Register the regression in `tests/regression/CMakeLists.txt`.
- [x] Run suite compile/render/scaffold tests and existing installer scaffold
      regressions.
- [x] Run fresh-context review before closing.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created after `0038` closed. This slice does not automatically assemble
the suite payload root from existing package outputs; that staging automation
belongs to a later task.

Implemented the compile path with explicit suite payload, offline model payload,
ISCC, output directory, and output base-name inputs. The regression covers
online compile, offline compile, missing suite payload, missing manifest
checksum, file-backed payload directories, raw offline archive payloads,
corrupt offline model payloads, non-zero ISCC exit, and ISCC success without
the expected installer executable.

Fresh-context review found weak offline payload validation, archive layout
validation, missing manifest checksum validation, file-backed payload
directories, and wildcard-aware reads/hashes. The implementation now validates
offline model SHA-256 values, requires archive packs to be pre-extracted with
manifest file count and byte count, requires suite payload containers, validates
manifest SHA-256 fields, and uses literal reads/hashes for package inputs.

Verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_compile_scaffold.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_iss_render.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_installer_scaffold.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_adobe_package_scaffold.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_inno_app_constant_initialization.ps1`
- `ctest --test-dir build\debug -R "regression_windows_suite_(installer_scaffold|iss_render|compile_scaffold)" --output-on-failure`
- `git diff --check`

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
