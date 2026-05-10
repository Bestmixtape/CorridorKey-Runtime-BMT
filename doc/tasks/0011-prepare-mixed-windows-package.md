# Task `0011`: Prepare Mixed Windows Package

**Status:** proposed
**Created:** 2026-05-10
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0002-dedicated-screen-nodes.md
**Board ref:**

## Context

The dedicated-node release must not use the TorchTRT-only Windows RTX packaging
shape from the investigation branch. Green requires ONNX Runtime TensorRT assets
and Blue requires Torch-TensorRT assets. Packaging and validation must report
missing payloads by node family so Green can remain usable when Blue assets are
absent.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] `agentic-ground` is run for package staging, model manifest, and
  validation patterns before script changes.
- [ ] The Windows RTX package stages Green ONNX Runtime assets and Blue
  Torch-TensorRT assets when both node families are selected.
- [ ] TorchTRT-only packaging logic from the investigation branch is not used as
  the dedicated-node default.
- [ ] Missing Green and missing Blue payloads are reported separately in
  generated inventory and validation output.
- [ ] A Green-only install can omit Blue Torch-TensorRT assets without blocking
  Green validation.
- [ ] Packaging tests cover mixed, Green-only, and missing-Blue states.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Ground against `scripts/windows.ps1`, `scripts/package_ofx.ps1`,
  `scripts/fetch_models.ps1`, installer manifests, and packaging tests on
  `main`.
- [ ] Classify investigation-branch packaging changes as port, discard, or
  rewrite.
- [ ] Keep ONNX Runtime staging for Green.
- [ ] Add Blue Torch-TensorRT staging as a separate node-family payload.
- [ ] Update generated inventory and validation reporting by node family.
- [ ] Run packaging regression tests and the canonical Windows package command
  through `scripts/windows.ps1` when prerequisites are available.
- [ ] Run `agentic-review` for this slice before marking done.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
