#pragma once

#include <string_view>

#include "ofxCore.h"
#include "ofxImageEffect.h"

namespace corridorkey::ofx {

// Green: legacy OFX identifier locked at acceptance of ADR-0006. Saved Resolve
// projects persist this string; renaming it orphans every existing CorridorKey
// node. The label and group strings are also part of the persisted contract on
// hosts that store them with the project.
constexpr const char* kPluginIdentifierGreen = "com.corridorkey.resolve";
constexpr const char* kPluginLabelGreen = "CorridorKey";

// Blue: dedicated-screen identifier locked at acceptance of ADR-0006. Once a
// release ships with this string, saved Resolve projects depend on it; treat
// it as immutable without a superseding ADR.
constexpr const char* kPluginIdentifierBlue = "com.corridorkey.resolve.blue";
constexpr const char* kPluginLabelBlue = "CorridorKey Blue";

constexpr const char* kPluginGroup = "Keying";

int descriptor_count();
OfxPlugin* descriptor_at(int nth);
const char* label_for_identifier(const char* identifier);

// Identity predicate used by per-node behavior (model selection, screen-color
// surface, runtime-family routing). A null identifier is treated as Green so
// legacy code paths that have not yet been threaded with identity behave as
// the legacy single-node plugin did.
inline bool is_blue_node_identifier(const char* identifier) {
    if (identifier == nullptr) {
        return false;
    }
    return identifier == kPluginIdentifierBlue ||
           std::string_view(identifier) == kPluginIdentifierBlue;
}

// Action dispatcher shared by every descriptor's per-trampoline entry point.
// Defined in ofx_plugin.cpp for production builds and stubbed in
// tests/unit/test_ofx_stubs.cpp for the unit target. The first argument is
// the descriptor's persisted plugin identifier — tasks 0009 (model selection)
// and 0010 (runtime isolation) extend this dispatcher to branch by identity
// without re-routing the per-descriptor trampolines.
OfxStatus plugin_main_entry_dispatch(const char* plugin_identifier, const char* action,
                                     const void* handle, OfxPropertySetHandle in_args,
                                     OfxPropertySetHandle out_args);

}  // namespace corridorkey::ofx
