# Task `0043`: Implement Suite Lifecycle Cleanup

**Status:** done
**Created:** 2026-05-27
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The suite installer now stages payloads, supports online optional payloads,
and writes an installed inventory. The remaining lifecycle gap is explicit
behavior when a user reruns the installer to repair, clean install, or
deselect previously installed optional surfaces.

This task owns generated installer cleanup behavior only. It does not add a
runtime-side repair command, a GUI package manager, or real install smoke
automation.

## Acceptance Criteria

- [x] Generated suite `.iss` output exposes an unchecked Clean install task.
- [x] Clean install deletes selected runtime, GUI, host, and model/runtime
      payload roots before selected files are restaged.
- [x] Deselecting GUI removes the GUI root.
- [x] Deselecting both OFX surfaces removes the shared OFX bundle, while
      keeping either OFX surface selected preserves the shared bundle for
      repair.
- [x] Deselecting Adobe removes the Adobe MediaCore CorridorKey payload root.
- [x] Deselecting Green removes Green model files from the shared model root.
- [x] Deselecting Blue removes the Blue model file and Blue TorchTRT runtime
      tree from the shared resources root.
- [x] The cleanup code is emitted for online and offline suite installer
      scripts and is covered by generated `.iss` regression tests.

## Plan

- [x] Add a failing generated `.iss` regression for the Clean install task and
      lifecycle cleanup code.
- [x] Generate shared Pascal cleanup helpers for online and offline suite
      installers.
- [x] Keep the existing online download page flow intact while sharing the new
      lifecycle cleanup code.
- [x] Run suite installer regressions and fresh-context review with agents.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-27

Grounding summary:

- Spec 0005 requires repair, clean install, and deselection behavior for
  previously installed components.
- Task 0028 defines the suite lifecycle policy: clean install removes selected
  payloads and generated inventory before restaging; rerunning without clean
  install repairs selected surfaces in place; deselection removes stale
  optional payloads without deleting the fixed CLI/runtime core.
- Task 0042 added `suite_inventory.ini`, which future diagnostics can read,
  but this cleanup slice can be tested at generated-script level first.
- Official Inno Setup docs support the chosen shape:
  `WizardIsTaskSelected`, `WizardIsComponentSelected`,
  `CurStepChanged(ssInstall)`, and `DelTree`.

TDG ground-truth pair:

- Input: generated online or offline suite `.iss` for the accepted component
  matrix.
- Expected output: an unchecked `cleaninstall` task plus pre-install Pascal
  cleanup that deletes selected roots on clean install and deletes deselected
  optional roots/packs on rerun.

Criterion: lifecycle clarity. Chosen strategy: generated Pascal cleanup called
from `CurStepChanged(ssInstall)`. Rejected strategies: relying only on
`[InstallDelete]` because deselection needs shared OFX/component-state logic;
adding a helper executable because the cleanup can stay deterministic inside
the generated installer script.

Implementation closeout:

- Generated `[Tasks]` now exposes unchecked `cleaninstall`.
- Generated `[Code]` now reads the previous `suite_inventory.ini` before
  deleting it, removes deselected optional GUI, OFX, Adobe, Green, and Blue
  payloads only when the previous suite inventory says the suite owned them,
  and then applies clean-install deletion for selected runtime, resources,
  GUI, OFX, and Adobe roots.
- Cleanup helpers now raise an installer exception when `DelTree` or
  `DeleteFile` fails, so locked files do not silently leave stale payloads.
- Model cleanup deletes product model files and canonical pack markers named
  `.cache.<pack>.sha256`.
- Distribution manifest model pack `dest_subdir` values are validated with the
  same safe relative path rules used by optional payloads.
- Fresh-context review with agents found and rechecked ownership, delete
  failure, runtime resources, marker naming, and manifest path issues; final
  rereview returned no findings.
- Tests passed:
  `ctest --test-dir build\debug -R "regression_windows_suite_(installer_scaffold|iss_render|compile_scaffold|payload_staging|online_optional_payloads)" --output-on-failure`
  (5/5).
- Real `ISCC.exe` was not installed on this machine or PATH, so compile
  validation used the existing fake-ISCC scaffold coverage.
- Hygiene passed: `git diff --check` reported only expected line-ending
  normalization warnings; the orphan `TODO`/`FIXME` scan found no additions
  beyond this checklist text.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
