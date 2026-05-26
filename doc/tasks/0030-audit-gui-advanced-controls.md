# Task `0030`: Audit GUI Advanced Controls

**Status:** proposed
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Users expect the standalone GUI to expose the meaningful CorridorKey controls
they already see in host plugins and reference tools, but the GUI must not copy
another product's layout or send options the native runtime cannot execute.
The current advanced panel exposes useful groups, but parity has not been
audited against OFX, Adobe, EZ-CorridorKey, and CorridorKey Engine.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] A parity matrix records OFX, Adobe, EZ-CorridorKey, CorridorKey Engine,
      runtime CLI, and current GUI controls by user-facing capability.
- [ ] Each GUI advanced control is classified as wired, visible-readonly,
      disabled-awaiting-contract, or intentionally omitted.
- [ ] The grouped advanced UI covers supported screen color/model family,
      quality, alpha hint, matte cleanup, despill, output mode,
      tiling/refinement, and runtime diagnostics controls.
- [ ] Unsupported plugin/reference controls do not appear as runnable GUI
      controls unless an App/Core contract exists.
- [ ] Missing runtime contracts discovered by the audit are recorded as
      follow-up tasks or linked to this task Notes.
- [ ] Unit and E2E coverage verify that default runs do not override runtime
      preset defaults and advanced controls only send explicit user choices.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Inventory OFX parameters under `src/plugins/ofx/`.
- [ ] Inventory Adobe parameters under `src/plugins/adobe/`.
- [ ] Inventory runtime CLI/App process options in `src/cli/` and `src/app/`.
- [ ] Compare those controls with `src/gui/src/lib/advancedSettings.ts` and
      `src/gui/src/components/workflow/ProcessFlow.tsx`.
- [ ] Update the GUI only for controls that already have a supported runtime
      path.
- [ ] Add tests in `src/gui/src/lib/advancedSettings.test.ts`,
      `src/gui/scripts/smoke-job-lifecycle.mjs`, and C++ runtime-contract tests
      when new process options are wired.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: `0027` already corrected user-facing model
and resolution choices to Auto, 512, 1024, 1536, and 2048 for Windows RTX; the
fresh review on `0026` established that GUI defaults must not override runtime
preset defaults. The parity work is an audit-first task because adding controls
before proving a runtime contract would violate Spec `0003`'s App/Core
ownership rule.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
