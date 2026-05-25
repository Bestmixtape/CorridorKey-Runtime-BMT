# Task `0001`: Reorganize Agentic Layout

**Status:** done
**Created:** 2026-05-10
**Owner:** alexandremendoncaalvaro
**Spec ref:**
**ADR ref:** doc/adr/0001-agentic-repository-layout.md
**Board ref:**

## Context

The repository needed to align with the `agentic-development` CLI branch
layout and workflow proposition: root operational and specification documents,
`doc/adr`, `doc/tasks`, Claude Code targets, Codex targets, and
fresh-context review. This task recorded the repository layout change only; it
did not alter runtime source behavior.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] Architecture and design documents use root-level conventional paths.
- [x] Root `WORKFLOW.md` exists as the agent workflow contract.
- [x] ADR and task record directories exist.
- [x] Claude Code skills and the fresh-context reviewer are tracked under
      `.claude/`.
- [x] Codex-facing `.agents/skills` are installed from the upstream Codex skill
      source instead of mirroring Claude skill text.
- [x] `AGENTS.md` uses the upstream managed-skills marker block.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Promote architecture and design docs to root-level conventional paths.
- [x] Add root `WORKFLOW.md`.
- [x] Add `doc/adr` and `doc/tasks`.
- [x] Track Claude Code targets and the fresh-context reviewer.
- [x] Install Codex-facing `.agents/skills` from the upstream Codex skill
      source.
- [x] Use the upstream managed-skills marker block in `AGENTS.md`.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-10

- `agentic-skill` remains uninstalled because the upstream CLI marks it as
  opt-in only.
- Verification passed: documentation consistency, Python compilation for the
  checker, whitespace diff check, and stale legacy-path searches.
- This file was normalized from the legacy task format after completion. The
  legacy record did not identify a fresh-context review artifact.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
