# Task `0037`: Implement Windows Suite Installer Scaffold

**Status:** todo
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

- [ ] `scripts/windows.ps1` exposes `package-suite` as the canonical suite
      entrypoint and delegates to a suite packaging script.
- [ ] `AGENTS.md` and `CLAUDE.md` remain identical and include `package-suite`
      in the canonical Windows task list.
- [ ] A suite builder or staging script renders a deterministic generated
      installer script or component manifest without invoking Inno in tests.
- [ ] The generated suite component matrix includes CLI/runtime core, Tauri GUI,
      OFX Resolve/Fusion, OFX Nuke, Adobe plugins, Green model pack, Blue
      model/runtime pack, and recommended Green plus Blue.
- [ ] Online and offline generated suite metadata expose the same Green, Blue,
      and Green plus Blue model choices. Offline may embed every pack, but
      installed files still follow the selected component set.
- [ ] Generated suite metadata uses `{autopf}\CorridorKey\Runtime` as the
      shared runtime root and `{autopf}\CorridorKey\GUI` as the suite GUI root.
- [ ] Generated suite metadata records host detection and destination rules for
      Resolve/Fusion, Nuke, Adobe, CLI/runtime core, and GUI as defined in
      `doc/tasks/0028-plan-unified-windows-installer.md`.
- [ ] Generated suite model choices come from
      `scripts/installer/distribution_manifest.json` and do not expose
      user-facing `fp32` or 768 ONNX artifacts.
- [ ] Regression tests verify wrapper exposure, generated component links,
      shared root constants, host detection and destination metadata,
      online/offline model choices, and preservation of standalone
      `package-ofx`, `package-adobe`, and `package-runtime` tasks.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Add a failing PowerShell regression test under `tests/regression/` that
      asserts the suite wrapper and generated installer contract.
- [ ] Add the minimum suite packaging entrypoint, likely
      `scripts/package_suite_installer_windows.ps1`, with a test-friendly
      render or dry-run mode.
- [ ] Add or adapt an Inno suite template/generator under `scripts/installer/`
      without changing existing one-surface OFX/Adobe behavior.
- [ ] Update `scripts/windows.ps1`, `AGENTS.md`, and `CLAUDE.md` together.
- [ ] Run the new regression test plus the existing installer scaffold
      regressions that protect Adobe and Inno behavior.
- [ ] Run `git diff --check` and record results before review.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created from the reviewed plan in
`doc/tasks/0028-plan-unified-windows-installer.md`. The first red test should
assert the generated contract before any large payload copying, download, or
Inno compilation work lands. The implementation should keep existing
standalone package tasks intact and should not route around
`scripts/windows.ps1`.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
