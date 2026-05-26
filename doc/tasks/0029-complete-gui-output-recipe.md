# Task `0029`: Complete GUI Output Recipe

**Status:** proposed
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Artists need the GUI to describe and produce the output they actually want
without guessing what the runtime supports. The current workbench has an output
recipe foundation for artifact family, alpha behavior labels, preview
background controls, and suggested paths, but unsupported recipe fields are
intentionally not forwarded to the runtime. This task closes the product gap by
making output choices explicit, runtime-backed, and testable.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] The GUI shows only runtime-supported final artifact families for the
      selected source: movie, image sequence, EXR-capable sequence, or
      preview-only when that contract exists.
- [ ] The GUI lets the user choose alpha behavior for supported outputs:
      matte-only, RGBA/transparent, premultiplied composite, or external merge
      only when the runtime/App contract can honor it.
- [ ] Preview background controls affect preview only and remain distinct from
      final output composition: checkerboard, transparent, solid color, and
      replacement media.
- [ ] Replacement-media output is either fully wired through a native runtime
      contract with color-management intent or clearly disabled with recovery
      text; no invented `process` argument is sent.
- [ ] Suggested output paths and validation rules match the selected artifact
      family for files and folders, including dotted project folders.
- [ ] Result metadata and job chips show the effective output recipe after a
      run.
- [ ] Unit, integration, and E2E coverage exercise supported/unsupported recipe
      choices, output path validation, process payloads, and visible Result
      recipe metadata.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Audit current runtime process arguments and output behavior in
      `src/cli/main.cpp`, `src/app/job_orchestrator.cpp`, and
      `src/frame_io/`.
- [ ] Extend `src/gui/src/lib/outputRecipe.ts` tests before changing UI
      behavior.
- [ ] Add or expose an App-layer capability field for supported output recipe
      choices instead of hard-coding GUI assumptions.
- [ ] Wire `src/gui/src/components/workflow/ProcessFlow.tsx` so unsupported
      recipe choices are unavailable or clearly gated.
- [ ] Add fake-runtime E2E coverage in
      `src/gui/scripts/smoke-job-lifecycle.mjs`.
- [ ] Run the real-runtime Jordan smoke when movie output behavior changes.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: `doc/specs/0003-useful-tauri-gui.md`
requires output recipe controls but keeps App/Core ownership of processing
behavior; `src/gui/src/lib/outputRecipe.ts` already owns GUI recipe labels and
path readiness; `src/gui/src/components/workflow/ProcessFlow.tsx` already keeps
unsupported recipe fields out of `start_processing`. Nuke's viewer process
documentation separates display transforms from rendered output, which matches
the rule that preview backgrounds must not silently change final artifacts.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
