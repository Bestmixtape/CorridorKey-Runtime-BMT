# Task `0041`: Make Suite Installer Online-First With Optional Components

**Status:** pending
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The suite installer must not turn a recommended full install into a mandatory
install. The fixed base is CLI/runtime core. GUI, host plugins, Green model
pack, and Blue model/runtime pack are optional choices. The online installer
should use installer-managed downloads as much as the payload manifest can
support, so selected optional bytes are fetched with checksums instead of being
embedded only because they came from local package outputs.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] Generated setup types include a runtime/CLI-only path and keep
      CLI/runtime core fixed.
- [ ] Custom install can deselect Tauri GUI, OFX Resolve/Fusion, OFX Nuke,
      Adobe plugins, Green, and Blue while preserving CLI/runtime core.
- [ ] Online flavor queues downloads for every selected model/runtime pack and
      every optional GUI/host payload that has a checksummed manifest entry.
- [ ] Embedded online payloads are limited to the fixed runtime/CLI base or are
      reported explicitly as not-yet-externalized in generated inventory.
- [ ] Offline flavor preserves the same optional component matrix while
      bundling the bytes needed for selected components.
- [ ] Regression coverage proves component optionality, runtime-only custom
      install metadata, and online download entries for selected optional
      payloads.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Extend the suite manifest model so component payloads can be described as
      checksummed online assets, not only model packs.
- [ ] Update `scripts/package_suite_installer_windows.ps1` to generate a
      runtime/CLI-only setup path and optional component download entries.
- [ ] Keep the staged payload path available for local/offline package
      assembly, but make online output identify which optional bytes remain
      embedded.
- [ ] Add regressions for optional component selection and online download
      generation.
- [ ] Run suite installer regressions and fresh-context review.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created from the packaging rule that everything is optional except the
CLI/runtime core, and that the online suite should use Inno Setup downloads as
much as practical for selected payloads.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
