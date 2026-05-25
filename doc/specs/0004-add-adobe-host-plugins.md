# Spec `0004`: Add Adobe Host Plugins

**Status:** draft
**Created:** 2026-05-25
**Owner:** Runtime maintainers

## Context

CorridorKey has an accepted architecture decision to add Adobe After Effects
and Premiere plugins as Interface-layer adapters over the existing App/Core
runtime contracts. The implementation work already spans scope alignment,
optional SDK build support, the out-of-process runtime bridge, After Effects
effect behavior, Premiere validation, packaging, runtime panel telemetry,
input color-space handling, and render hot-path optimization.

Without a feature-level spec, those related tasks are tied only to ADR-0007 and
look orphaned in the task layer. This spec records the user-visible Adobe host
plugin feature that those tasks implement while keeping ADR-0007 as the
binding architectural decision.

## User Scenarios

- **Scenario 1:** After Effects user applies CorridorKey
  - Given the Adobe plugin is installed into a host-visible MediaCore location
  - When an After Effects user applies the CorridorKey effect to a clip
  - Then the effect exposes stable parameters, renders through the shared
    runtime service, preserves alpha output, and does not crash the host

- **Scenario 2:** Premiere user validates compatibility
  - Given the same Adobe effect plugin is discovered by Premiere
  - When a Premiere user renders or exports a short range
  - Then Premiere-specific pixel-format behavior is either supported or
    rejected with a visible host error without regressing After Effects

- **Scenario 3:** User installs the Adobe package
  - Given a Windows user selects the Adobe plugin package
  - When the package is built and installed through the canonical Windows flow
  - Then the `.aex`, runtime service, app-local dependencies, model inventory,
    diagnostics, and validation reports are staged together

- **Scenario 4:** User inspects runtime state
  - Given an Adobe render has run
  - When the user opens the effect controls or diagnostics
  - Then CorridorKey reports runtime status, guide source, effective quality,
    last-frame timing, and relevant package validation state

## Requirements

### Functional

- Adobe plugins must be first-class Interface-layer adapters over shared
  App/Core runtime contracts, not a fork of model selection, diagnostics,
  fallback policy, or inference behavior.
- The After Effects effect must register stable plugin identity, parameters,
  PiPL metadata, and render selectors needed for the supported bit depths.
- The Adobe bridge must keep backend libraries and model artifacts out of the
  host process by using the shared out-of-process runtime service.
- Premiere support must be validated through the Adobe effect surface and must
  track Premiere-specific pixel-format and render-path differences separately
  from After Effects.
- Packaging must run through `scripts/windows.ps1` and stage the Adobe plugin,
  runtime payload, model inventory, validation reports, and diagnostics.
- The runtime panel must expose operational telemetry without mutating Adobe
  parameters from render callbacks.
- Adobe input color-space behavior must expose only validated manual choices.
  Host-managed color must remain hidden until the callback path is tested.
- Render hot-path work must remain measurable and must not intentionally change
  visual output behavior.

### Non-functional

- The Adobe plugin must not link ONNX Runtime, CUDA, LibTorch, TensorRT, or
  model artifacts into the host plugin module.
- Unsupported host formats and missing runtime prerequisites must fail with
  host-visible errors instead of silent corruption or crashes.
- Shared App/Core changes made for Adobe must not regress CLI, OFX, or GUI
  behavior.
- Render hot-path changes that touch shared runtime paths remain subject to the
  repository benchmark gate.
- Public support status for After Effects or Premiere must not move beyond the
  validation evidence recorded by the host validation and packaging tasks.

## Success Criteria

Definitional. Measurable conditions; pass/fail observable, not aspirational.
Per-criterion progress tracking lives in per-Spec tasks.

- The Adobe SDK build scaffold is optional and normal builds remain clean when
  the SDK root is absent.
- The Adobe `.aex` module builds with stable identity and PiPL metadata when
  the SDK root is present.
- The Adobe runtime bridge prepares sessions and processes frames through the
  shared runtime service without direct backend library imports.
- The After Effects effect renders at least one frame through the runtime
  service and preserves alpha output in a local host smoke.
- Premiere compatibility is validated or rejected through explicit host
  behavior, tests, and recorded smoke evidence.
- The Adobe package stages the plugin, runtime payload, app-local dependencies,
  model inventory, diagnostics, and validation reports through the canonical
  Windows wrapper.
- Support documentation stays aligned with the validation evidence and does not
  claim official Adobe support before the gates pass.

## Edge Cases

- Adobe SDK root missing, incomplete, or incompatible.
- Plugin discovered by After Effects but not Premiere, or the reverse.
- Premiere host calls render selectors differently from After Effects.
- Host pixel format, alpha behavior, or color-management state is unsupported.
- Runtime service missing, wrong version, or unable to prepare the selected
  model artifact.
- Installer stages a partial model set or invalid packaged model.
- Host closes or reloads the project while the runtime service has active
  Adobe sessions.

## Out of Scope

This spec does not require a separate Premiere legacy Video Filter SDK plugin,
new model training, cloud execution, direct in-host inference, or official
Adobe support designation before the validation tasks pass.

## Open Questions

- Who must sign off before this retroactive spec moves from draft to accepted?
- Should the Adobe host support designation become `Experimental` or
  `Best-effort` after the first successful After Effects and Premiere smokes?
- Should any Adobe-specific runtime protocol extensions become a separate ADR
  if the shared host-plugin runtime service needs new commands?

## Related

- ADRs: `doc/adr/0007-add-adobe-host-plugins.md`
- Tasks: `doc/tasks/0015-align-adobe-plugin-scope.md`,
  `doc/tasks/0016-add-adobe-sdk-build-scaffold.md`,
  `doc/tasks/0017-build-adobe-runtime-bridge.md`,
  `doc/tasks/0018-implement-after-effects-effect.md`,
  `doc/tasks/0019-validate-premiere-compatibility.md`,
  `doc/tasks/0020-package-adobe-plugins.md`,
  `doc/tasks/0021-implement-adobe-runtime-panel.md`,
  `doc/tasks/0022-implement-adobe-input-color-space.md`,
  `doc/tasks/0023-optimize-adobe-render-hot-path.md`
- Supersedes / Depends on: depends on `ARCHITECTURE.md`, `docs/SPEC.md`,
  `help/SUPPORT_MATRIX.md`, `src/plugins/adobe/`, and `scripts/windows.ps1`
