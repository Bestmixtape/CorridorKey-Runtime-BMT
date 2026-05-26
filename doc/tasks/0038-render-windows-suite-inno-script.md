# Task `0038`: Render Windows Suite Inno Script

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The suite installer scaffold now has a canonical wrapper task and deterministic
JSON manifest. The next useful slice is to render a deterministic Inno Setup
script from that manifest without compiling it. This keeps the work testable on
machines without Inno Setup or large staged payloads while moving toward the
real suite installer.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] `scripts/package_suite_installer_windows.ps1 -RenderOnly` can write a
      generated `.iss` script through an explicit output path.
- [x] The generated `.iss` script declares suite setup types for Green only,
      Blue only, recommended Green plus Blue, and custom.
- [x] The generated `.iss` script declares components for CLI/runtime core,
      Tauri GUI, OFX Resolve/Fusion, OFX Nuke, Adobe, Green, and Blue.
- [x] The generated `.iss` script maps host and GUI payload placeholders to
      the accepted shared runtime, GUI, OFX, and Adobe destinations.
- [x] The generated `.iss` script maps online model packs to manifest URLs,
      sizes, and SHA-256 hashes, and offline model packs to offline payload
      placeholders.
- [x] The generated `.iss` script does not contain user-facing `fp32` or ONNX
      768 artifacts.
- [x] Regression coverage proves online and offline `.iss` rendering through
      the package script without invoking ISCC.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Add a failing PowerShell regression test for suite `.iss` rendering.
- [x] Add `-OutputIssPath` support to
      `scripts/package_suite_installer_windows.ps1`.
- [x] Generate deterministic `[Setup]`, `[Types]`, `[Components]`, `[Dirs]`,
      and `[Files]` sections from the suite manifest.
- [x] Register the regression test in `tests/regression/CMakeLists.txt`.
- [x] Run the suite scaffold/render tests and existing installer scaffold
      regressions.
- [x] Run fresh-context review before closing.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created after `0037` closed. This slice intentionally renders the script
only; compiling with ISCC and validating real staged payloads belongs to a later
task.

TDD loop: `tests/regression/test_windows_suite_iss_render.ps1` failed first
because `scripts/package_suite_installer_windows.ps1` did not support
`-OutputIssPath`. The green slice renders deterministic online and offline
Inno scripts from the suite manifest without invoking ISCC.

Render decisions: the generated script declares suite setup types, component
choices, shared runtime and GUI roots, payload placeholders for host and GUI
surfaces, and model-pack file entries from
`scripts/installer/distribution_manifest.json`. Online rendering follows the
repo's existing `{tmp}` plus `TDownloadWizardPage` pattern instead of relying
on `[Files]` `download` flags. The download queue is guarded by selected Green
or Blue components. Offline rendering uses the existing offline staging layout:
manifest `dest_subdir` paths under `{#OfflinePayloadRoot}`, with extracted
Blue runtime files under `torchtrt-runtime\bin`.

Review result: two fresh-context reviewers checked standards and
spec/task traceability. Findings were fixed before closure: AppId format is
covered, online downloads are actually wired into the generated wizard flow,
Green-only installs do not enqueue Blue downloads, `ArchiveExtraction=full` is
rendered for the 7z runtime, archive `ExternalSize` uses
`installed_size_bytes`, offline paths match `stage_offline_payload.ps1`, and
the regression test reads manifest hash and size values instead of hardcoding
them.

Verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_iss_render.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_windows_suite_installer_scaffold.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_adobe_package_scaffold.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests\regression\test_inno_app_constant_initialization.ps1`
- `git diff --check` passed with only expected LF-to-CRLF working-copy
  warnings.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
