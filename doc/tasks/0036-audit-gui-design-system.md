# Task `0036`: Audit GUI Design System

**Status:** done
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

- [x] Changed GUI surfaces use the sky-blue/zinc visual contract from
      `DESIGN.md` and `src/gui/src/index.css`.
- [x] Repeated role-bearing colors, radii, shadows, spacing, and motion values
      are either existing tokens or added to `DESIGN.md` and
      `src/gui/src/index.css` in the same change.
- [x] The GUI does not introduce a second accent palette, copied
      EZ-CorridorKey identity, external fonts, ad hoc shadows, or ad hoc
      radius values.
- [x] Workbench, Hardware, Settings, Support, History, dialogs, empty states,
      progress states, failure states, and Result preview states are visually
      audited.
- [x] Desktop and mobile-width screenshots or Playwright captures show no text
      overflow, incoherent overlap, or inaccessible controls.
- [x] E2E or visual smoke coverage protects the most important layout states
      from regressions.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Scan `src/gui/src/index.css`, `DESIGN.md`, and changed React components
      for non-token repeated visual values.
- [x] Audit the workbench and secondary tabs at desktop and narrow widths.
- [x] Add missing reusable token categories only when the value repeats and is
      a real design-system decision.
- [x] Remove or restyle visual surfaces that read as placeholder, duplicated,
      or copied from a reference product.
- [x] Add smoke coverage for the layout states most likely to regress.
- [x] Run `pnpm test` and capture review screenshots where useful.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: Spec `0003` and `DESIGN.md` both require
the GUI to learn workflow patterns from reference products without copying
their visual identity. The current token contract deliberately has unresolved
spacing, type-scale, and motion categories; this task decides only values that
are repeated and necessary for the GUI surface.

Audit result: reusable preview visuals now live in named CSS utilities instead
of arbitrary Tailwind gradients or ad hoc glow values. `ck-preview-empty`,
`ck-preview-checkerboard`, and `ck-wipe-divider` derive from the existing
background, card, and brand tokens. Settings and History surfaces were restyled
away from `rounded-2xl`, `rounded-full` empty icons, and `shadow-lg` active
toggles so audited panels keep the documented radius and shadow contract.

Visual smoke coverage now captures dialog entry and output-selected states,
desktop progress, completed, failure, cancelling, and cancelled states, plus
narrow and mobile Workflow, Hardware, Settings, Support, and History states. The
smoke asserts no global horizontal page overflow, no off-viewport elements, no
vertically compressed text, and stores Playwright screenshots under
`%TEMP%\corridorkey-gui-smoke` for review. The remaining `rounded-full` usages
are functional progress/status indicators, not cards, panels, or empty-state
containers.

Review result: two agent reviewers checked Standards and Spec axes. The first
pass found missing visual captures for progress, failure, dialog-triggering
states, and true mobile width. The fixes added those captures, added a 390x844
mobile pass, fixed the mobile viewer min-height overflow, and added a compressed
text guard that caught and protected the job status layout. Both reviewers
rechecked the diff and reported their findings resolved.

External grounding used for this audit: Tailwind v4 theme variables document
CSS-first token declaration; MDN custom properties document reusable semantic
values; Playwright visual comparison documentation records the need for stable
captures before screenshot assertions. In-repo grounding came from `DESIGN.md`,
`src/gui/src/index.css`, the workbench components, and recent GUI commits.

Verification: `pnpm exec vitest run src/lib/outputRecipe.test.ts`,
`pnpm exec tsc --noEmit --pretty false`, `pnpm build`, `pnpm smoke:job`, and
`pnpm test` pass. `pnpm test` covered 13 unit files with 60 tests, the Vite
build, runtime readiness smoke, and job lifecycle E2E smoke.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
