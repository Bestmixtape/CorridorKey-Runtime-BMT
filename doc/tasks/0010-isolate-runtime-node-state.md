# Task `0010`: Isolate Runtime Node State

**Status:** proposed
**Created:** 2026-05-10
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0002-dedicated-screen-nodes.md
**Board ref:**

## Context

Dedicated Green and Blue nodes can coexist in the same Resolve graph. Runtime
session state, cache keys, runtime family selection, diagnostics, and parameter
policy must therefore include node identity where needed. The shared-node policy
from the Green TorchTRT investigation branch must not coerce Green and Blue
instances into one screen or quality policy.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] `agentic-ground` is run for runtime-family, session-cache, and
  multi-instance policy patterns before code changes.
- [ ] Session/cache keys include node identity, backend family, selected
  artifact, and screen state where those values affect compatibility.
- [ ] ONNX Runtime TensorRT and Torch-TensorRT runtime families restart,
  partition, or cache independently when required.
- [ ] Green and Blue instances do not coerce each other's screen color, quality,
  backend, model, or runtime family.
- [ ] Any retained shared-node policy is scoped within one dedicated node
  identity; otherwise it is removed.
- [ ] Tests cover multiple Green nodes, multiple Blue nodes, and mixed
  Green/Blue nodes.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Ground against `src/plugins/ofx/ofx_instance.cpp`,
  `src/plugins/ofx/ofx_runtime_family.hpp`, `src/app/ofx_session_broker.*`,
  and related runtime cache tests.
- [ ] Identify which session and cache keys currently omit node identity.
- [ ] Update runtime-family isolation without changing public headers.
- [ ] Remove or scope shared-node policy behavior from the investigation branch.
- [ ] Add multi-instance tests for same-node and mixed-node graphs.
- [ ] Run `git diff --check` and focused runtime/cache/integration tests.
- [ ] Run `agentic-review` for this slice before marking done.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
