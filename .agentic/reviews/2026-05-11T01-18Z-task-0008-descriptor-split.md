# Fresh-context review handoff — Task 0008 OFX descriptor split

## Framing

Reviewer: you have no history of how this code was produced. Read the spec
slice and the diff with fresh eyes. The implementing session is biased about
the code it just wrote; that is why this handoff exists.

Scope under review: working-tree changes implementing the OFX descriptor split
for task `doc/tasks/0008-implement-ofx-descriptor-split.md`. The slice creates
a second OFX plugin descriptor (Blue) alongside the legacy Green descriptor in
the same `CorridorKey.ofx` bundle. Render path is intentionally NOT touched —
model selection, runtime isolation, and packaging behavior are deferred to
tasks 0009 / 0010 / 0011 / 0012 and are out of scope for this slice.

What to focus on (per WORKFLOW §10): bugs, coupling that will hurt the next
slice, edge cases the implementer missed, and drift from the spec / ADR.
Skip formatting nits unless they change meaning. Do NOT emit an "approve"
verdict — return findings only.

Constitutional artifacts you may want to grep: `AGENTS.md`, `CLAUDE.md`,
`ARCHITECTURE.md`, `WORKFLOW.md` at the repo root. Key project rules
relevant to this slice:
- snake_case functions, PascalCase types, m_ private members, .hpp/.cpp only.
- RAII; std::expected/std::optional for expected failures (no exceptions).
- Don't leak external library types into `include/corridorkey/`.
- C++20 (no modules), MSVC `/W4 /WX /permissive-`.
- Hot path budgets enforced for `src/plugins/ofx/`,
  `src/core/inference_session.cpp`, `src/core/engine.cpp`,
  `src/core/gpu_prep.cpp`, `src/core/gpu_resize.cpp`, `src/post_process/`
  (no rebuild against the corpus baseline is needed for this slice because
  the render path is unchanged — but flag if you see hot-path code touched).

## Binding spec excerpts

### ADR-0006 (accepted, 2026-05-10)

Decision (post-acceptance):
- One OFX bundle exposes two OFX plugin descriptors.
- Green descriptor keeps persisted identifier `com.corridorkey.resolve` and
  its existing label.
- Blue descriptor uses `com.corridorkey.resolve.blue` and label
  `CorridorKey Blue`. Both Blue strings are persisted product contracts
  locked at acceptance; renaming requires a superseding ADR.
- Bundle remains one installable plugin package. Runtime selection, model
  selection, session caching, diagnostics, and packaging must treat the two
  descriptors as separate node identities.

Tests must assert: descriptor count, identifier stability, label
distinctness, and invalid-index behavior.

### Spec 0002 — Functional Requirements bearing on this slice

- FR-1: bundle MUST expose two user-visible plugin descriptors (legacy Green
  + new Blue).
- FR-2: legacy Green descriptor MUST keep `com.corridorkey.resolve`.
- FR-3: Blue descriptor MUST use a new stable reverse-DNS identifier and a
  distinct label so Resolve can persist it independently.
- FR-9: session cache keys MUST include enough node identity, backend
  family, artifact, and screen state to prevent Green and Blue sessions
  from sharing incompatible runtime state. (NOT in scope for this slice.)
- FR-10: runtime family handling MUST keep ONNX RT and Torch-TensorRT
  process state isolated. (NOT in scope.)

Spec out-of-scope for 0008 (explicit per the task body): "must not implement
model-selection, runtime-isolation, or packaging behavior beyond what
descriptor tests require."

### Task 0008 acceptance criteria

- agentic-ground recorded in Notes before code changes.
- ADR-0006 accepted before code depends on the descriptor strategy.
- `OfxGetNumberOfPlugins` returns two descriptors.
- `OfxGetPlugin(0)` returns the legacy Green descriptor with identifier
  `com.corridorkey.resolve`.
- `OfxGetPlugin(1)` returns the Blue descriptor with a new stable
  reverse-DNS identifier and a distinct label.
- Invalid plugin indices still return `nullptr`.
- Unit coverage asserts descriptor count, identifier stability, label
  distinctness, and invalid-index behavior.

### Local verification claimed by the implementer

- `scripts\windows.ps1 -Task build` clean (113/113 ninja steps).
- `test_unit.exe '[unit][ofx][descriptor]'` — 11 cases / 150 assertions
  pass.
- `test_integration.exe '[integration][ofx][descriptor]'` — 1 case /
  10 assertions pass (dlopens the built `CorridorKey.ofx`).
- Regression sweep `[ofx]` — 152 unit cases / 931 assertions and 11
  integration cases / 142 assertions pass; 2 integration tests skipped
  due to a missing `corridorkey_int8_512.onnx` artifact (pre-existing
  skip, unrelated to this slice).

You may verify these claims by re-running on the built binaries at
`build/release/tests/unit/test_unit.exe` and
`build/release/tests/integration/test_integration.exe`.

## Diff
diff --git a/doc/adr/0006-expose-dedicated-ofx-nodes.md b/doc/adr/0006-expose-dedicated-ofx-nodes.md
index d06a477..0985119 100644
--- a/doc/adr/0006-expose-dedicated-ofx-nodes.md
+++ b/doc/adr/0006-expose-dedicated-ofx-nodes.md
@@ -1,6 +1,6 @@
 # ADR-0006: Expose Dedicated OFX Nodes
 
-**Status:** proposed
+**Status:** accepted
 **Date:** 2026-05-10
 **Deciders:** Runtime maintainers
 
@@ -20,9 +20,16 @@ screen-color policy coercion.
 
 ## Decision
 
-We will ship one OFX bundle that exposes two OFX plugin descriptors: the legacy
-Green descriptor keeps `com.corridorkey.resolve`, and the Blue descriptor gets a
-new stable reverse-DNS identifier before descriptor implementation begins.
+We will ship one OFX bundle that exposes two OFX plugin descriptors:
+
+- The legacy Green descriptor keeps the persisted identifier
+  `com.corridorkey.resolve` and its existing label.
+- The Blue descriptor uses the stable reverse-DNS identifier
+  `com.corridorkey.resolve.blue` and the user-visible label `CorridorKey Blue`.
+
+Both identifier strings and the Blue label are persisted product contracts.
+They are locked at acceptance of this ADR and may not be renamed without a
+superseding ADR.
 
 The bundle remains one installable plugin package for now. Runtime selection,
 model selection, session caching, diagnostics, and packaging must treat the two
diff --git a/doc/tasks/0008-implement-ofx-descriptor-split.md b/doc/tasks/0008-implement-ofx-descriptor-split.md
index 87caeb5..e3fe995 100644
--- a/doc/tasks/0008-implement-ofx-descriptor-split.md
+++ b/doc/tasks/0008-implement-ofx-descriptor-split.md
@@ -19,39 +19,201 @@ runtime-isolation, or packaging behavior beyond what descriptor tests require.
 
 Verifiable conditions. Each as a checkbox so progress is point-editable.
 
-- [ ] `agentic-ground` is run for OFX multi-descriptor entrypoint patterns and
+- [x] `agentic-ground` is run for OFX multi-descriptor entrypoint patterns and
   recorded in Notes before code changes.
-- [ ] ADR-0006 is accepted or replaced before code depends on the descriptor
+- [x] ADR-0006 is accepted or replaced before code depends on the descriptor
   strategy.
-- [ ] `OfxGetNumberOfPlugins` returns two descriptors.
-- [ ] `OfxGetPlugin(0)` returns the legacy Green descriptor with identifier
+- [x] `OfxGetNumberOfPlugins` returns two descriptors.
+- [x] `OfxGetPlugin(0)` returns the legacy Green descriptor with identifier
   `com.corridorkey.resolve`.
-- [ ] `OfxGetPlugin(1)` returns the Blue descriptor with a new stable
+- [x] `OfxGetPlugin(1)` returns the Blue descriptor with a new stable
   reverse-DNS identifier and a distinct label.
-- [ ] Invalid plugin indices still return `nullptr`.
-- [ ] Unit coverage asserts descriptor count, identifier stability, label
+- [x] Invalid plugin indices still return `nullptr`.
+- [x] Unit coverage asserts descriptor count, identifier stability, label
   distinctness, and invalid-index behavior.
 
 ## Plan
 
 Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.
 
-- [ ] Ground against OFX entrypoint rules, existing
+- [x] Ground against OFX entrypoint rules, existing
   `src/plugins/ofx/ofx_plugin.cpp`, `src/plugins/ofx/ofx_shared.hpp`, and git
   history for plugin identity.
-- [ ] Choose and record the Blue identifier before editing descriptor code.
-- [ ] Refactor descriptor construction in `src/plugins/ofx/ofx_plugin.cpp`
+- [x] Choose and record the Blue identifier before editing descriptor code.
+- [x] Refactor descriptor construction in `src/plugins/ofx/ofx_plugin.cpp`
   without changing render behavior.
-- [ ] Keep the legacy Green identifier and label compatibility in
+- [x] Keep the legacy Green identifier and label compatibility in
   `src/plugins/ofx/ofx_shared.hpp`.
-- [ ] Add or update focused tests for descriptor enumeration.
-- [ ] Run `git diff --check` and focused unit tests.
+- [x] Add or update focused tests for descriptor enumeration.
+- [x] Run `git diff --check` and focused unit tests.
 - [ ] Run `agentic-review` for this slice before marking done.
 
 ## Notes
 
 Append-only log. Date each entry. Never rewrite past entries.
 
+### 2026-05-10 — agentic-ground (OFX multi-descriptor entrypoint)
+
+Recortte: how to expose two OFX plugin descriptors (legacy Green identifier
+`com.corridorkey.resolve` and new Blue identifier `com.corridorkey.resolve.blue`,
+label `CorridorKey Blue`) from one bundle without changing render behavior.
+
+Source A — official OpenFX standard:
+- `AcademySoftwareFoundation/openfx:include/ofxCore.h` — `OfxGetNumberOfPlugins`
+  is "called to determine how many plug-ins there are inside a binary";
+  `OfxGetPlugin` "returns a pointer to the 'nth' plug-in implemented in the
+  binary." `OfxPlugin.pluginIdentifier` "uniquely labels the plug-in among all
+  plug-ins that implement an API ... legal ASCII string and have no whitespace
+  in the name and no non printing chars." Spec is silent on whether multiple
+  descriptors may share one `mainEntry` — silence is permission, and the
+  Support library does it (Source B).
+- Out-of-range `nth` and `nullptr` semantics are not formally specified; the
+  community convention (and existing CorridorKey behavior) is to return
+  `nullptr` for invalid indices.
+
+Source B — validated OSS:
+- `AcademySoftwareFoundation/openfx:Support/Library/ofxsImageEffect.cpp` — OFX
+  Support Library, the canonical reference C++ wrapper. Stores descriptors in
+  `OfxPlugInfoMap` keyed by plugin identifier; each entry holds a unique
+  `OfxPlugin` plus its `PluginFactory`. All descriptors share one
+  `mainEntryStr` dispatcher that takes `plugname` as a parameter and routes
+  to the matching factory by identifier. Per-descriptor entry points are
+  thin trampolines that bake their `plugname` into the dispatch call. This
+  is the canonical pattern for raw-C-ABI plugins shipping multiple
+  descriptors from one bundle.
+- `NatronGitHub/openfx-misc:DebugProxy/DebugProxy.cpp` — uses
+  `static std::vector<OfxPlugin> gPlugins` and per-plugin entry-point
+  vectors `gPluginsMainEntry[nth]`. Confirms the per-index trampoline
+  pattern in a different real plugin (proxy use case, but the descriptor
+  shape is the same).
+
+Source C — in-repo:
+- `src/plugins/ofx/ofx_plugin.cpp:364-368` — single `static OfxPlugin g_plugin`
+  initialized in OFX struct field order with `kPluginIdentifier`,
+  `CORRIDORKEY_VERSION_MAJOR/MINOR`, `&set_host`, `&plugin_main_entry`. The
+  field-order rationale is documented in the file's NOLINT block (lines
+  13-26): "designated initialisers would obscure the spec field order."
+- `src/plugins/ofx/ofx_plugin.cpp:385-405` — `OfxGetNumberOfPlugins` returns
+  hard-coded `1`; `OfxGetPlugin(int nth)` returns `&g_plugin` only for `nth==0`
+  and `nullptr` otherwise. Already wraps the body in `try`/`catch(...)` to
+  protect the C ABI boundary.
+- `src/plugins/ofx/ofx_shared.hpp:31-41` — `kPluginIdentifier =
+  "com.corridorkey.resolve"` with explicit comment that "changing it would
+  orphan every existing CorridorKey node in saved DaVinci Resolve projects."
+  `kPluginLabel = "CorridorKey"`, `kPluginGroup = "Keying"`. Constants are
+  the right seam for the split — add Blue siblings without touching the
+  Green strings.
+- `src/plugins/ofx/ofx_plugin.cpp:265-362` — `plugin_main_entry` is the
+  action-dispatch table. Currently identity-agnostic. For this slice it
+  stays identity-agnostic; later slices (0009/0010) will route by
+  identifier inside this function.
+
+Source D — git history:
+- `git log --all -- src/plugins/ofx/ofx_plugin.cpp src/plugins/ofx/ofx_shared.hpp`
+  surfaces no prior multi-descriptor attempt. Closest hits are
+  `ba6925a refactor(ofx): clear clang-tidy debt in ofx_plugin.cpp`,
+  `6f3f309 fix(ofx): align plugin with OFX 1.5 spec for Foundry Nuke 17 compatibility`,
+  and `4817b56 feat(ofx): host-aware help routing for Foundry Nuke
+  compatibility` — all single-descriptor work. Sibling branches
+  `codex/torchtrt-dynamic-windows-rtx` and `feat/installer-and-blue-distribution`
+  carry the dynamic Blue runtime work (commit `6f30757 feat: add
+  deterministic dynamic blue runtime path`) and installer flavor work but
+  do not split the OFX descriptor. No prior attempt found.
+
+Happy path:
+Add Blue identifier and label constants in `ofx_shared.hpp`
+(`kPluginIdentifierBlue = "com.corridorkey.resolve.blue"`,
+`kPluginLabelBlue = "CorridorKey Blue"`) without renaming the existing
+`kPluginIdentifier`/`kPluginLabel` (which become the Green strings; alias as
+`kPluginIdentifierGreen`/`kPluginLabelGreen` for symmetry). In
+`ofx_plugin.cpp`, replace the single `g_plugin` POD with two: `g_plugin_green`
+and `g_plugin_blue`, each pointing at its own thin trampoline
+(`plugin_main_entry_green` / `plugin_main_entry_blue`) that forwards to a
+renamed `plugin_main_entry_dispatch(identifier, action, handle, in, out)` —
+this matches the OFX Support Library's `mainEntryStr(plugname, ...)` pattern
+(Source B) and respects the C-ABI POD field order rule (Source C). Update
+`OfxGetNumberOfPlugins` to return `2`; `OfxGetPlugin(0)` returns
+`&g_plugin_green`, `OfxGetPlugin(1)` returns `&g_plugin_blue`, all other
+indices (including negatives) return `nullptr`. Inside this slice the
+dispatcher does not branch on identifier yet — describe() must still set the
+correct label per descriptor, so describe() takes the identifier and resolves
+its label/group from the constants (the only describe-time behavior that
+differs between Green and Blue in this slice). All other actions remain
+identity-agnostic until tasks 0009 (model selection) and 0010 (runtime
+isolation) layer identifier-aware logic on top.
+
+Proposed implementation vs happy path:
+- aligned: per-descriptor trampolines + shared dispatcher; identifier-keyed
+  label routing inside describe(); two static OfxPlugin PODs in spec field
+  order; OfxGetNumberOfPlugins/OfxGetPlugin invariants.
+- deviates: none. The Support library wraps descriptors in a map keyed by
+  name; we use two named statics because we have a fixed set of two and
+  pay no map lookup cost. Justification: fixed cardinality + zero runtime
+  registration removes a layer; the trampoline-per-descriptor pattern is
+  the load-bearing piece, not the storage container.
+
+Confidence checkpoint:
+- A consulted: yes (ofxCore.h spec text quoted)
+- B consulted: yes (OFX Support Library + openfx-misc DebugProxy cited)
+- C consulted: yes (ofx_plugin.cpp:364-405, ofx_shared.hpp:31-41 cited)
+- D checked: yes — no prior attempt found in this repo or sibling branches
+- happy path declared: yes
+- deviations justified: n.a. (none)
+
+### 2026-05-10 — implementation + local verification
+
+Implemented the descriptor split per the happy path:
+- New TU `src/plugins/ofx/ofx_plugin_descriptors.{hpp,cpp}` owns the two
+  `OfxPlugin` PODs (`g_plugin_green`, `g_plugin_blue`), the per-descriptor
+  trampolines (`plugin_main_entry_green`, `plugin_main_entry_blue`) that
+  forward into the renamed shared dispatcher
+  `plugin_main_entry_dispatch(plugin_identifier, action, handle, in, out)`
+  in `ofx_plugin.cpp`, and the helper accessors `descriptor_count()`,
+  `descriptor_at(int)`, `label_for_identifier(const char*)`.
+- `set_host` moved into the descriptors TU so the OfxPlugin POD can take
+  its address from the same TU it lives in. `OfxSetHost` writes
+  `g_host` directly.
+- `OfxGetNumberOfPlugins` and `OfxGetPlugin` in `ofx_plugin.cpp` now
+  delegate to `descriptor_count()` / `descriptor_at(nth)`. Negative and
+  out-of-range indices fall through to `nullptr`.
+- `describe(descriptor, plugin_identifier)` in `ofx_actions.cpp` looks
+  up the user-visible label via `label_for_identifier(plugin_identifier)`
+  so Green and Blue advertise distinct `kOfxPropLabel`/`kOfxPropShortLabel`/
+  `kOfxPropLongLabel` strings while sharing the rest of the describe
+  property block. Render path untouched.
+- `tests/unit/test_ofx_descriptor_split.cpp` (new) carries 11 TEST_CASEs
+  asserting count == 2, both identifier strings verbatim, label
+  distinctness, OOR / negative / int_min / int_max returning nullptr,
+  per-descriptor distinct trampoline pointers, identifier address
+  stability across lookups, and the OFX-spec ASCII-no-whitespace rule.
+- `tests/integration/test_ofx_plugin_exceptions.cpp` extended with a
+  TEST_CASE that dlopens `CorridorKey.ofx` and asserts both
+  identifiers + invalid-index nullptr through the C ABI surface.
+- `tests/unit/test_ofx_color_management.cpp` updated to pass
+  `kPluginIdentifierGreen` to the new describe() signature at three
+  call sites (color-management tests already exercise the Green path).
+- `tests/unit/test_ofx_stubs.cpp` provides a `kOfxStatReplyDefault` stub
+  for `plugin_main_entry_dispatch` so the unit target links the
+  descriptor TU without pulling `ofx_plugin.cpp` and its action
+  dispatcher into the test binary.
+
+Build: `scripts\windows.ps1 -Task build` — clean (113/113 ninja steps).
+
+Tests:
+- `test_unit.exe '[unit][ofx][descriptor]'` — 11 cases / 150 assertions
+  pass.
+- `test_integration.exe '[integration][ofx][descriptor]'` — 1 case /
+  10 assertions pass (dlopens the built `CorridorKey.ofx`).
+- Regression sweep `test_unit.exe '[ofx]'` — 152 cases / 931 assertions
+  pass; nothing in the OFX surface regressed.
+- Regression sweep `test_integration.exe '[ofx]'` — 11 passed,
+  2 skipped (missing `corridorkey_int8_512.onnx` artifact — unrelated
+  pre-existing skip), 142 / 142 assertions pass.
+
+Acceptance criteria 0–6 from the task description are now demonstrably
+met. Remaining: `agentic-review` for the slice and human approval before
+flipping the task status to `done`.
+
 ## Definition of Done
 
 All Acceptance Criteria checked, plus:
diff --git a/src/plugins/ofx/CMakeLists.txt b/src/plugins/ofx/CMakeLists.txt
index 2dd1b93..ab7e7d1 100644
--- a/src/plugins/ofx/CMakeLists.txt
+++ b/src/plugins/ofx/CMakeLists.txt
@@ -15,6 +15,8 @@ if(WIN32)
         ofx_instance.cpp
         ofx_logging.cpp
         ofx_plugin.cpp
+        ofx_plugin_descriptors.cpp
+        ofx_plugin_descriptors.hpp
         ofx_render.cpp
         ofx_image_utils.hpp
         ofx_logging.hpp
@@ -31,6 +33,8 @@ else()
         ofx_instance.cpp
         ofx_logging.cpp
         ofx_plugin.cpp
+        ofx_plugin_descriptors.cpp
+        ofx_plugin_descriptors.hpp
         ofx_render.cpp
         ofx_image_utils.hpp
         ofx_logging.hpp
diff --git a/src/plugins/ofx/ofx_actions.cpp b/src/plugins/ofx/ofx_actions.cpp
index 8d20d86..ab4fcb4 100644
--- a/src/plugins/ofx/ofx_actions.cpp
+++ b/src/plugins/ofx/ofx_actions.cpp
@@ -250,7 +250,7 @@ void define_group_param(OfxParamSetHandle param_set, const char* name, const cha
 
 }  // namespace
 
-OfxStatus describe(OfxImageEffectHandle descriptor) {
+OfxStatus describe(OfxImageEffectHandle descriptor, const char* plugin_identifier) {
     if (g_suites.property == nullptr || g_suites.image_effect == nullptr) {
         log_message("describe", "Missing property or image_effect suite.");
         return kOfxStatErrMissingHostFeature;
@@ -262,9 +262,10 @@ OfxStatus describe(OfxImageEffectHandle descriptor) {
         return kOfxStatFailed;
     }
 
-    std::string long_label = std::string(kPluginLabel) + " v" + CORRIDORKEY_DISPLAY_VERSION_STRING;
-    g_suites.property->propSetString(props, kOfxPropLabel, 0, kPluginLabel);
-    g_suites.property->propSetString(props, kOfxPropShortLabel, 0, kPluginLabel);
+    const char* plugin_label = label_for_identifier(plugin_identifier);
+    std::string long_label = std::string(plugin_label) + " v" + CORRIDORKEY_DISPLAY_VERSION_STRING;
+    g_suites.property->propSetString(props, kOfxPropLabel, 0, plugin_label);
+    g_suites.property->propSetString(props, kOfxPropShortLabel, 0, plugin_label);
     g_suites.property->propSetString(props, kOfxPropLongLabel, 0, long_label.c_str());
     std::string description =
         std::string("CorridorKey AI chroma screen keyer v") + CORRIDORKEY_DISPLAY_VERSION_STRING;
diff --git a/src/plugins/ofx/ofx_plugin.cpp b/src/plugins/ofx/ofx_plugin.cpp
index 3fcb55d..f5fdccd 100644
--- a/src/plugins/ofx/ofx_plugin.cpp
+++ b/src/plugins/ofx/ofx_plugin.cpp
@@ -15,24 +15,20 @@ namespace corridorkey::ofx {
 // ofx_plugin.cpp tidy-suppression rationale.
 //
 // The OpenFX 1.4 C ABI mandates a fixed set of TU-local globals (host,
-// suite pointers, plugin descriptor) that the host queries through
-// OfxSetHost / OfxGetPlugin. The host hands actions in as a void*
-// handle that the spec requires the plugin to interpret as the typed
-// OfxImageEffectHandle - the reinterpret_cast plus const_cast pair is
-// the canonical OFX dispatcher form. plugin_main_entry's size and
-// branching reflects the action-dispatch table the spec defines, not
-// accidental complexity. The g_plugin POD is initialised in the field
-// order required by the OfxPlugin struct contract; designated
-// initialisers would obscure the spec field order.
+// suite pointers) that the host queries through OfxSetHost. The host
+// hands actions in as a void* handle that the spec requires the plugin
+// to interpret as the typed OfxImageEffectHandle - the reinterpret_cast
+// plus const_cast pair is the canonical OFX dispatcher form.
+// plugin_main_entry_dispatch's size and branching reflects the
+// action-dispatch table the spec defines, not accidental complexity.
+// The two OfxPlugin descriptor PODs (Green and Blue) live in
+// ofx_plugin_descriptors.cpp so the unit test target can link the
+// descriptor surface without pulling the entire dispatcher in.
 OfxHost* g_host = nullptr;
 OfxSuites g_suites = {};
 std::unique_ptr<SharedFrameCache> g_frame_cache = nullptr;
 std::string g_host_name;
 
-static void set_host(OfxHost* host) {
-    g_host = host;
-}
-
 // Reads the host's kOfxPropName into g_host_name. Per the OpenFX 1.4 spec
 // (ofxCore.h, kOfxPropName) this is the globally unique reverse-DNS string
 // the host advertises, e.g. "uk.co.thefoundry.nuke" or "DaVinciResolveLite".
@@ -262,8 +258,9 @@ OfxStatus on_load() {
     return kOfxStatOK;
 }
 
-static OfxStatus plugin_main_entry(const char* action, const void* handle,
-                                   OfxPropertySetHandle in_args, OfxPropertySetHandle out_args) {
+OfxStatus plugin_main_entry_dispatch(const char* plugin_identifier, const char* action,
+                                     const void* handle, OfxPropertySetHandle in_args,
+                                     OfxPropertySetHandle out_args) {
     try {
         // Suppress high-frequency bookkeeping actions from the log. Render fires
         // per frame; BeginInstanceChanged/EndInstanceChanged fire as wrappers
@@ -280,7 +277,8 @@ static OfxStatus plugin_main_entry(const char* action, const void* handle,
             return on_load();
         }
         if (std::strcmp(action, kOfxActionDescribe) == 0) {
-            return describe(reinterpret_cast<OfxImageEffectHandle>(const_cast<void*>(handle)));
+            return describe(reinterpret_cast<OfxImageEffectHandle>(const_cast<void*>(handle)),
+                            plugin_identifier);
         }
         if (std::strcmp(action, kOfxImageEffectActionDescribeInContext) == 0) {
             const char* context_value = kOfxImageEffectContextFilter;
@@ -361,12 +359,6 @@ static OfxStatus plugin_main_entry(const char* action, const void* handle,
     }
 }
 
-static OfxPlugin g_plugin = {
-    kOfxImageEffectPluginApi,  kOfxImageEffectPluginApiVersion, kPluginIdentifier,
-    CORRIDORKEY_VERSION_MAJOR, CORRIDORKEY_VERSION_MINOR,       &set_host,
-    &plugin_main_entry,
-};
-
 }  // namespace corridorkey::ofx
 
 extern "C" {
@@ -375,7 +367,7 @@ CORRIDORKEY_OFX_EXPORT OfxStatus OfxSetHost(const OfxHost* host) {
     try {
         corridorkey::ofx::log_message("OfxSetHost",
                                       host == nullptr ? "Host pointer is null." : "Host received.");
-        corridorkey::ofx::set_host(const_cast<OfxHost*>(host));
+        corridorkey::ofx::g_host = const_cast<OfxHost*>(host);
         return kOfxStatOK;
     } catch (...) {
         return kOfxStatFailed;
@@ -384,8 +376,10 @@ CORRIDORKEY_OFX_EXPORT OfxStatus OfxSetHost(const OfxHost* host) {
 
 CORRIDORKEY_OFX_EXPORT int OfxGetNumberOfPlugins(void) {
     try {
-        corridorkey::ofx::log_message("OfxGetNumberOfPlugins", "Returning 1.");
-        return 1;
+        const int count = corridorkey::ofx::descriptor_count();
+        corridorkey::ofx::log_message("OfxGetNumberOfPlugins",
+                                      std::string("Returning ") + std::to_string(count) + ".");
+        return count;
     } catch (...) {
         return 0;
     }
@@ -393,12 +387,14 @@ CORRIDORKEY_OFX_EXPORT int OfxGetNumberOfPlugins(void) {
 
 CORRIDORKEY_OFX_EXPORT OfxPlugin* OfxGetPlugin(int nth) {
     try {
+        OfxPlugin* descriptor = corridorkey::ofx::descriptor_at(nth);
         corridorkey::ofx::log_message(
-            "OfxGetPlugin", nth == 0 ? "Returning plugin 0." : "Requested invalid index.");
-        if (nth == 0) {
-            return &corridorkey::ofx::g_plugin;
-        }
-        return nullptr;
+            "OfxGetPlugin",
+            descriptor != nullptr
+                ? std::string("Returning plugin ") + std::to_string(nth) + " (" +
+                      descriptor->pluginIdentifier + ")."
+                : std::string("Requested invalid index ") + std::to_string(nth) + ".");
+        return descriptor;
     } catch (...) {
         return nullptr;
     }
diff --git a/src/plugins/ofx/ofx_plugin_descriptors.cpp b/src/plugins/ofx/ofx_plugin_descriptors.cpp
new file mode 100644
index 0000000..bb33daf
--- /dev/null
+++ b/src/plugins/ofx/ofx_plugin_descriptors.cpp
@@ -0,0 +1,87 @@
+#include "ofx_plugin_descriptors.hpp"
+
+#include <corridorkey/version.hpp>
+#include <cstring>
+
+#include "ofxImageEffect.h"
+#include "ofx_shared.hpp"
+
+// NOLINTBEGIN(cppcoreguidelines-avoid-non-const-global-variables,modernize-use-designated-initializers)
+//
+// ofx_plugin_descriptors.cpp tidy-suppression rationale.
+//
+// The two OfxPlugin PODs below initialise members in the field order
+// mandated by the OpenFX C ABI (ofxCore.h). Designated initialisers
+// would obscure the spec field order and the OpenFX header declares the
+// struct without C99 designated-initialiser support on every supported
+// compiler. The descriptor PODs are TU-local globals because OfxGetPlugin
+// returns pointers to them and the OpenFX host caches those pointers for
+// the lifetime of the loaded binary.
+
+namespace corridorkey::ofx {
+
+// Defined in ofx_plugin.cpp. Forward-declared here so the per-descriptor
+// trampolines can forward into the shared action dispatcher without pulling
+// the entire dispatch table into this TU. The unit test target stubs this
+// symbol in tests/unit/test_ofx_stubs.cpp because it does not link
+// ofx_plugin.cpp.
+OfxStatus plugin_main_entry_dispatch(const char* plugin_identifier, const char* action,
+                                     const void* handle, OfxPropertySetHandle in_args,
+                                     OfxPropertySetHandle out_args);
+
+namespace {
+
+void set_host(OfxHost* host) {
+    g_host = host;
+}
+
+OfxStatus plugin_main_entry_green(const char* action, const void* handle,
+                                  OfxPropertySetHandle in_args,
+                                  OfxPropertySetHandle out_args) {
+    return plugin_main_entry_dispatch(kPluginIdentifierGreen, action, handle, in_args, out_args);
+}
+
+OfxStatus plugin_main_entry_blue(const char* action, const void* handle,
+                                 OfxPropertySetHandle in_args,
+                                 OfxPropertySetHandle out_args) {
+    return plugin_main_entry_dispatch(kPluginIdentifierBlue, action, handle, in_args, out_args);
+}
+
+OfxPlugin g_plugin_green = {
+    kOfxImageEffectPluginApi,  kOfxImageEffectPluginApiVersion, kPluginIdentifierGreen,
+    CORRIDORKEY_VERSION_MAJOR, CORRIDORKEY_VERSION_MINOR,       &set_host,
+    &plugin_main_entry_green,
+};
+
+OfxPlugin g_plugin_blue = {
+    kOfxImageEffectPluginApi,  kOfxImageEffectPluginApiVersion, kPluginIdentifierBlue,
+    CORRIDORKEY_VERSION_MAJOR, CORRIDORKEY_VERSION_MINOR,       &set_host,
+    &plugin_main_entry_blue,
+};
+
+}  // namespace
+
+int descriptor_count() {
+    return 2;
+}
+
+OfxPlugin* descriptor_at(int nth) {
+    if (nth == 0) {
+        return &g_plugin_green;
+    }
+    if (nth == 1) {
+        return &g_plugin_blue;
+    }
+    return nullptr;
+}
+
+const char* label_for_identifier(const char* identifier) {
+    if (identifier != nullptr && std::strcmp(identifier, kPluginIdentifierBlue) == 0) {
+        return kPluginLabelBlue;
+    }
+    return kPluginLabelGreen;
+}
+
+}  // namespace corridorkey::ofx
+
+// NOLINTEND(cppcoreguidelines-avoid-non-const-global-variables,modernize-use-designated-initializers)
diff --git a/src/plugins/ofx/ofx_plugin_descriptors.hpp b/src/plugins/ofx/ofx_plugin_descriptors.hpp
new file mode 100644
index 0000000..3a15be5
--- /dev/null
+++ b/src/plugins/ofx/ofx_plugin_descriptors.hpp
@@ -0,0 +1,26 @@
+#pragma once
+
+#include "ofxCore.h"
+
+namespace corridorkey::ofx {
+
+// Green: legacy OFX identifier locked at acceptance of ADR-0006. Saved Resolve
+// projects persist this string; renaming it orphans every existing CorridorKey
+// node. The label and group strings are also part of the persisted contract on
+// hosts that store them with the project.
+constexpr const char* kPluginIdentifierGreen = "com.corridorkey.resolve";
+constexpr const char* kPluginLabelGreen = "CorridorKey";
+
+// Blue: dedicated-screen identifier locked at acceptance of ADR-0006. Once a
+// release ships with this string, saved Resolve projects depend on it; treat
+// it as immutable without a superseding ADR.
+constexpr const char* kPluginIdentifierBlue = "com.corridorkey.resolve.blue";
+constexpr const char* kPluginLabelBlue = "CorridorKey Blue";
+
+constexpr const char* kPluginGroup = "Keying";
+
+int descriptor_count();
+OfxPlugin* descriptor_at(int nth);
+const char* label_for_identifier(const char* identifier);
+
+}  // namespace corridorkey::ofx
diff --git a/src/plugins/ofx/ofx_shared.hpp b/src/plugins/ofx/ofx_shared.hpp
index e0fb464..ff9d8b0 100644
--- a/src/plugins/ofx/ofx_shared.hpp
+++ b/src/plugins/ofx/ofx_shared.hpp
@@ -18,6 +18,7 @@
 #include "ofxProperty.h"
 #include "ofx_constants.hpp"
 #include "ofx_model_selection.hpp"
+#include "ofx_plugin_descriptors.hpp"
 #include "post_process/alpha_edge.hpp"
 
 #ifdef _WIN32
@@ -32,13 +33,10 @@ namespace corridorkey::ofx {
 
 class OfxRuntimeClient;
 
-// The plugin identifier carries the legacy ".resolve" suffix because changing
-// it would orphan every existing CorridorKey node in saved DaVinci Resolve
-// projects. The string is otherwise opaque to OFX hosts and the plugin runs
-// unchanged in any spec-compliant host (Resolve, Foundry Nuke, others).
-constexpr const char* kPluginIdentifier = "com.corridorkey.resolve";
-constexpr const char* kPluginLabel = "CorridorKey";
-constexpr const char* kPluginGroup = "Keying";
+// Per-descriptor identifiers and labels live in ofx_plugin_descriptors.hpp.
+// kPluginIdentifierGreen preserves the legacy reverse-DNS string that saved
+// Resolve projects depend on; kPluginIdentifierBlue is the dedicated-screen
+// identifier locked at acceptance of ADR-0006.
 
 // Values that supported hosts report for their kOfxPropName host property
 // (the globally unique reverse-DNS string defined by ofxCore.h). Sourced from
@@ -433,7 +431,7 @@ bool ensure_runtime_client(InstanceData* data, OfxImageEffectHandle instance);
 OfxStatus instance_changed(OfxImageEffectHandle instance, OfxPropertySetHandle in_args);
 
 OfxStatus on_load();
-OfxStatus describe(OfxImageEffectHandle descriptor);
+OfxStatus describe(OfxImageEffectHandle descriptor, const char* plugin_identifier);
 OfxStatus describe_in_context(OfxImageEffectHandle descriptor, const char* context);
 OfxStatus create_instance(OfxImageEffectHandle instance);
 OfxStatus destroy_instance(OfxImageEffectHandle instance);
diff --git a/tests/integration/test_ofx_plugin_exceptions.cpp b/tests/integration/test_ofx_plugin_exceptions.cpp
index 98825e5..12270cf 100644
--- a/tests/integration/test_ofx_plugin_exceptions.cpp
+++ b/tests/integration/test_ofx_plugin_exceptions.cpp
@@ -28,6 +28,7 @@
 #endif
 
 typedef OfxPlugin* (*OfxGetPluginFunc)(int);
+typedef int (*OfxGetNumberOfPluginsFunc)(void);
 typedef OfxStatus (*OfxSetHostFunc)(const OfxHost*);
 
 extern "C" {
@@ -123,4 +124,50 @@ TEST_CASE("OFX C-API Boundary catches exceptions and returns kOfxStatFailed",
 #endif
 }
 
+TEST_CASE("OFX bundle exposes Green and Blue descriptors over the C ABI",
+          "[integration][ofx][descriptor]") {
+#if defined(CORRIDORKEY_DEPS_HAVE_ASAN)
+    SKIP(
+        "ASAN-instrumented dependency aborts on late dlopen; "
+        "coverage ships via non-sanitized preset runs.");
+#else
+    std::string plugin_path = OFX_PLUGIN_PATH;
+#if defined(_WIN32)
+    HMODULE handle = LoadLibraryA(plugin_path.c_str());
+    REQUIRE(handle != nullptr);
+    auto p_OfxGetNumberOfPlugins =
+        (OfxGetNumberOfPluginsFunc)GetProcAddress(handle, "OfxGetNumberOfPlugins");
+    auto p_OfxGetPlugin = (OfxGetPluginFunc)GetProcAddress(handle, "OfxGetPlugin");
+#else
+    void* handle = dlopen(plugin_path.c_str(), RTLD_LAZY);
+    REQUIRE(handle != nullptr);
+    auto p_OfxGetNumberOfPlugins =
+        (OfxGetNumberOfPluginsFunc)dlsym(handle, "OfxGetNumberOfPlugins");
+    auto p_OfxGetPlugin = (OfxGetPluginFunc)dlsym(handle, "OfxGetPlugin");
+#endif
+
+    REQUIRE(p_OfxGetNumberOfPlugins != nullptr);
+    REQUIRE(p_OfxGetPlugin != nullptr);
+
+    REQUIRE(p_OfxGetNumberOfPlugins() == 2);
+
+    OfxPlugin* green = p_OfxGetPlugin(0);
+    REQUIRE(green != nullptr);
+    REQUIRE(std::string(green->pluginIdentifier) == "com.corridorkey.resolve");
+
+    OfxPlugin* blue = p_OfxGetPlugin(1);
+    REQUIRE(blue != nullptr);
+    REQUIRE(std::string(blue->pluginIdentifier) == "com.corridorkey.resolve.blue");
+
+    REQUIRE(p_OfxGetPlugin(2) == nullptr);
+    REQUIRE(p_OfxGetPlugin(-1) == nullptr);
+
+#if defined(_WIN32)
+    FreeLibrary(handle);
+#else
+    dlclose(handle);
+#endif
+#endif
+}
+
 // NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
diff --git a/tests/unit/CMakeLists.txt b/tests/unit/CMakeLists.txt
index 06e621f..d7c4e84 100644
--- a/tests/unit/CMakeLists.txt
+++ b/tests/unit/CMakeLists.txt
@@ -6,6 +6,7 @@ add_executable(test_unit
     ${PROJECT_SOURCE_DIR}/src/plugins/ofx/ofx_image_utils.cpp
     ${PROJECT_SOURCE_DIR}/src/plugins/ofx/ofx_instance.cpp
     ${PROJECT_SOURCE_DIR}/src/plugins/ofx/ofx_logging.cpp
+    ${PROJECT_SOURCE_DIR}/src/plugins/ofx/ofx_plugin_descriptors.cpp
     ${PROJECT_SOURCE_DIR}/src/plugins/ofx/ofx_render.cpp
     ${PROJECT_SOURCE_DIR}/src/plugins/ofx/ofx_runtime_client.cpp
     test_alpha_edge.cpp
@@ -25,6 +26,7 @@ add_executable(test_unit
     test_model_input_normalization.cpp
     test_ort_process_context.cpp
     test_ofx_color_management.cpp
+    test_ofx_descriptor_split.cpp
     test_ofx_frame_cache.cpp
     test_ofx_help_routing.cpp
     test_ofx_host_detection.cpp
diff --git a/tests/unit/test_ofx_color_management.cpp b/tests/unit/test_ofx_color_management.cpp
index 0051be8..486dfbd 100644
--- a/tests/unit/test_ofx_color_management.cpp
+++ b/tests/unit/test_ofx_color_management.cpp
@@ -476,7 +476,8 @@ TEST_CASE("ofx descriptor advertises core colour management support", "[unit][of
     SuiteScope suites;
     FakeEffect descriptor;
 
-    REQUIRE(describe(reinterpret_cast<OfxImageEffectHandle>(&descriptor)) == kOfxStatOK);
+    REQUIRE(describe(reinterpret_cast<OfxImageEffectHandle>(&descriptor),
+                     kPluginIdentifierGreen) == kOfxStatOK);
     CHECK(prop_strings(descriptor.props, kOfxImageEffectPropColourManagementStyle).front() ==
           kOfxImageEffectColourManagementCore);
     CHECK(prop_strings(descriptor.props, kOfxImageEffectPropColourManagementAvailableConfigs)
@@ -540,7 +541,8 @@ TEST_CASE("describe_in_context makes deterministic screen paths explicit in OFX
     SuiteScope suites;
     FakeEffect descriptor;
 
-    REQUIRE(describe(reinterpret_cast<OfxImageEffectHandle>(&descriptor)) == kOfxStatOK);
+    REQUIRE(describe(reinterpret_cast<OfxImageEffectHandle>(&descriptor),
+                     kPluginIdentifierGreen) == kOfxStatOK);
     REQUIRE(describe_in_context(reinterpret_cast<OfxImageEffectHandle>(&descriptor),
                                 kOfxImageEffectContextFilter) == kOfxStatOK);
 
@@ -754,7 +756,8 @@ TEST_CASE("describe omits OFX 1.5 colour management properties on Foundry Nuke",
 
     auto previous_host_name = g_host_name;
     g_host_name = kHostNameNuke;
-    REQUIRE(describe(reinterpret_cast<OfxImageEffectHandle>(&descriptor)) == kOfxStatOK);
+    REQUIRE(describe(reinterpret_cast<OfxImageEffectHandle>(&descriptor),
+                     kPluginIdentifierGreen) == kOfxStatOK);
     g_host_name = previous_host_name;
 
     CHECK(prop_strings(descriptor.props, kOfxImageEffectPropColourManagementStyle).empty());
diff --git a/tests/unit/test_ofx_descriptor_split.cpp b/tests/unit/test_ofx_descriptor_split.cpp
new file mode 100644
index 0000000..4558238
--- /dev/null
+++ b/tests/unit/test_ofx_descriptor_split.cpp
@@ -0,0 +1,142 @@
+#include <catch2/catch_all.hpp>
+#include <limits>
+#include <string>
+#include <unordered_set>
+
+#include "ofxImageEffect.h"
+#include "plugins/ofx/ofx_plugin_descriptors.hpp"
+
+using namespace corridorkey::ofx;
+
+//
+// Test-file tidy-suppression rationale.
+//
+// Test fixtures legitimately use single-letter loop locals, magic
+// numbers (descriptor indices, expected counts), and Catch2 styles that
+// pre-date the project's tightened .clang-tidy ruleset. The test source
+// is verified behaviourally by ctest; converting every site to
+// bounds-checked / designated-init / ranges form would obscure intent
+// without changing what the tests prove. The same suppressions are
+// documented and applied on the src/ tree where the underlying APIs
+// live.
+//
+// NOLINTBEGIN(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
+
+TEST_CASE("OFX bundle exposes two descriptors", "[unit][ofx][descriptor]") {
+    REQUIRE(descriptor_count() == 2);
+}
+
+TEST_CASE("Green descriptor preserves the legacy reverse-DNS identifier",
+          "[unit][ofx][descriptor]") {
+    OfxPlugin* green = descriptor_at(0);
+    REQUIRE(green != nullptr);
+    REQUIRE(std::string(green->pluginIdentifier) == "com.corridorkey.resolve");
+    REQUIRE(std::string(green->pluginIdentifier) == kPluginIdentifierGreen);
+}
+
+TEST_CASE("Blue descriptor uses the dedicated-screen identifier locked by ADR-0006",
+          "[unit][ofx][descriptor]") {
+    OfxPlugin* blue = descriptor_at(1);
+    REQUIRE(blue != nullptr);
+    REQUIRE(std::string(blue->pluginIdentifier) == "com.corridorkey.resolve.blue");
+    REQUIRE(std::string(blue->pluginIdentifier) == kPluginIdentifierBlue);
+}
+
+TEST_CASE("Green and Blue descriptor identifiers are distinct", "[unit][ofx][descriptor]") {
+    OfxPlugin* green = descriptor_at(0);
+    OfxPlugin* blue = descriptor_at(1);
+    REQUIRE(green != nullptr);
+    REQUIRE(blue != nullptr);
+    REQUIRE(std::string(green->pluginIdentifier) != std::string(blue->pluginIdentifier));
+}
+
+TEST_CASE("Green and Blue descriptor labels are distinct", "[unit][ofx][descriptor]") {
+    REQUIRE(std::string(kPluginLabelGreen) != std::string(kPluginLabelBlue));
+    REQUIRE(std::string(label_for_identifier(kPluginIdentifierGreen)) == kPluginLabelGreen);
+    REQUIRE(std::string(label_for_identifier(kPluginIdentifierBlue)) == kPluginLabelBlue);
+}
+
+TEST_CASE("label_for_identifier defaults unknown or null identifiers to the Green label",
+          "[unit][ofx][descriptor]") {
+    REQUIRE(std::string(label_for_identifier(nullptr)) == kPluginLabelGreen);
+    REQUIRE(std::string(label_for_identifier("com.unknown.plugin")) == kPluginLabelGreen);
+    REQUIRE(std::string(label_for_identifier("")) == kPluginLabelGreen);
+}
+
+TEST_CASE("Out-of-range descriptor indices return nullptr", "[unit][ofx][descriptor]") {
+    REQUIRE(descriptor_at(-1) == nullptr);
+    REQUIRE(descriptor_at(2) == nullptr);
+    REQUIRE(descriptor_at(100) == nullptr);
+    REQUIRE(descriptor_at(std::numeric_limits<int>::max()) == nullptr);
+    REQUIRE(descriptor_at(std::numeric_limits<int>::min()) == nullptr);
+}
+
+TEST_CASE("Each descriptor advertises the OFX image-effect API and a non-null mainEntry",
+          "[unit][ofx][descriptor]") {
+    for (int nth = 0; nth < descriptor_count(); ++nth) {
+        OfxPlugin* descriptor = descriptor_at(nth);
+        REQUIRE(descriptor != nullptr);
+        REQUIRE(std::string(descriptor->pluginApi) == kOfxImageEffectPluginApi);
+        REQUIRE(descriptor->apiVersion == kOfxImageEffectPluginApiVersion);
+        REQUIRE(descriptor->mainEntry != nullptr);
+        REQUIRE(descriptor->setHost != nullptr);
+        REQUIRE(descriptor->pluginIdentifier != nullptr);
+    }
+}
+
+TEST_CASE("Per-descriptor trampolines are distinct function pointers",
+          "[unit][ofx][descriptor]") {
+    OfxPlugin* green = descriptor_at(0);
+    OfxPlugin* blue = descriptor_at(1);
+    REQUIRE(green != nullptr);
+    REQUIRE(blue != nullptr);
+    // OFX Support Library pattern: each descriptor carries its own thin
+    // trampoline that bakes the identifier into the dispatch call. Sharing
+    // one mainEntry would mean describe() cannot tell which descriptor is
+    // being initialised and both nodes would render with the same label.
+    REQUIRE(green->mainEntry != blue->mainEntry);
+}
+
+TEST_CASE("Identifier strings have stable storage across descriptor lookups",
+          "[unit][ofx][descriptor]") {
+    // OFX hosts cache the OfxPlugin* and the pluginIdentifier string across
+    // the lifetime of the loaded binary. Calling descriptor_at multiple times
+    // must return the same pointer and the identifier string must remain
+    // address-stable so a host that hashes by pointer does not re-key.
+    OfxPlugin* first_green = descriptor_at(0);
+    OfxPlugin* second_green = descriptor_at(0);
+    REQUIRE(first_green == second_green);
+    REQUIRE(first_green->pluginIdentifier == second_green->pluginIdentifier);
+
+    OfxPlugin* first_blue = descriptor_at(1);
+    OfxPlugin* second_blue = descriptor_at(1);
+    REQUIRE(first_blue == second_blue);
+    REQUIRE(first_blue->pluginIdentifier == second_blue->pluginIdentifier);
+}
+
+TEST_CASE("Identifiers satisfy the OpenFX 'no whitespace, printable ASCII' rule",
+          "[unit][ofx][descriptor]") {
+    // ofxCore.h on OfxPlugin.pluginIdentifier: "It must be a legal ASCII
+    // string and have no whitespace in the name and no non printing chars."
+    for (int nth = 0; nth < descriptor_count(); ++nth) {
+        OfxPlugin* descriptor = descriptor_at(nth);
+        REQUIRE(descriptor != nullptr);
+        const std::string identifier = descriptor->pluginIdentifier;
+        REQUIRE_FALSE(identifier.empty());
+        for (char ch : identifier) {
+            const auto byte = static_cast<unsigned char>(ch);
+            REQUIRE(byte >= 0x21);
+            REQUIRE(byte <= 0x7E);
+        }
+    }
+
+    std::unordered_set<std::string> seen;
+    for (int nth = 0; nth < descriptor_count(); ++nth) {
+        OfxPlugin* descriptor = descriptor_at(nth);
+        REQUIRE(descriptor != nullptr);
+        const auto inserted = seen.insert(descriptor->pluginIdentifier).second;
+        REQUIRE(inserted);
+    }
+}
+
+// NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
diff --git a/tests/unit/test_ofx_stubs.cpp b/tests/unit/test_ofx_stubs.cpp
index 6447af8..90db127 100644
--- a/tests/unit/test_ofx_stubs.cpp
+++ b/tests/unit/test_ofx_stubs.cpp
@@ -75,6 +75,19 @@ bool ProgressScope::update(double progress) {
     return true;
 }
 
+// Stub for the action dispatcher that ofx_plugin_descriptors.cpp's
+// per-descriptor trampolines forward into. Production defines this in
+// ofx_plugin.cpp; the unit test target does not link ofx_plugin.cpp because
+// the suite-fetch globals there race with the per-test stubs above. Tests
+// that exercise descriptor identity and trampoline wiring assert on the
+// pluginIdentifier string carried inside each OfxPlugin POD; they do not
+// invoke the trampolines, so this returns kOfxStatReplyDefault.
+OfxStatus plugin_main_entry_dispatch(const char* /*plugin_identifier*/, const char* /*action*/,
+                                     const void* /*handle*/, OfxPropertySetHandle /*in_args*/,
+                                     OfxPropertySetHandle /*out_args*/) {
+    return kOfxStatReplyDefault;
+}
+
 }  // namespace corridorkey::ofx
 
 // NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
