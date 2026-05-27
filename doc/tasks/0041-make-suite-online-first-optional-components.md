# Task `0041`: Make Suite Installer Online-First With Optional Components

**Status:** done
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

- [x] Generated setup types include a runtime/CLI-only path and keep
      CLI/runtime core fixed.
- [x] Custom install can deselect Tauri GUI, OFX Resolve/Fusion, OFX Nuke,
      Adobe plugins, Green, and Blue while preserving CLI/runtime core.
- [x] Online flavor queues downloads for every selected model/runtime pack and
      every optional GUI/host payload that has a checksummed manifest entry.
- [x] Embedded online payloads are limited to the fixed runtime/CLI base or are
      reported explicitly as not-yet-externalized in generated inventory.
- [x] Offline flavor preserves the same optional component matrix while
      bundling the bytes needed for selected components.
- [x] Regression coverage proves component optionality, runtime-only custom
      install metadata, and online download entries for selected optional
      payloads.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Extend the suite manifest model so component payloads can be described as
      checksummed online assets, not only model packs.
- [x] Update `scripts/package_suite_installer_windows.ps1` to generate a
      runtime/CLI-only setup path and optional component download entries.
- [x] Keep the staged payload path available for local/offline package
      assembly, but make online output identify which optional bytes remain
      embedded.
- [x] Add regressions for optional component selection and online download
      generation.
- [x] Run suite installer regressions and fresh-context review.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task created from the packaging rule that everything is optional except the
CLI/runtime core, and that the online suite should use Inno Setup downloads as
much as practical for selected payloads.

### 2026-05-27

Implemented a runtime/CLI-only setup type, kept runtime core fixed across all
setup types, and kept GUI, host plugins, Green, and Blue selectable as optional
components. The suite manifest now accepts checksummed `component_payloads` for
optional GUI/host payloads, externalizes those payloads in online Inno output,
escapes download entries, respects payload subdirectories, and reports optional
payload components that still remain embedded because the distribution manifest
does not yet provide external assets for them. Regression coverage was added for
runtime-only metadata, component optionality, preserved offline/staged behavior,
online optional payload downloads, non-render online builds with externalized
optional payloads, and invalid optional payload sizes.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
