# Task `0032`: Rework GUI Secondary Tabs

**Status:** proposed
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

The workbench is becoming useful, but Hardware, Settings, Support, and History
must stop feeling like placeholder panels. Each tab should answer a concrete
user question with trustworthy runtime-backed state: what hardware/runtime is
available, what defaults will be used, what happened in past jobs, and how a
user can recover from an error without opening a terminal.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] Hardware shows runtime path, backend availability, GPU/device summary,
      model-pack state, supported tracks, and last doctor summary from
      runtime data only.
- [ ] Settings shows workflow defaults and safe preferences that the GUI
      actually persists or uses; stale placeholder copy is removed.
- [ ] Support shows actionable recovery information for missing runtime,
      missing model packs, failed jobs, preview proxy failures, and package
      repair.
- [ ] History shows persisted recent jobs with status, input, output, preset,
      backend, completion time, diagnostics, reveal/copy actions, and clear
      behavior.
- [ ] Runtime Commands remain discoverable from diagnostics without exposing
      arbitrary shell execution.
- [ ] Readiness smoke and fake-job E2E cover the updated secondary tabs and
      reject misleading placeholder content.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Inventory current tab content in `src/gui/src/App.tsx`.
- [ ] Define the user question answered by each tab and delete or move content
      that does not answer it.
- [ ] Extract tab-specific render helpers only when it reduces
      `src/gui/src/App.tsx` complexity.
- [ ] Extend `src/gui/scripts/smoke-runtime-readiness.mjs` for Hardware,
      Settings, and Support states.
- [ ] Extend `src/gui/scripts/smoke-job-lifecycle.mjs` for History actions.
- [ ] Run `pnpm test` and review the UI in the Tauri/browser shell.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: Runtime Commands now live in `App.tsx` and
are backed by `src/gui/src/lib/runtimeCommands.ts`; fake-job smoke already
persists successful and failed jobs into History. The remaining work is
information architecture and trust: every tab must be runtime-backed or
clearly user-actionable.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
