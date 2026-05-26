# Task `0032`: Rework GUI Secondary Tabs

**Status:** done
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

- [x] Hardware shows runtime path, backend availability, GPU/device summary,
      model-pack state, supported tracks, and last doctor summary from
      runtime data only.
- [x] Settings shows workflow defaults and safe preferences that the GUI
      actually persists or uses; stale placeholder copy is removed.
- [x] Support shows actionable recovery information for missing runtime,
      missing model packs, failed jobs, preview proxy failures, and package
      repair.
- [x] History shows persisted recent jobs with status, input, output, preset,
      backend, completion time, diagnostics, reveal/copy actions, and clear
      behavior.
- [x] Runtime Commands remain discoverable from diagnostics without exposing
      arbitrary shell execution.
- [x] Readiness smoke and fake-job E2E cover the updated secondary tabs and
      reject misleading placeholder content.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Inventory current tab content in `src/gui/src/App.tsx`.
- [x] Define the user question answered by each tab and delete or move content
      that does not answer it.
- [x] Extract tab-specific render helpers only when it reduces
      `src/gui/src/App.tsx` complexity.
- [x] Extend `src/gui/scripts/smoke-runtime-readiness.mjs` for Hardware,
      Settings, and Support states.
- [x] Extend `src/gui/scripts/smoke-job-lifecycle.mjs` for History actions.
- [x] Run `pnpm test` and review the UI in the Tauri/browser shell.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: Runtime Commands now live in `App.tsx` and
are backed by `src/gui/src/lib/runtimeCommands.ts`; fake-job smoke already
persists successful and failed jobs into History. The remaining work is
information architecture and trust: every tab must be runtime-backed or
clearly user-actionable.

Implemented the secondary-tab rework in `src/gui/src/App.tsx`. History now
shows input, output, backend, preset/model summary, completion date and time,
copy diagnostics, reveal output, and clear behavior. Settings now shows GUI
defaults actually used by the workbench and no longer labels frontend defaults
as runtime-backed. Support now replaces generic community cards with runtime
recovery panels for missing runtime, model-pack state, failed jobs, preview
proxy recovery, and package repair. Hardware and Runtime Commands stay
diagnostic-only and bounded to runtime command data.

Test-first coverage was added to
`src/gui/scripts/smoke-runtime-readiness.mjs` and
`src/gui/scripts/smoke-job-lifecycle.mjs`. The readiness smoke covers
Settings and Support success/error states, rejects stale placeholder copy, and
checks missing-runtime does not claim model packs are installed. The fake-job
E2E covers History output visibility, copy diagnostics, reveal output, and
clear behavior. Fresh-context review found no blocking issues after fixes; the
review findings on completion time, History clear coverage, conservative
Support state, local Settings labels, and history action failures were
addressed.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
