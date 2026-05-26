# Task `0036`: Audit GUI Design System

**Status:** proposed
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

The GUI must feel richer and more premium without losing the CorridorKey visual
identity. `DESIGN.md` defines the current contract: sky-blue accent,
zinc-near-black surfaces, Apple-system typography, declared radii, and one
elevation token. The workbench has improved functionally, but the visual
surface still needs an explicit audit before more UI slices land.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] Changed GUI surfaces use the sky-blue/zinc visual contract from
      `DESIGN.md` and `src/gui/src/index.css`.
- [ ] Repeated role-bearing colors, radii, shadows, spacing, and motion values
      are either existing tokens or added to `DESIGN.md` and
      `src/gui/src/index.css` in the same change.
- [ ] The GUI does not introduce a second accent palette, copied
      EZ-CorridorKey identity, external fonts, ad hoc shadows, or ad hoc
      radius values.
- [ ] Workbench, Hardware, Settings, Support, History, dialogs, empty states,
      progress states, failure states, and Result preview states are visually
      audited.
- [ ] Desktop and mobile-width screenshots or Playwright captures show no text
      overflow, incoherent overlap, or inaccessible controls.
- [ ] E2E or visual smoke coverage protects the most important layout states
      from regressions.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Scan `src/gui/src/index.css`, `DESIGN.md`, and changed React components
      for non-token repeated visual values.
- [ ] Audit the workbench and secondary tabs at desktop and narrow widths.
- [ ] Add missing reusable token categories only when the value repeats and is
      a real design-system decision.
- [ ] Remove or restyle visual surfaces that read as placeholder, duplicated,
      or copied from a reference product.
- [ ] Add smoke coverage for the layout states most likely to regress.
- [ ] Run `pnpm test` and capture review screenshots where useful.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: Spec `0003` and `DESIGN.md` both require
the GUI to learn workflow patterns from reference products without copying
their visual identity. The current token contract deliberately has unresolved
spacing, type-scale, and motion categories; this task decides only values that
are repeated and necessary for the GUI surface.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
