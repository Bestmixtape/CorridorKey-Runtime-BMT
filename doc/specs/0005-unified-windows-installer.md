# Spec `0005`: Build Unified Windows Installer

**Status:** draft
**Created:** 2026-05-26
**Owner:** Runtime maintainers

## Context

Windows users need one installer surface that lets them choose the CorridorKey
runtime pieces they actually use without understanding the repository's
separate package flows. The project already ships or stages OFX, Adobe,
Tauri GUI, CLI/runtime, and model-pack artifacts through Windows packaging
scripts. Leaving those as unrelated install experiences makes first setup,
repair, offline installation, and support harder than the product needs to be.

The feature is a top-level Windows suite installer that coordinates existing
packaged payloads. It must preserve standalone CLI/runtime and standalone GUI
paths where those remain useful for support, smoke testing, or minimal
installs. It must not duplicate multi-GB runtime or model payloads when a user
selects more than one host surface.

## User Scenarios

- **Scenario 1:** A user installs only the surfaces they need
  - Given a Windows user runs the CorridorKey suite installer
  - When they select Resolve/Fusion, Nuke, Adobe, CLI/runtime core, GUI, and
    Green or Blue model packs
  - Then the installer stages only the selected components and records enough
    inventory for repair and diagnostics.

- **Scenario 2:** A user installs both Green and Blue capability
  - Given a Windows RTX user wants the recommended full local install
  - When they choose Green plus Blue
  - Then the installer stages the required model/runtime packs once in the
    shared installation layout used by every selected surface.

- **Scenario 3:** A user repairs or changes an install
  - Given CorridorKey is already installed
  - When the user reruns the suite installer and changes selected components
  - Then install, repair, clean install, and deselection behavior is explicit
    and does not leave stale host plugins pointing at missing runtime assets.

- **Scenario 4:** A maintainer builds online and offline installers
  - Given release artifacts have been staged through the canonical Windows
    wrapper
  - When the maintainer builds online or offline installer flavors
  - Then checksum validation, payload inventory, and generated installer
    scripts prove which payloads are included or downloaded.

## Requirements

### Functional

- The installer must expose selectable components for CLI/runtime core,
  Tauri GUI, OFX Resolve/Fusion, OFX Nuke, Adobe plugins, Green model pack,
  Blue model/runtime pack, and the recommended Green plus Blue install.
- The installer must define one shared runtime/model installation root or
  cache strategy used by selected host and GUI surfaces.
- The installer must reuse existing package outputs where possible and define
  which Windows wrapper tasks stage those payloads.
- Standalone CLI/runtime and standalone GUI packaging must remain available
  for support, smoke testing, and minimal installs.
- Online and offline installer behavior must include checksum verification,
  repair behavior, clean install behavior, and deselection behavior for
  previously installed components.
- Host detection and install destinations must be documented for
  Resolve/Fusion, Nuke, Adobe, CLI/runtime core, and GUI.
- Generated installer outputs must include enough inventory for diagnostics
  to report installed surfaces, model packs, and runtime roots.

### Non-functional

- Windows build and packaging entrypoints must continue to route through
  `scripts/windows.ps1`.
- The suite installer must not introduce a second, divergent model-pack
  contract from the runtime `doctor`, `models`, and package validation flows.
- Generated installer tests must verify component declarations, staged payload
  paths, checksums, and host-surface destinations before release.

## Success Criteria

Definitional. Measurable conditions; pass/fail observable, not aspirational.
Per-criterion progress tracking lives in per-Spec tasks.

- A generated suite installer script contains all supported component choices
  and maps each choice to a staged payload or download manifest entry.
- Selecting multiple host surfaces uses one shared runtime/model payload root
  instead of duplicating the same model pack per host.
- Online and offline installer builds fail when required checksums or staged
  payload inventory entries are missing.
- Repair, clean install, and component deselection behavior are documented and
  covered by generated-installer regression tests.
- Host install destinations for Resolve/Fusion, Nuke, Adobe, CLI/runtime, and
  GUI are documented in the suite installer plan.
- Standalone CLI/runtime and standalone GUI package flows still build after
  the suite installer is added.

## Edge Cases

- User selects Adobe but Adobe host locations are not present.
- User selects OFX Nuke but Resolve/Fusion is absent, or the reverse.
- User selects GUI without host plugins.
- User selects CLI/runtime core only.
- User selects both Green and Blue packs.
- User reruns the installer with a previously installed pack deselected.
- Offline payload is missing, corrupt, or has a checksum mismatch.
- Online payload download fails after some components have already been staged.
- Existing runtime root contains stale model packs from an older packaging
  contract.
- Install destination requires elevation or is locked by a running host app.

## Out of Scope

This spec does not require changing the native runtime processing contract,
changing model formats, replacing existing standalone package flows, or
building macOS/Linux installers. It does not require the Tauri NSIS app
installer to become the suite installer if a top-level Inno Setup installer is
the better fit for multi-surface component selection.

## Open Questions

- Should the suite installer be a new `scripts/windows.ps1` task or an
  extension of an existing package task?
- What exact shared runtime/model root should be canonical for suite installs?
- Which payloads are embedded in the offline installer and which remain
  downloaded by the online flavor?
- How should component deselection handle host plugins that depend on a shared
  runtime root still used by another selected surface?
- Which install smoke tests are required before a suite installer can ship?

## Related

- ADRs: none yet
- Tasks: `doc/tasks/0028-plan-unified-windows-installer.md`
- Supersedes / Depends on: depends on `doc/specs/0003-useful-tauri-gui.md`
