# Task `0037`: Implement Windows Suite Installer Scaffold

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

Windows users need one installer that can select CorridorKey surfaces without
duplicating runtime and model payloads. Task `0028` accepts the plan: add a new
canonical `scripts/windows.ps1 -Task package-suite` flow, keep standalone
OFX/Adobe/runtime package flows, use Inno Setup for the suite shell, and stage
selected host and GUI surfaces against one shared runtime root.

This first implementation slice is the TDD scaffold. It must make the suite
installer shape testable before any release installer is shipped.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] `scripts/windows.ps1` exposes `package-suite` as the canonical suite
      entrypoint and delegates to a suite packaging script.
- [x] `AGENTS.md` and `CLAUDE.md` remain identical and include `package-suite`
      in the canonical Windows task list.
- [x] A suite builder or staging script renders a deterministic generated
      installer script or component manifest without invoking Inno in tests.
- [x] The generated suite component matrix includes CLI/runtime core, Tauri GUI,
      OFX Resolve/Fusion, OFX Nuke, Adobe plugins, Green model pack, Blue
      model/runtime pack, and recommended Green plus Blue.
- [x] Online and offline generated suite metadata expose the same Green, Blue,
      and Green plus Blue model choices. Offline may embed every pack, but
      installed files still follow the selected component set.
- [x] Generated suite metadata uses `{autopf}\CorridorKey\Runtime` as the
      shared runtime root and `{autopf}\CorridorKey\GUI` as the suite GUI root.
- [x] Generated suite metadata records host detection and destination rules for
      Resolve/Fusion, Nuke, Adobe, CLI/runtime core, and GUI as defined in
      `doc/tasks/0028-plan-unified-windows-installer.md`.
- [x] Generated suite model choices come from
      `scripts/installer/distribution_manifest.json` and do not expose
      user-facing `fp32` or 768 ONNX artifacts.
- [x] Regression tests verify wrapper exposure, generated component links,
      shared root constants, host detection and destination metadata,
      online/offline model choices, and preservation of standalone
      `package-ofx`, `package-adobe`, and `package-runtime` tasks.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Add a failing PowerShell regression test under `tests/regression/` that
      asserts the suite wrapper and generated installer contract.
- [x] Add the minimum suite packaging entrypoint, likely
      `scripts/package_suite_installer_windows.ps1`, with a test-friendly
      render or dry-run mode.
- [x] Add or adapt an Inno suite template/generator under `scripts/installer/`
      without changing existing one-surface OFX/Adobe behavior.
- [x] Update `scripts/windows.ps1`, `AGENTS.md`, and `CLAUDE.md` together.
- [x] Run the new regression test plus the existing installer scaffold
      regressions that protect Adobe and Inno behavior.
- [x] Run `git diff --check` and record results before review.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created from the reviewed plan in
`doc/tasks/0028-plan-unified-windows-installer.md`. The first red test should
assert the generated contract before any large payload copying, download, or
Inno compilation work lands. The implementation should keep existing
standalone package tasks intact and should not route around
`scripts/windows.ps1`.

TDD loop: `tests/regression/test_windows_suite_installer_scaffold.ps1` failed
first because `scripts/windows.ps1` did not expose `package-suite`. The green
slice adds `scripts/package_suite_installer_windows.ps1` with a render-only
suite manifest path, wrapper delegation, and CTest registration. The script
does not claim to build a release installer yet: non-render execution writes
the scaffold manifest and then fails explicitly until the Inno suite builder is
implemented.

Generated suite metadata now records the accepted shared roots, setup types,
component matrix, host detection and destination rules, online/offline model
choice parity, and model packs from
`scripts/installer/distribution_manifest.json`. Model choices are derived from
the manifest pack components; `install_modes` reuses those derived choices; and
the scaffold rejects user-facing `fp32` and any ONNX 768 artifacts, including
context variants.

Review result: two fresh-context reviewers checked standards and
spec/task traceability. Findings were fixed before closure: default
`package-suite` no longer exits successfully without building an installer,
recommended setup type metadata includes GUI and host surfaces, standalone
package delegate assertions are stronger, wrapper render-only delegation is
tested end to end, install-mode choices no longer hardcode a second model
contract, and the regression test is registered in
`tests/regression/CMakeLists.txt`.

Verification:

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
