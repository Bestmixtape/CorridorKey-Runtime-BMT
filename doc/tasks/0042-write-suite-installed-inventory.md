# Task `0042`: Write Suite Installed Inventory

**Status:** done
**Created:** 2026-05-27
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The unified Windows suite installer can now render, compile, stage local
payloads, and externalize optional online payloads. The next release-hardening
step is to leave a small installed inventory that diagnostics, repair, clean
install, and deselection logic can trust. Without this inventory, a rerun of
the installer has no product-owned record of which CorridorKey surfaces and
model packs were selected.

This task owns only the installed inventory file written by the generated Inno
script. Clean install, repair, and deselection cleanup use this inventory in
later tasks.

## Acceptance Criteria

- [x] Generated suite `.iss` output declares a stable installed inventory path
      under the shared runtime resources root.
- [x] The installed inventory records suite version, display label, flavor,
      shared runtime root, GUI root, and installer surface.
- [x] Each selected component writes a component entry gated by its Inno
      component name, so runtime core is always recorded and optional GUI,
      host plugins, Green, and Blue are recorded only when selected.
- [x] Host surface inventory entries record destination roots for GUI,
      Resolve/Fusion OFX, Nuke OFX, Adobe, and CLI/runtime core.
- [x] Model-pack inventory entries record Green and Blue pack identities
      through the same component gates used for installation.
- [x] Regression coverage proves the generated online and offline `.iss`
      scripts contain the inventory entries.

## Plan

- [x] Add a failing regression to the suite `.iss` render test for inventory
      definitions and component-gated INI entries.
- [x] Update `scripts/package_suite_installer_windows.ps1` to render the
      installed inventory with Inno `[INI]` entries.
- [x] Run the suite installer render/scaffold/compile regressions.
- [x] Run fresh-context review with agents before commit.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-27

Grounding summary:

- Official Inno Setup docs define `[INI]` entries as the built-in way to write
  `.ini` keys during setup and allow constants in filename, section, key, and
  string fields.
- Official Inno Setup docs define `Components` as the per-entry gate used by
  setup sections; entries without `Components` are always processed, while
  entries with a component run only when that component is selected.
- In-repo suite generation already writes host `corridorkey_runtime.ini`
  entries in `[INI]` with component gates.
- Git history has multiple suite installer commits ending with
  `56534f9 feat(installer): support online optional suite payloads`; no prior
  installed-inventory implementation for the suite was found.

TDG ground-truth pair:

- Input: generated suite `.iss` for online or offline flavor.
- Expected output: a stable `{#SuiteInventoryPath}` plus `[INI]` entries that
  always record suite metadata and record each selected surface through the
  same Inno component gate used by the installed payload.

Criterion: testability. Chosen strategy: Inno `[INI]` entries gated by
`Components`. Rejected strategies: Pascal Script JSON writer because it adds
escaping and lifecycle complexity before repair logic needs it; generated
runtime helper executable because it increases payload and failure surface.

Implementation closeout:

- Rendered `SuiteInventoryPath` under shared runtime resources and reset the
  file at install start with `[InstallDelete]`, so repair/modify installs do
  not leave stale component entries behind.
- Wrote suite metadata, paths, component selections, host surfaces, and Green
  and Blue model pack entries through generated Inno `[INI]` entries.
- Validated manifest-derived inventory keys before rendering them, preventing
  unsafe pack IDs from becoming malformed installer script fields.
- Fresh-context review with agents found stale inventory risk and unsafe model
  pack key rendering; both findings were fixed with regression coverage.
- Tests passed:
  `ctest --test-dir build\debug -R "regression_windows_suite_(installer_scaffold|iss_render|compile_scaffold|payload_staging|online_optional_payloads)" --output-on-failure`
  (5/5).
- Hygiene passed: `git diff --check` reported only existing line-ending
  normalization warnings; `TODO`/`FIXME` scan found no source/doc additions
  beyond this checklist text.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
