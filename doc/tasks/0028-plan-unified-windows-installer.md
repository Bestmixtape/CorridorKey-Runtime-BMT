# Task `0028`: Plan Unified Windows Installer

**Status:** todo
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:**
**Board ref:**

## Context

Windows users should not have to understand separate packaging flows before
they can choose CorridorKey surfaces. The repository already has separate
installer paths for OFX, Adobe, and the Tauri runtime package, plus a modern
Inno Setup flow that can select Green, Blue, or both model packs. A unified
installer needs to coordinate those existing payloads without duplicating
runtime files or model downloads.

This task is planning-only until the GUI and model-pack contract are stable
enough to package. The target product is a single CorridorKey installer that
lets a user choose Resolve/Fusion, Nuke, Adobe, CLI/runtime core, GUI, and
Green/Blue model packs. The CLI/runtime core remains available as a standalone
install path because it is the shared engine surface and a support/debugging
tool for every other surface.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] The installer plan names every selectable component: CLI/runtime core,
      Tauri GUI, OFX Resolve/Fusion, OFX Nuke, Adobe plugins, Green model pack,
      Blue model/runtime pack, and Green plus Blue recommended install.
- [ ] The plan defines one shared runtime/model installation root or cache
      strategy so selected surfaces do not duplicate multi-GB model/runtime
      payloads unnecessarily.
- [ ] The plan decides which existing package outputs are reused by the suite
      installer and which scripts must become staging steps.
- [ ] The plan preserves standalone CLI/runtime and standalone GUI packaging
      where those are useful for support, smoke testing, or minimal installs.
- [ ] Online and offline installer behavior is defined, including checksum
      verification, repair/clean install behavior, and behavior when a user
      deselects a previously installed pack.
- [ ] Host detection and install destinations are documented for Resolve/Fusion,
      Nuke, Adobe, CLI/runtime core, and GUI.
- [ ] The plan identifies the required test layers: manifest/unit tests,
      generated `.iss` regression tests, package validation, and at least one
      Windows install smoke per selected surface before release.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Inventory current packaging entrypoints:
      `scripts/windows.ps1`, `scripts/installer/build_installer.ps1`,
      `scripts/package_ofx_installer_windows.ps1`,
      `scripts/package_adobe_plugins_windows.ps1`, and
      `scripts/package_runtime_installer_windows.ps1`.
- [ ] Ground installer capability against the existing Inno Setup template and
      official Inno component/download behavior; keep Tauri NSIS as the GUI
      app installer rather than the suite installer unless evidence says
      otherwise.
- [ ] Draft the component matrix and shared payload layout.
- [ ] Decide whether the suite installer should become a new `windows.ps1`
      task or an extension of the existing `package-ofx`/`package-adobe` flow.
- [ ] Add generated-installer regression tests before implementing the suite
      builder.
- [ ] Record follow-up implementation task(s) only after the plan is reviewed.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created from user request for a single installer that can select host
surfaces and Green/Blue packs. Existing repo evidence supports feasibility:
the Inno Setup template already has component selection for Green, Blue, and
recommended Green plus Blue; Adobe and OFX packaging both route through the
canonical Windows wrapper; the Tauri runtime package currently builds through
Tauri/NSIS and stages a packaged runtime. The recommended architecture is a
top-level Inno suite installer that coordinates existing staged payloads,
because Tauri bundling is app-centric while this product needs a multi-surface
component installer.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
