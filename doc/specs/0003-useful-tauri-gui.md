# Spec `0003`: Make The Tauri GUI Useful

**Status:** accepted
**Created:** 2026-05-25
**Owner:** Runtime maintainers

## Context

CorridorKey Runtime has a supported desktop GUI product surface for users who
do not want to install host plugins or drive the CLI, but the current Tauri app
is still closer to a packaged command launcher than a useful desktop workflow.
Those users need a clear path from footage to reviewed output: verify the
runtime, choose the right model and preset, process a job, understand failures,
and inspect the result without leaving the application.

The feature is a first useful desktop workflow for the existing Tauri GUI. It
must learn from EZ-CorridorKey's artist-facing project flow, CorridorKey
Engine's client-over-engine pattern, and CorridorKey Cloud's upload, queue,
progress, preview, and per-pass result model without copying their Python,
cloud, or Qt implementations. The Runtime GUI remains an Interface-layer
client over App/Core contracts.

Those references are product and workflow references only. The GUI must keep
the CorridorKey Runtime visual identity defined by `DESIGN.md` and the
Tailwind tokens in `src/gui/src/index.css`: sky-blue brand accent on
zinc-near-black surfaces, Apple-system typography, declared radius tokens, and
the declared elevation token.

## User Scenarios

- **Scenario 1:** First launch explains whether the runtime is usable
  - Given a user opens the desktop GUI after installing the Runtime package
  - When the GUI starts
  - Then the user sees runtime, model-pack, backend, and prerequisite status
    from the packaged runtime instead of a fabricated healthy fallback

- **Scenario 2:** A non-CLI user processes one clip
  - Given a user has a video file or image sequence and an optional alpha hint
  - When the user creates a job, chooses a preset, and starts processing
  - Then the GUI streams progress, active backend, timing, warnings, and final
    output state without requiring a terminal

- **Scenario 3:** A user recovers from missing model packs
  - Given a selected screen color or preset needs a model pack that is not
    installed
  - When the user attempts to process or opens diagnostics
  - Then the GUI identifies the missing pack, the affected capability, and the
    canonical recovery action

- **Scenario 4:** A user cancels or retries a job
  - Given a job is running and has not completed
  - When the user cancels it or closes the app
  - Then the runtime process is signalled, the UI enters a terminal cancelled
    state, and any retry starts from a clean process state

- **Scenario 5:** A user reviews the result in the app
  - Given a job completes successfully
  - When the user opens the result view
  - Then the GUI shows the output artifact location, summary metadata, and at
    least one visual comparison or pass preview before opening an external
    folder

## Requirements

### Functional

- The GUI must call the runtime's machine-readable `info`, `doctor`, `models`,
  and `presets` commands during startup or diagnostics and must render their
  status as user-facing readiness state.
- The GUI must not replace a failed runtime probe with a healthy-looking fake
  device. Probe failure is an error state with recovery text.
- The GUI must let a user create a job from a video file, still image, image
  sequence folder, or project folder supported by the runtime.
- The GUI must let a user attach or clear an optional alpha hint and must show
  whether processing will use an external hint, generated rough-matte fallback,
  or no valid hint path.
- The GUI must load presets and model choices from the runtime catalog instead
  of duplicating hard-coded choices in TypeScript.
- The GUI must expose the minimum useful run controls: input, output, preset,
  screen color or model family when available, output recipe, start, cancel,
  retry, reveal output, and copy diagnostic summary.
- The GUI must stream structured job events from `process --json` or an
  equivalent App-layer command contract, including started, backend selected,
  progress, warning, artifact written, completed, failed, and cancelled.
- The GUI must surface stage timings, fallback reasons, active backend, model
  artifact, output path, and elapsed time when the runtime reports them.
- The GUI must keep a persistent local history of recent jobs with input,
  output, preset, backend, status, completion time, and diagnostic summary.
- The GUI must provide a result view with at least one previewable output:
  composite preview, processed RGBA preview, matte preview, or a runtime-
  generated thumbnail for outputs that are otherwise too large to display.
- The GUI must support a single active job with visible queued or pending state
  for any additional job the UI allows the user to stage.
- The GUI must provide a diagnostics view that includes model-pack presence,
  backend availability, packaged runtime path, supported tracks, and the last
  `doctor` summary.
- The GUI must use the canonical packaged-runtime discovery flow and must
  report missing runtime files as package errors.
- The GUI must preserve App/Core ownership of processing behavior. The
  TypeScript and Tauri Rust layers may adapt command arguments and event
  payloads, but must not reimplement model selection, fallback policy, output
  recipes, or runtime diagnostics.
- Visual changes must use the existing design-system contract. Workflow
  references from EZ-CorridorKey must not introduce EZ visual identity into
  this app.
- Repeated role-bearing colors, radii, shadows, and font stacks must come from
  `DESIGN.md` and `src/gui/src/index.css`. Missing design-system categories
  must be added to those sources before they are used as reusable UI values.

### Non-functional

- Long-running processing must not block the Tauri webview or leave orphaned
  runtime processes after cancellation, failure, or application close.
- Tauri command errors and job events must be typed and serializable enough for
  the frontend to distinguish validation errors, missing prerequisites,
  process spawn failures, runtime failures, and cancellation.
- Filesystem permissions must be scoped to user-selected input, output, and
  runtime resource paths rather than granting broad read/write access.
- The first useful version must stay focused on direct local processing and
  diagnostics; advanced alpha-generation workflows are exposed only when they
  are already present in the native runtime contract.
- UI tests or smoke tests must cover startup with a fake runtime, a successful
  fake job, a failed fake job, and cancellation.
- Existing CLI, OFX, and Adobe behavior must not change except where a shared
  App-layer contract is deliberately extended for the GUI.
- The UI must not add a second accent palette, warm/yellow branding, external
  fonts, ad hoc shadows, ad hoc radius values, or copied EZ-CorridorKey
  component styling.

## Success Criteria

Definitional. Measurable conditions; pass/fail observable, not aspirational.
Per-criterion progress tracking lives in per-Spec tasks.

- A fresh GUI launch with the runtime binary missing shows a package error and
  does not show "Engine Standby" or a fake CPU device.
- A fresh GUI launch with the runtime present but required model packs missing
  shows the missing packs, affected model families, and recovery action.
- A user can process a supported sample clip through the GUI without invoking
  the CLI or installing a host plugin.
- Cancelling an active job causes the frontend to receive a cancelled terminal
  state and leaves no child runtime process owned by the GUI.
- A completed job writes output, appears in persistent history after app
  restart, and opens a result view with output metadata and a visual preview.
- The GUI consumes runtime-provided model and preset catalogs; changing the
  runtime catalog changes the GUI choices without a TypeScript edit.
- The diagnostics view displays `doctor` health, active backend support, model
  pack presence, and packaged runtime path from runtime data.
- The default Tauri capability file no longer grants unrestricted filesystem
  read/write access.
- The GUI smoke test passes with a fake runtime covering `info`, `models`,
  `presets`, `doctor`, progress events, completion, failure, and cancellation.
- The Windows package-runtime flow emits a portable runtime/GUI package, and
  the GUI resolves either a suite-provided shared runtime root or its
  side-by-side packaged runtime.
- A design-system audit confirms changed GUI surfaces use the `DESIGN.md`
  tokens and do not introduce a second accent palette, external font, ad hoc
  shadow, or ad hoc radius.

## Edge Cases

- Runtime binary missing, renamed, or not executable.
- Runtime resource directory present but missing model packs, provider DLLs, or
  platform-specific dependencies.
- `info`, `doctor`, `models`, or `presets` returns invalid JSON, partial JSON,
  non-zero exit, or stderr-only diagnostics.
- `process --json` emits malformed NDJSON between valid events.
- Output directory is missing, read-only, already contains partial output, or
  requires elevated permissions.
- Input and alpha hint frame counts do not match.
- User selects a file path with spaces or non-ASCII characters.
- User starts a job and closes the app while the runtime is compiling or
  processing.
- First-run backend compilation takes long enough that progress is initially
  quiet.
- CPU fallback is available for tolerant workflows but should not be mistaken
  for the supported GPU path.
- Screen-color or model-pack selection asks for Blue assets on a Green-only
  install.
- Very large videos or sequences require the GUI to stay responsive while the
  runtime reports progress slowly.

## Out of Scope

This spec does not require porting EZ-CorridorKey's PySide interface,
replicating its optional Python alpha generators, adding a cloud account model,
building a full timeline editor, adding training or model export features, or
changing host-plugin UX. It also does not require a direct C++ library binding
from Tauri Rust if the packaged runtime command contract remains reliable for
the first useful desktop workflow. It does not require copying
EZ-CorridorKey's visual identity, palette, typography, or component styling.

## Open Questions

- Who owns this spec?
- Should model-pack download and installation happen inside the GUI, or should
  the GUI only report missing packs and hand off to installer/package tooling?
- Should the first useful GUI support one queued job beyond the active job, or
  should it reject additional jobs until cancellation/completion?
- What preview artifact is the native runtime contract expected to produce for
  video outputs: thumbnail, preview PNG, short proxy video, or direct pass
  decode?
- Should cancellation be a first-class runtime command/event contract or a
  process-level signal managed by the Tauri bridge?
- Should the Tauri bridge keep shelling out to the packaged runtime for the
  MVP, or should a later ADR evaluate a direct App-layer Rust/C++ bridge?
- Should missing design-system categories such as spacing, type scale, and
  motion be defined before implementation, or should the first pass stay inside
  existing Tailwind defaults plus the current token set?

### Resolved Decisions

- Owner: Runtime maintainers.
- Model-pack installation: the first useful GUI reports missing packs and
  points to the canonical installer or package recovery path. It does not
  download or install model packs itself.
- Queue scope: the first useful GUI has one active runtime job. Additional
  work may exist only as visible pending UI state; it must not spawn a
  background queue of runtime processes.
- Preview artifact: the first runtime contract must provide a preview PNG or
  generated thumbnail that the GUI can show after completion. Proxy video
  preview is optional.
- Cancellation: cancellation is process-level in the Tauri bridge for the first
  useful version, with a terminal cancelled event surfaced to React. A
  first-class runtime cancellation command requires a later ADR.
- Runtime bridge: the first useful GUI shells out to the packaged runtime
  command contract. A direct App-layer Rust/C++ bridge is outside this accepted
  scope and requires a later ADR.
- Design-system gaps: implementation stays inside the current `DESIGN.md` and
  Tailwind token set. New reusable spacing, type-scale, or motion values must
  be added to `DESIGN.md` and `src/gui/src/index.css` before use.

## Related

- ADRs: `doc/adr/0001-agentic-repository-layout.md`
- Tasks: `doc/tasks/0024-implement-gui-runtime-readiness.md`,
  `doc/tasks/0025-implement-gui-job-lifecycle.md`,
  `doc/tasks/0026-evolve-gui-workbench-ux.md`
- Supersedes / Depends on: depends on `ARCHITECTURE.md`, `DESIGN.md`,
  `docs/SPEC.md`, `docs/FRONTEND.md`, `src/gui/`,
  `src/gui/src/index.css`, `scripts/windows.ps1`, and
  `scripts/package_runtime_installer_windows.ps1`
