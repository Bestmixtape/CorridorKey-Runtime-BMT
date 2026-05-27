# Task `0045`: Expose Suite Readiness Wrapper

**Status:** done
**Created:** 2026-05-27
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0005-unified-windows-installer.md
**Board ref:**

## Context

The installed-suite validator exists as a standalone script, but Windows
operators should not need to remember an internal script path to validate an
installed CorridorKey suite. Repository rules make `scripts/windows.ps1` the
canonical Windows entrypoint, so suite readiness needs to be reachable through
that wrapper before the user-facing testing pass.

This task owns the wrapper surface only. It does not change the validator's
readiness rules or launch host applications.

## Acceptance Criteria

- [x] `scripts/windows.ps1` exposes a `validate-suite` task.
- [x] The wrapper delegates to `scripts/validate_suite_install_windows.ps1`.
- [x] The wrapper forwards runtime root, report path, distribution manifest,
      optional runtime command smoke, command path, and timeout arguments.
- [x] `validate-suite` does not require package/build display-label metadata.
- [x] Regression coverage proves the wrapper surface and delegation.

## Plan

- [x] Add a failing wrapper regression for `validate-suite`.
- [x] Extend `scripts/windows.ps1` parameters and task validation.
- [x] Delegate `validate-suite` to the installed-suite readiness validator.
- [x] Register and run the focused regression.
- [x] Run fresh-context review with agents before commit.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-27

Grounding summary:

- `AGENTS.md` requires Windows build, package, certification, and release
  operations to go through `scripts/windows.ps1`.
- Task 0044 added `scripts/validate_suite_install_windows.ps1` as a reusable
  installed-suite readiness validator.
- Existing wrapper regressions assert canonical task exposure by reading
  `scripts/windows.ps1` and, where useful, invoking render-only flows through
  the wrapper.

Implementation closeout:

- Added `validate-suite` to the canonical Windows wrapper and delegated it to
  `scripts/validate_suite_install_windows.ps1`.
- Added wrapper parameters with both `Suite...` names and native validator
  aliases: `RuntimeRoot`, `DistributionManifestPath`, `ReportPath`,
  `RunRuntimeCommands`, `RuntimeCommandPath`, and
  `RuntimeCommandTimeoutSeconds`.
- Kept `validate-suite` read-only with respect to project version metadata by
  bypassing `Initialize-CorridorKeyVersion` and display-label derivation.
- Added `tests/regression/test_windows_suite_readiness_wrapper.ps1`, covering
  successful wrapper delegation, native alias forwarding, `Suite...` timeout
  forwarding with a hanging fake command, and explicit report output.
- Tests passed:
  `ctest --test-dir build\debug -R "regression_windows_suite_(installer_scaffold|iss_render|compile_scaffold|payload_staging|online_optional_payloads|install_readiness|readiness_wrapper)" --output-on-failure`
  (7/7).
- Fresh-context review found the read-only version-init concern and exact
  argument-name ergonomics gap; both were fixed. Final focused re-review
  reported no blockers or concerns.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
