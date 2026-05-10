# Task `0009`: Lock Dedicated Model Selection

**Status:** proposed
**Created:** 2026-05-10
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0002-dedicated-screen-nodes.md
**Board ref:**

## Context

Green and Blue nodes must not share one mutable model-selection policy. Green
must keep the ONNX Runtime TensorRT artifact ladder from `main`; Blue must use
the dynamic Blue Torch-TensorRT artifact. The Green TorchTRT investigation branch
contains dynamic Green selection code that must not be ported into the Green
production path.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] `agentic-ground` is run for model-selection and runtime-contract patterns
  before code changes.
- [ ] Green Windows RTX selection resolves to ONNX fp16/context artifacts and
  does not select `corridorkey_dynamic_green_fp16.ts`.
- [ ] Blue Windows RTX selection resolves to `corridorkey_dynamic_blue_fp16.ts`
  through the Torch-TensorRT backend.
- [ ] Blue missing-artifact behavior fails closed with a recoverable diagnostic
  and does not silently fall back to Green ONNX artifacts.
- [ ] Tests cover Green, Blue, mixed staged artifacts, missing Blue artifacts,
  and runtime backend selection for `.onnx` versus `.ts`.
- [ ] Dynamic Green Torch-TensorRT selection changes from the investigation
  branch are classified as discarded in Notes.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Ground against `src/app/runtime_contracts.cpp`,
  `src/plugins/ofx/ofx_model_selection.hpp`, and
  `tests/unit/test_ofx_model_selection.cpp` on `main`.
- [ ] Add a node-identity input to model-selection code only where required by
  the descriptor split.
- [ ] Preserve Green ONNX TensorRT behavior from `main`.
- [ ] Route Blue selection to the existing dynamic Blue Torch-TensorRT artifact.
- [ ] Add focused model-selection tests for both node identities.
- [ ] Run `git diff --check` and focused model-selection/runtime-contract tests.
- [ ] Run `agentic-review` for this slice before marking done.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
