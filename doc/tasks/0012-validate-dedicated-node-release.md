# Task `0012`: Validate Dedicated Node Release

**Status:** proposed
**Created:** 2026-05-10
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0002-dedicated-screen-nodes.md
**Board ref:**

## Context

After descriptor, model-selection, runtime-isolation, and packaging slices land,
the dedicated-node branch needs a release validation pass. The validation must
prove that Green remains the `main` ONNX path, Blue is the Torch-TensorRT path,
and mixed-node graphs do not reproduce the multi-instance issues that motivated
the split.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] `agentic-ground` is run for release validation scope before final gates.
- [ ] Canonical Windows release build succeeds through `scripts/windows.ps1`.
- [ ] Focused unit and integration tests pass for OFX descriptors, model
  selection, runtime family, runtime cache, packaging, and diagnostics.
- [ ] Green ONNX benchmark coverage stays within the repository hot-path
  regression budget versus the selected `main` baseline.
- [ ] Blue Torch-TensorRT benchmark coverage passes the accepted Blue matrix for
  the dedicated Blue node.
- [ ] Mixed Green/Blue node coverage passes without screen-color, quality,
  backend, model, or runtime-family coercion.
- [ ] `agentic-review` is run for the completed branch before merge or PR.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Confirm all prerequisite implementation tasks are done or explicitly
  out-of-scope in Notes.
- [ ] Run `git diff --check`.
- [ ] Run the canonical Windows build through `scripts/windows.ps1`.
- [ ] Run focused unit, integration, regression, packaging, and benchmark gates.
- [ ] Record any skipped Torch-TensorRT or packaging gates with exact missing
  prerequisites.
- [ ] Run `agentic-review main..HEAD` or the equivalent current branch scope.
- [ ] Close the validation task only after the review findings are addressed or
  recorded as follow-up tasks.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
