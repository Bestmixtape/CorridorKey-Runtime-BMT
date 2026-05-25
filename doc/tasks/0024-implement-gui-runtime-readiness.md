# Task `0024`: Implement GUI Runtime Readiness

**Status:** done
**Created:** 2026-05-25
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Non-CLI users need the desktop GUI to tell the truth about whether the packaged
runtime is usable before they choose files or start a job. The current GUI can
present a healthy-looking fallback when the runtime probe fails, which hides
packaging, backend, and model-pack problems until the workflow is already
broken.

This task establishes the first useful GUI slice: runtime readiness and
diagnostics driven by the embedded runtime contract, with smoke coverage against
a fake runtime binary.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] Startup calls runtime `info`, `doctor`, `models`, and `presets` through
      the Tauri bridge and renders their combined readiness state.
- [x] Runtime probe failure renders an explicit package or prerequisite error
      and never renders "Engine Standby" or a fake CPU device.
- [x] Missing model packs, unsupported backend state, packaged runtime path,
      supported tracks, and last `doctor` summary are visible in diagnostics.
- [x] Frontend model and preset choices come from runtime-provided catalogs
      instead of hard-coded TypeScript defaults.
- [x] Tauri command errors are typed so the frontend can distinguish missing
      runtime, invalid JSON, non-zero runtime exit, and prerequisite failures.
- [x] A GUI smoke test passes against a fake runtime covering successful
      readiness, missing runtime, missing models, invalid JSON, and non-zero
      `doctor` output.
- [x] Changed GUI surfaces use `DESIGN.md` and `src/gui/src/index.css` tokens
      without introducing a second accent palette, external font, ad hoc
      shadow, or ad hoc radius.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Replace the healthy fallback in `src/gui/src/lib/store.ts` with an
      explicit runtime probe error state.
- [x] Add typed Tauri readiness and diagnostics payloads in
      `src/gui/src-tauri/src/lib.rs`.
- [x] Wire frontend readiness, model catalog, preset catalog, and diagnostics
      state through `src/gui/src/lib/job.ts` or adjacent GUI state modules.
- [x] Update the workflow and diagnostics components under
      `src/gui/src/components/` to render runtime truth using existing design
      tokens.
- [x] Add a fake runtime test fixture and smoke coverage for the Tauri command
      bridge without requiring GPU models.
- [x] Run focused GUI verification and record exact commands/results in Notes.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-25

- Implemented typed Tauri runtime readiness using the packaged runtime command
  contract. `get_runtime_readiness` now collects `info`, `doctor`, `models`,
  and `presets`, preserves the resolved runtime path, and returns typed command
  errors for missing runtime, spawn failure, invalid JSON, non-zero exits, and
  prerequisite failures.
- Replaced the frontend fallback CPU state with explicit readiness state. The
  top bar and diagnostics view now render runtime missing/error/degraded/ready
  states without "Engine Standby" or a fabricated CPU device.
- Wired model and preset selectors to runtime catalogs and passed selected
  preset/model values to `start_processing` when selected.
- Added Tauri bridge smoke coverage in `src/gui/src-tauri/src/lib.rs` with a
  fake runtime for successful readiness, missing runtime, missing models,
  invalid JSON, and non-zero `doctor` output.
- Added the missing Tauri resource directory placeholder at
  `src/gui/src-tauri/resources/runtime/.gitkeep` so Tauri build-time resource
  validation has the configured path available before packaging stages the real
  runtime.
- Verification:
  - `cargo test` from `src/gui/src-tauri`: passed, 7 tests.
  - `pnpm install --frozen-lockfile` from `src/gui`: passed.
  - `pnpm build` from `src/gui`: passed.
  - Headless Chromium against `http://127.0.0.1:1420`: rendered the Vite GUI,
    confirmed `RUNTIME MISSING` is shown outside the Tauri shell, and confirmed
    "Engine Standby" and "CPU Baseline" are absent. The browser-only run reports
    Tauri IPC as unavailable, as expected outside the desktop shell.
- Fresh-context agent review found the remaining fake-runtime GUI smoke test as
  a Spec blocker. The acceptance criterion is intentionally left unchecked
  until a GUI-level smoke exercises readiness through the frontend.
- Review follow-up tightened runtime override to test/debug builds, restored
  destructive design tokens for runtime errors, distinguished unsupported
  backend capability from unreported capability, removed ad hoc `shadow-sm`
  from touched workflow step icons, and added package repair guidance beside
  missing model packs.
- Added `pnpm smoke:readiness` for a GUI-level fake-runtime smoke. The smoke
  creates a temporary runtime executable, runs fake `info`, `doctor`, `models`,
  and `presets` commands per scenario, injects the resulting readiness through
  the browser IPC shim, and asserts the rendered GUI for successful readiness,
  missing runtime, missing models, invalid JSON, and non-zero `doctor` output.
- Review follow-up filtered model choices to usable runtime artifacts, kept the
  model selector on runtime preset default unless the user explicitly chooses a
  model override, resolved selected model filenames under the packaged
  `models` directory before passing `--model`, derived backend diagnostics from
  `supported_backends`, drained runtime process stderr, and emitted a failed
  event on non-zero process exit.
- Removed the unused frontend filesystem plugin permission and broad
  `fs:allow-read` / `fs:allow-write` `**` scopes from the default Tauri
  capability; user-selected paths remain handled through dialog and Rust
  commands.
- Fresh-context agent re-review after fixes:
  - Standards axis: no real issues found.
  - Spec axis: remaining concerns were the unchecked task acceptance criterion
    and broad Tauri filesystem capability; both are now closed in this diff.
- Final verification:
  - `pnpm smoke:readiness` from `src/gui`: passed, 5 fake-runtime scenarios.
  - `pnpm build` from `src/gui`: passed.
  - `cargo test` from `src/gui/src-tauri`: passed, 9 tests.
  - `git diff --check` from the repository root: passed.


## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
