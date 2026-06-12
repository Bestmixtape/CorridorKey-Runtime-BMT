# Task `0044`: Validate Suite Install Readiness

**Status:** done
**Created:** 2026-05-27
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The suite installer can now build, write inventory, and handle repair,
clean-install, and deselection cleanup in generated installer scripts. The
next release-hardening gap is an installed-suite validator that turns the
release smoke scope into a repeatable report. Maintainers and support should
not have to infer whether an installed suite is ready by manually checking
paths and host payloads.

This task owns a repository script that validates an installed Windows suite
layout from `suite_inventory.ini`. Real host application launches remain
manual or host-specific follow-up work.

## Acceptance Criteria

- [x] A Windows validation script reads `suite_inventory.ini` from an installed
      shared runtime root and writes a machine-readable readiness report.
- [x] The report validates CLI/runtime core, GUI, OFX Resolve/Fusion, OFX Nuke,
      Adobe, Green, and Blue only when the inventory records those components.
- [x] Green and Blue checks use the distribution manifest instead of a
      duplicated model list.
- [x] Optional runtime command smoke can run `info`, `doctor`, `models`, and
      `presets` through the configured runtime command and record command
      results in the report.
- [x] Missing installed files make the report fail with actionable issues.
- [x] Regression coverage includes a complete fake installed suite and a
      missing-model failure.

## Plan

- [x] Add a failing regression test for validating a complete fake installed
      suite and running fake runtime command smoke.
- [x] Implement `scripts/validate_suite_install_windows.ps1`.
- [x] Add a missing-model regression to prove failed readiness is reported.
- [x] Register the regression in CTest and run the suite installer test group.
- [x] Run fresh-context review with agents before commit.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-27

Grounding summary:

- Spec 0005 requires generated installer outputs to include enough inventory
  for diagnostics to report installed surfaces, model packs, and runtime roots.
- The accepted release smoke scope says a suite installer cannot ship until
  generated installer regression tests, package validation, CLI/runtime smoke,
  GUI launch smoke, OFX discovery smoke, Nuke discovery smoke, and Adobe
  MediaCore smoke cover selected surfaces.
- Task 0042 introduced `suite_inventory.ini`; task 0043 made lifecycle cleanup
  depend on that inventory for ownership-aware deselection.
- Existing package validators already emit machine-readable reports and treat
  missing models as explicit validation state. This task follows that pattern
  for the installed suite surface.

TDG ground-truth pair:

- Input: fake installed suite root with `suite_inventory.ini`, component
  payload files, a distribution manifest, and a fake runtime command.
- Expected output: readiness JSON with `validation_passed=true`, component
  checks for every inventory-selected surface, and successful command smoke
  entries for `info`, `doctor`, `models`, and `presets`.

Criterion: support usefulness. Chosen strategy: standalone validator script
that reads installed inventory and writes JSON. Rejected strategies: adding
validation only to the installer because support needs a re-runnable command;
duplicating model filenames in the validator because the distribution manifest
is already the product model-pack contract.

Implementation closeout:

- Added `scripts/validate_suite_install_windows.ps1`, which reads
  `suite_inventory.ini`, writes a JSON readiness report, and exits nonzero
  when selected installed surfaces are incomplete.
- Runtime-only installs validate without requiring the model distribution
  manifest. Green and Blue require the manifest only when selected and validate
  inventory-recorded model packs against manifest entries.
- Runtime core now validates the shared suite payload contract: CLI alias,
  engine binary, ONNX Runtime DLL, runtime server, model inventory, and
  TorchTRT wrapper.
- GUI, OFX, and Adobe checks validate the runtime sidecar that points selected
  surfaces at the shared runtime root. Adobe validates both Green and Blue
  plugin binaries.
- Optional runtime command smoke records `info`, `doctor`, `models`, and
  `presets` results with bounded timeout and process-tree cleanup.
- Regression coverage now includes a complete fake suite, runtime-only
  optionality, missing model, missing runtime sidecar, missing Adobe plugin,
  future manifest pack, missing/malformed manifest, manifest path escape,
  archive file-count drift, missing manifest `files`, timeout, and default
  user-writable report path.
- Review with fresh-context agents found timeout, report path, manifest,
  runtime-only, sidecar, Adobe, runtime-core, archive, and schema gaps; final
  focused re-review reported no findings.
- Tests passed:
  `ctest --test-dir build\debug -R "regression_windows_suite_(installer_scaffold|iss_render|compile_scaffold|payload_staging|online_optional_payloads|install_readiness)" --output-on-failure`
  (6/6).
- Hygiene passed: `git diff --cached --check`; orphan `TODO`/`FIXME` scan
  found no additions beyond this checklist text.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
