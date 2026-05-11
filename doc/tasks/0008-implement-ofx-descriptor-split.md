# Task `0008`: Implement OFX Descriptor Split

**Status:** proposed
**Created:** 2026-05-10
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0002-dedicated-screen-nodes.md
**ADR ref:** doc/adr/0006-expose-dedicated-ofx-nodes.md
**Board ref:**

## Context

The accepted dedicated-node direction requires one OFX bundle to expose a
legacy Green descriptor and a new Blue descriptor. This task owns the descriptor
identity split only. It must preserve saved Resolve projects by keeping the
legacy Green identifier unchanged and must not implement model-selection,
runtime-isolation, or packaging behavior beyond what descriptor tests require.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] `agentic-ground` is run for OFX multi-descriptor entrypoint patterns and
  recorded in Notes before code changes.
- [x] ADR-0006 is accepted or replaced before code depends on the descriptor
  strategy.
- [x] `OfxGetNumberOfPlugins` returns two descriptors.
- [x] `OfxGetPlugin(0)` returns the legacy Green descriptor with identifier
  `com.corridorkey.resolve`.
- [x] `OfxGetPlugin(1)` returns the Blue descriptor with a new stable
  reverse-DNS identifier and a distinct label.
- [x] Invalid plugin indices still return `nullptr`.
- [x] Unit coverage asserts descriptor count, identifier stability, label
  distinctness, and invalid-index behavior.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Ground against OFX entrypoint rules, existing
  `src/plugins/ofx/ofx_plugin.cpp`, `src/plugins/ofx/ofx_shared.hpp`, and git
  history for plugin identity.
- [x] Choose and record the Blue identifier before editing descriptor code.
- [x] Refactor descriptor construction in `src/plugins/ofx/ofx_plugin.cpp`
  without changing render behavior.
- [x] Keep the legacy Green identifier and label compatibility in
  `src/plugins/ofx/ofx_shared.hpp`.
- [x] Add or update focused tests for descriptor enumeration.
- [x] Run `git diff --check` and focused unit tests.
- [x] Run `agentic-review` for this slice before marking done.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-10 — agentic-ground (OFX multi-descriptor entrypoint)

Recortte: how to expose two OFX plugin descriptors (legacy Green identifier
`com.corridorkey.resolve` and new Blue identifier `com.corridorkey.resolve.blue`,
label `CorridorKey Blue`) from one bundle without changing render behavior.

Source A — official OpenFX standard:
- `AcademySoftwareFoundation/openfx:include/ofxCore.h` — `OfxGetNumberOfPlugins`
  is "called to determine how many plug-ins there are inside a binary";
  `OfxGetPlugin` "returns a pointer to the 'nth' plug-in implemented in the
  binary." `OfxPlugin.pluginIdentifier` "uniquely labels the plug-in among all
  plug-ins that implement an API ... legal ASCII string and have no whitespace
  in the name and no non printing chars." Spec is silent on whether multiple
  descriptors may share one `mainEntry` — silence is permission, and the
  Support library does it (Source B).
- Out-of-range `nth` and `nullptr` semantics are not formally specified; the
  community convention (and existing CorridorKey behavior) is to return
  `nullptr` for invalid indices.

Source B — validated OSS:
- `AcademySoftwareFoundation/openfx:Support/Library/ofxsImageEffect.cpp` — OFX
  Support Library, the canonical reference C++ wrapper. Stores descriptors in
  `OfxPlugInfoMap` keyed by plugin identifier; each entry holds a unique
  `OfxPlugin` plus its `PluginFactory`. All descriptors share one
  `mainEntryStr` dispatcher that takes `plugname` as a parameter and routes
  to the matching factory by identifier. Per-descriptor entry points are
  thin trampolines that bake their `plugname` into the dispatch call. This
  is the canonical pattern for raw-C-ABI plugins shipping multiple
  descriptors from one bundle.
- `NatronGitHub/openfx-misc:DebugProxy/DebugProxy.cpp` — uses
  `static std::vector<OfxPlugin> gPlugins` and per-plugin entry-point
  vectors `gPluginsMainEntry[nth]`. Confirms the per-index trampoline
  pattern in a different real plugin (proxy use case, but the descriptor
  shape is the same).

Source C — in-repo:
- `src/plugins/ofx/ofx_plugin.cpp:364-368` — single `static OfxPlugin g_plugin`
  initialized in OFX struct field order with `kPluginIdentifier`,
  `CORRIDORKEY_VERSION_MAJOR/MINOR`, `&set_host`, `&plugin_main_entry`. The
  field-order rationale is documented in the file's NOLINT block (lines
  13-26): "designated initialisers would obscure the spec field order."
- `src/plugins/ofx/ofx_plugin.cpp:385-405` — `OfxGetNumberOfPlugins` returns
  hard-coded `1`; `OfxGetPlugin(int nth)` returns `&g_plugin` only for `nth==0`
  and `nullptr` otherwise. Already wraps the body in `try`/`catch(...)` to
  protect the C ABI boundary.
- `src/plugins/ofx/ofx_shared.hpp:31-41` — `kPluginIdentifier =
  "com.corridorkey.resolve"` with explicit comment that "changing it would
  orphan every existing CorridorKey node in saved DaVinci Resolve projects."
  `kPluginLabel = "CorridorKey"`, `kPluginGroup = "Keying"`. Constants are
  the right seam for the split — add Blue siblings without touching the
  Green strings.
- `src/plugins/ofx/ofx_plugin.cpp:265-362` — `plugin_main_entry` is the
  action-dispatch table. Currently identity-agnostic. For this slice it
  stays identity-agnostic; later slices (0009/0010) will route by
  identifier inside this function.

Source D — git history:
- `git log --all -- src/plugins/ofx/ofx_plugin.cpp src/plugins/ofx/ofx_shared.hpp`
  surfaces no prior multi-descriptor attempt. Closest hits are
  `ba6925a refactor(ofx): clear clang-tidy debt in ofx_plugin.cpp`,
  `6f3f309 fix(ofx): align plugin with OFX 1.5 spec for Foundry Nuke 17 compatibility`,
  and `4817b56 feat(ofx): host-aware help routing for Foundry Nuke
  compatibility` — all single-descriptor work. Sibling branches
  `codex/torchtrt-dynamic-windows-rtx` and `feat/installer-and-blue-distribution`
  carry the dynamic Blue runtime work (commit `6f30757 feat: add
  deterministic dynamic blue runtime path`) and installer flavor work but
  do not split the OFX descriptor. No prior attempt found.

Happy path:
Add Blue identifier and label constants in `ofx_shared.hpp`
(`kPluginIdentifierBlue = "com.corridorkey.resolve.blue"`,
`kPluginLabelBlue = "CorridorKey Blue"`) without renaming the existing
`kPluginIdentifier`/`kPluginLabel` (which become the Green strings; alias as
`kPluginIdentifierGreen`/`kPluginLabelGreen` for symmetry). In
`ofx_plugin.cpp`, replace the single `g_plugin` POD with two: `g_plugin_green`
and `g_plugin_blue`, each pointing at its own thin trampoline
(`plugin_main_entry_green` / `plugin_main_entry_blue`) that forwards to a
renamed `plugin_main_entry_dispatch(identifier, action, handle, in, out)` —
this matches the OFX Support Library's `mainEntryStr(plugname, ...)` pattern
(Source B) and respects the C-ABI POD field order rule (Source C). Update
`OfxGetNumberOfPlugins` to return `2`; `OfxGetPlugin(0)` returns
`&g_plugin_green`, `OfxGetPlugin(1)` returns `&g_plugin_blue`, all other
indices (including negatives) return `nullptr`. Inside this slice the
dispatcher does not branch on identifier yet — describe() must still set the
correct label per descriptor, so describe() takes the identifier and resolves
its label/group from the constants (the only describe-time behavior that
differs between Green and Blue in this slice). All other actions remain
identity-agnostic until tasks 0009 (model selection) and 0010 (runtime
isolation) layer identifier-aware logic on top.

Proposed implementation vs happy path:
- aligned: per-descriptor trampolines + shared dispatcher; identifier-keyed
  label routing inside describe(); two static OfxPlugin PODs in spec field
  order; OfxGetNumberOfPlugins/OfxGetPlugin invariants.
- deviates: none. The Support library wraps descriptors in a map keyed by
  name; we use two named statics because we have a fixed set of two and
  pay no map lookup cost. Justification: fixed cardinality + zero runtime
  registration removes a layer; the trampoline-per-descriptor pattern is
  the load-bearing piece, not the storage container.

Confidence checkpoint:
- A consulted: yes (ofxCore.h spec text quoted)
- B consulted: yes (OFX Support Library + openfx-misc DebugProxy cited)
- C consulted: yes (ofx_plugin.cpp:364-405, ofx_shared.hpp:31-41 cited)
- D checked: yes — no prior attempt found in this repo or sibling branches
- happy path declared: yes
- deviations justified: n.a. (none)

### 2026-05-10 — implementation + local verification

Implemented the descriptor split per the happy path:
- New TU `src/plugins/ofx/ofx_plugin_descriptors.{hpp,cpp}` owns the two
  `OfxPlugin` PODs (`g_plugin_green`, `g_plugin_blue`), the per-descriptor
  trampolines (`plugin_main_entry_green`, `plugin_main_entry_blue`) that
  forward into the renamed shared dispatcher
  `plugin_main_entry_dispatch(plugin_identifier, action, handle, in, out)`
  in `ofx_plugin.cpp`, and the helper accessors `descriptor_count()`,
  `descriptor_at(int)`, `label_for_identifier(const char*)`.
- `set_host` moved into the descriptors TU so the OfxPlugin POD can take
  its address from the same TU it lives in. `OfxSetHost` writes
  `g_host` directly.
- `OfxGetNumberOfPlugins` and `OfxGetPlugin` in `ofx_plugin.cpp` now
  delegate to `descriptor_count()` / `descriptor_at(nth)`. Negative and
  out-of-range indices fall through to `nullptr`.
- `describe(descriptor, plugin_identifier)` in `ofx_actions.cpp` looks
  up the user-visible label via `label_for_identifier(plugin_identifier)`
  so Green and Blue advertise distinct `kOfxPropLabel`/`kOfxPropShortLabel`/
  `kOfxPropLongLabel` strings while sharing the rest of the describe
  property block. Render path untouched.
- `tests/unit/test_ofx_descriptor_split.cpp` (new) carries 11 TEST_CASEs
  asserting count == 2, both identifier strings verbatim, label
  distinctness, OOR / negative / int_min / int_max returning nullptr,
  per-descriptor distinct trampoline pointers, identifier address
  stability across lookups, and the OFX-spec ASCII-no-whitespace rule.
- `tests/integration/test_ofx_plugin_exceptions.cpp` extended with a
  TEST_CASE that dlopens `CorridorKey.ofx` and asserts both
  identifiers + invalid-index nullptr through the C ABI surface.
- `tests/unit/test_ofx_color_management.cpp` updated to pass
  `kPluginIdentifierGreen` to the new describe() signature at three
  call sites (color-management tests already exercise the Green path).
- `tests/unit/test_ofx_stubs.cpp` provides a `kOfxStatReplyDefault` stub
  for `plugin_main_entry_dispatch` so the unit target links the
  descriptor TU without pulling `ofx_plugin.cpp` and its action
  dispatcher into the test binary.

Build: `scripts\windows.ps1 -Task build` — clean (113/113 ninja steps).

Tests:
- `test_unit.exe '[unit][ofx][descriptor]'` — 11 cases / 150 assertions
  pass.
- `test_integration.exe '[integration][ofx][descriptor]'` — 1 case /
  10 assertions pass (dlopens the built `CorridorKey.ofx`).
- Regression sweep `test_unit.exe '[ofx]'` — 152 cases / 931 assertions
  pass; nothing in the OFX surface regressed.
- Regression sweep `test_integration.exe '[ofx]'` — 11 passed,
  2 skipped (missing `corridorkey_int8_512.onnx` artifact — unrelated
  pre-existing skip), 142 / 142 assertions pass.

Acceptance criteria 0–6 from the task description are now demonstrably
met. Remaining: `agentic-review` for the slice and human approval before
flipping the task status to `done`.

### 2026-05-10 — agentic-review (fresh-context) findings + resolution

Handoff persisted at
`.agentic/reviews/2026-05-11T01-18Z-task-0008-descriptor-split.md`. Fresh-
context reviewer returned 0 Blockers, 3 Concerns, 4 Notes.

Concerns resolved in this slice:

1. **ARCHITECTURE.md §7 Active ADRs table missing ADR-0006.** Added the
   row at the bottom of the table with the bundle/identifier/label
   summary so the binding decision is visible at the canonical source
   of truth alongside ADR-0001..ADR-0005.

2. **`plugin_main_entry_dispatch` forward-declared inside the
   descriptors .cpp instead of a shared header.** Moved the declaration
   into `src/plugins/ofx/ofx_plugin_descriptors.hpp` with a comment
   explaining the seam. Tasks 0009 (model selection) and 0010 (runtime
   isolation) extending this dispatcher now see the symbol via the
   header rather than rediscovering the per-TU forward declaration.

3. **Trampoline-to-dispatcher identifier routing had no test
   coverage** (the original tests asserted only pointer distinctness,
   not actual invocation). Added three TEST_CASEs in
   `tests/unit/test_ofx_descriptor_split.cpp`: Green trampoline
   forwards `kPluginIdentifierGreen`, Blue trampoline forwards
   `kPluginIdentifierBlue`, and neither cross-routes. The unit-test
   stub of `plugin_main_entry_dispatch` in
   `tests/unit/test_ofx_stubs.cpp` now captures the identifier and
   action passed by the trampoline so each test can drive the
   `OfxPlugin::mainEntry` function pointer and assert the captured
   value.

Notes left informational (logged for future-task pickup, not blocking
this slice):

1. Both descriptors share the `set_host` callback in
   `ofx_plugin_descriptors.cpp` — harmless under single-process,
   single-host architecture. Documented for any future per-descriptor-
   host work.
2. `OfxSetHost` in `ofx_plugin.cpp` and the per-POD `set_host`
   callback both write `g_host`. Both paths must move together if the
   host pointer ever becomes per-descriptor.
3. Task header `**Status:**` stays `proposed` until human approval
   flips it to `done` after the commit lands.
4. `kOfxPropPluginDescription` is identical for Green and Blue (only
   the label differs in this slice). Spec FR-3 requires distinct
   label, not distinct description; differentiating the description
   string is a UX paper-cut for a follow-up task, not a spec
   violation.

Verification after fixes:

- Build: `scripts\windows.ps1 -Task build` clean (incremental rebuild
  after the header / stub / test edits).
- `test_unit.exe '[unit][ofx][descriptor]'` — 14 cases / 166
  assertions pass (was 11 / 150 before the trampoline routing tests).
- `test_integration.exe '[integration][ofx][descriptor]'` — 1 case /
  10 assertions pass.
- Full `[ofx]` regression sweep — 155 unit cases / 947 assertions
  pass; 11 integration cases pass with no regression.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
