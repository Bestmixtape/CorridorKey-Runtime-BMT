# Task `0028`: Plan Unified Windows Installer

**Status:** done
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
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

- [x] The installer plan names every selectable component: CLI/runtime core,
      Tauri GUI, OFX Resolve/Fusion, OFX Nuke, Adobe plugins, Green model pack,
      Blue model/runtime pack, and Green plus Blue recommended install.
- [x] The plan defines one shared runtime/model installation root or cache
      strategy so selected surfaces do not duplicate multi-GB model/runtime
      payloads unnecessarily.
- [x] The plan decides which existing package outputs are reused by the suite
      installer and which scripts must become staging steps.
- [x] The plan preserves portable CLI/runtime and GUI packaging where those
      are useful for support, smoke testing, or minimal installs.
- [x] Online and offline installer behavior is defined, including checksum
      verification, repair/clean install behavior, and behavior when a user
      deselects a previously installed pack.
- [x] Host detection and install destinations are documented for Resolve/Fusion,
      Nuke, Adobe, CLI/runtime core, and GUI.
- [x] The plan identifies the required test layers: manifest/unit tests,
      generated `.iss` regression tests, package validation, and at least one
      Windows install smoke per selected surface before release.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Inventory current packaging entrypoints:
      `scripts/windows.ps1`, `scripts/installer/build_installer.ps1`,
      `scripts/package_ofx_installer_windows.ps1`,
      `scripts/package_adobe_plugins_windows.ps1`, and
      `scripts/package_runtime_installer_windows.ps1`.
- [x] Ground installer capability against the existing Inno Setup template and
      official Inno component/download behavior; keep Tauri NSIS as the GUI
      app installer rather than the suite installer unless evidence says
      otherwise.
- [x] Draft the component matrix and shared payload layout.
- [x] Decide whether the suite installer should become a new `windows.ps1`
      task or an extension of the existing `package-ofx`/`package-adobe` flow.
- [x] Define generated-installer regression tests that must exist before the
      suite builder ships.
- [x] Record follow-up implementation task(s) only after the plan is reviewed.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created from user request for a single installer that can select host
surfaces and Green/Blue packs. Existing repo evidence supports feasibility:
the Inno Setup template already has component selection for Green, Blue, and
recommended Green plus Blue; Adobe and OFX packaging both route through the
canonical Windows wrapper; the Runtime package provides a portable GUI/runtime
bundle. The recommended architecture is a top-level Inno suite installer that
coordinates existing staged payloads, because Tauri bundling is app-centric
while this product needs a multi-surface component installer.

Grounding result: official Inno Setup documentation supports the component
model needed here:

- Inno `[Components]` defines selectable install components, and `[Types]`
  defines the setup types that drive default component selection:
  https://jrsoftware.org/ishelp/topic_componentssection.htm and
  https://jrsoftware.org/ishelp/topic_typessection.htm.
- Inno component and task parameters link selected components to files, icons,
  run entries, and delete entries:
  https://jrsoftware.org/ishelp/topic_componentstasksparams.htm and
  https://jrsoftware.org/ishelp/topic_taskssection.htm.
- Inno `[Files]` supports downloaded external files, SHA-256 hash validation,
  and archive extraction, matching the existing online/offline model-pack
  template: https://jrsoftware.org/ishelp/topic_filessection.htm.
- Tauri documents Windows app installers as app-centric WiX or NSIS bundles,
  which supports keeping Tauri app packaging separate from the multi-surface
  suite instead of making it own component selection:
  https://v2.tauri.app/distribute/windows-installer/.

Repository inventory:

- `scripts/windows.ps1` is the canonical Windows entrypoint and currently
  exposes `package-ofx`, `package-adobe`, and `package-runtime`, but not a
  suite task.
- `scripts/installer/build_installer.ps1` renders the shared Inno template for
  `ofx` and `adobe` surfaces and supports online/offline flavors through
  `scripts/installer/distribution_manifest.json`.
- `scripts/installer/corridorkey.iss.template` already contains setup types
  for Green only, Blue only, and recommended Green plus Blue, plus fixed
  offline behavior, clean-install deletion, download planning, cache markers,
  and Adobe deselection cleanup.
- `scripts/installer/distribution_manifest.json` defines the public Windows
  RTX installable packs: Green FP16 512, 1024, 1536, and 2048 with context
  artifacts; Blue dynamic TorchScript; and the Blue TorchTRT runtime archive.
  It does not include user-installable `fp32` or 768 ONNX artifacts.
- `scripts/package_ofx_installer_windows.ps1` stages the OFX bundle and legacy
  NSIS installer. Its host destinations and cache handling remain useful for
  Resolve/Fusion and Nuke.
- `scripts/package_adobe_plugins_windows.ps1` stages Adobe MediaCore payloads,
  validates clean and upgrade smoke paths, and already delegates modern
  installer output to the shared Inno builder.
- `scripts/package_runtime_installer_windows.ps1` builds the Tauri GUI
  executable without bundling and delegates the portable runtime/GUI package to
  `scripts/package_windows.ps1`. The former full-payload Tauri/NSIS path is
  not a supported Windows RTX artifact.

Plan decision: add a new `scripts/windows.ps1 -Task package-suite` in the
implementation task. Do not overload `package-ofx`, `package-adobe`, or
`package-runtime`; those remain standalone support surfaces and package
validation fixtures. The suite should reuse the existing staged payload
layouts and manifest contracts, but its builder must have its own component
matrix because the current Inno template assumes one host surface at a time.

Suite component matrix:

- CLI/runtime core: fixed shared product root under
  `{autopf}\CorridorKey\Runtime`, containing `Contents\Win64`,
  `Contents\Resources`, `corridorkey.exe`, runtime provider DLLs,
  `model_inventory.json`, and installer inventory. This component is always
  installed when any GUI or host surface is selected, and can also be selected
  alone for support.
- Tauri GUI: installs the GUI app payload and points it at the shared runtime
  root. The portable Runtime bundle remains available as the GUI support
  package; the suite implementation stages the GUI payload directly instead of
  nesting another installer inside Inno.
- OFX Resolve/Fusion: installs the OFX host-discovery payload to
  `{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle`, reuses Resolve cache
  cleanup, and points runtime execution at the shared root.
- OFX Nuke: uses the same OFX bundle destination because Nuke discovers OFX
  plugins from the common OFX directory. It keeps Nuke host detection and cache
  cleanup separate in installer inventory and smoke tests.
- Adobe plugins: installs the Adobe payload to the detected
  `CommonPluginInstallPath` or `{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore`
  fallback under `CorridorKey`, and points runtime execution at the shared
  root.
- Green model pack: installs only the distribution-manifest `green-models`
  files into `Contents\Resources\models`.
- Blue model/runtime pack: installs `blue-models` into
  `Contents\Resources\models` and `blue-runtime` into
  `Contents\Resources\torchtrt-runtime\bin`.
- Recommended Green plus Blue: setup type that selects both model components
  against the single shared runtime root.

Host detection and destination rules:

- Resolve/Fusion detection is the existing DaVinci Resolve host check at
  `%ProgramFiles%\Blackmagic Design\DaVinci Resolve\Resolve.exe`. That covers
  the Resolve OFX host and its Fusion page. The suite installs to
  `%CommonProgramFiles%\OFX\Plugins\CorridorKey.ofx.bundle` and clears
  `%AppData%\Blackmagic Design\DaVinci Resolve\Support\OFXPluginCacheV2.xml`
  when Resolve is present.
- Standalone Fusion Studio detection is not implemented in the current repo.
  The suite implementation must either add and test a standalone Fusion
  detection rule before advertising standalone Fusion Studio support, or keep
  the Resolve/Fusion label scoped to the DaVinci Resolve host.
- Nuke detection scans `%ProgramFiles%\Nuke*` directories and treats any
  folder containing `Nuke*.exe` as an installed host. The suite installs to the
  common OFX bundle destination and clears
  `%LocalAppData%\Temp\nuke\ofxplugincache\ofxplugincache_Nuke*-64.xml` when
  Nuke is present.
- Adobe detection checks `HKLM:\SOFTWARE\Adobe\After Effects` and
  `HKLM:\SOFTWARE\WOW6432Node\Adobe\After Effects` for
  `CommonPluginInstallPath`, then falls back to
  `%ProgramFiles%\Adobe\Common\Plug-ins\7.0\MediaCore`. The suite installs
  under that root's `CorridorKey` directory.
- CLI/runtime core detection is the suite inventory plus
  `{autopf}\CorridorKey\Runtime\Contents\Win64\corridorkey.exe`. The release
  smoke must run `info`, `doctor`, `models`, and `presets` from that binary.
- GUI detection is the suite inventory plus the staged GUI executable under
  `{autopf}\CorridorKey\GUI`. The suite GUI smoke must prove the GUI launches
  and resolves the shared runtime root rather than requiring a private
  `src-tauri\resources\runtime` copy.

Online/offline behavior:

- Online suite installers embed the thin host, CLI/runtime, and GUI payloads,
  then download selected model/runtime packs from the distribution manifest
  using checksum verification before files leave the temporary installer area.
- Offline suite installers bundle every distribution-manifest pack and expose
  the same Green, Blue, and Green plus Blue choices as online installers. The
  bundled bytes stay in the installer; the selected components decide what is
  installed.
- Clean install removes selected pack files, pack cache markers, stale host
  payloads for selected surfaces, and generated inventory before restaging.
- Rerunning without clean install repairs selected surfaces and packs in place.
- Deselecting a host removes that host payload only. Deselecting a model pack
  removes shared pack files and markers only when the installed inventory shows
  no selected remaining surface requires it. The implementation must avoid
  leaving a host payload configured to use a missing shared runtime root.

Test plan for the implementation task:

- Manifest/unit regression: assert suite model choices come only from
  `distribution_manifest.json` and never include user-facing `fp32` or 768
  artifacts.
- Generated `.iss` regression: assert `[Types]`, `[Components]`, `[Files]`,
  `[InstallDelete]`, root constants, component links, and online/offline
  download or offline-file blocks are generated for every suite component.
- Package validation: validate staged CLI/runtime, GUI payload, OFX payload,
  Adobe payload, manifest checksums, and installed inventory before invoking
  Inno.
- Smoke coverage: run a CLI/runtime doctor smoke, GUI launch/runtime-root
  smoke, Resolve/Fusion OFX discovery smoke, Nuke OFX discovery smoke, and
  Adobe MediaCore clean/upgrade smoke before a suite installer can ship.
- Wrapper coverage: add a regression test proving `scripts/windows.ps1`
  exposes and delegates only the canonical `package-suite` entrypoint for this
  feature.

Review result: two fresh-context reviewers checked standards and
spec/product traceability. The review findings were addressed by recording
official Inno and Tauri source links, rewording generated-installer tests as a
defined implementation gate instead of already-written tests, making offline
Green/Blue selection consistent with the user-facing component requirement,
documenting concrete host detection and destination rules, and creating the
implementation follow-up at
`doc/tasks/0037-implement-windows-suite-installer-scaffold.md`.

Verification: this was a documentation-only planning task. `git diff --check`
passed with only the repository's expected LF-to-CRLF working-copy warnings.
`rg -n "TODO|FIXME|DRAFT|maybe|might|possibly|we might|TBD"` over the changed
spec and task files found only the standard Definition of Done checklist text.
The follow-up implementation task remains open as
`doc/tasks/0037-implement-windows-suite-installer-scaffold.md`.

### 2026-05-27

Runtime package grounding found the full-payload Tauri/NSIS installer path is
not a supported Windows RTX artifact because it embeds multi-GB runtime bytes
and fails real NSIS compilation. `package-runtime` remains the standalone
support path by emitting the portable runtime/GUI bundle and ZIP. The suite
installer remains the installable Windows surface for optional GUI, host,
Green, and Blue components.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
