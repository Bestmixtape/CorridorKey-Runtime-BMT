# Task `0008`: Implement OFX Descriptor Split

**Status:** proposed
**Created:** 2026-05-10
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0002-dedicated-screen-nodes.md
**ADR ref:** doc/adr/0006-expose-dedicated-ofx-nodes.md
**Board ref:**

## Context

The accepted dedicated-node direction requires one OFX bundle to expose a
legacy Green descriptor and a new Blue descriptor. This task owns the descriptor
identity split only. It must preserve saved Resolve projects by keeping the
legacy Green identifier unchanged and must not implement model-selection,
runtime-isolation, or packaging behavior beyond what descriptor tests require.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] `agentic-ground` is run for OFX multi-descriptor entrypoint patterns and
  recorded in Notes before code changes.
- [ ] ADR-0006 is accepted or replaced before code depends on the descriptor
  strategy.
- [ ] `OfxGetNumberOfPlugins` returns two descriptors.
- [ ] `OfxGetPlugin(0)` returns the legacy Green descriptor with identifier
  `com.corridorkey.resolve`.
- [ ] `OfxGetPlugin(1)` returns the Blue descriptor with a new stable
  reverse-DNS identifier and a distinct label.
- [ ] Invalid plugin indices still return `nullptr`.
- [ ] Unit coverage asserts descriptor count, identifier stability, label
  distinctness, and invalid-index behavior.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Ground against OFX entrypoint rules, existing
  `src/plugins/ofx/ofx_plugin.cpp`, `src/plugins/ofx/ofx_shared.hpp`, and git
  history for plugin identity.
- [ ] Choose and record the Blue identifier before editing descriptor code.
- [ ] Refactor descriptor construction in `src/plugins/ofx/ofx_plugin.cpp`
  without changing render behavior.
- [ ] Keep the legacy Green identifier and label compatibility in
  `src/plugins/ofx/ofx_shared.hpp`.
- [ ] Add or update focused tests for descriptor enumeration.
- [ ] Run `git diff --check` and focused unit tests.
- [ ] Run `agentic-review` for this slice before marking done.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
