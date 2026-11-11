#pragma once

#include <corridorkey/api_export.hpp>

#include "model_track.hpp"

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace corridorkey::app {

//
// Header tidy-suppression rationale.
//
// Declares the BMT first-run model pack fetcher (see model_fetch.cpp for the
// behavioral notes). Included transitively by the OFX plugin TU and the CLI,
// so its diagnostics surface in every consumer once HeaderFilterRegex is
// scoped to the project tree. The suppressed categories below mirror the
// neighbouring app/ headers (version_check.hpp); this header's enums and
// aggregate structs feed UI label formatting where magic-number formatting
// bases and simple value semantics are intentional.
//
// NOLINTBEGIN(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,cppcoreguidelines-pro-bounds-constant-array-index,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,cppcoreguidelines-pro-type-member-init,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-missing-std-forward,cppcoreguidelines-macro-usage,cppcoreguidelines-macro-to-enum,modernize-macro-to-enum,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-misleading-indentation,cert-dcl50-cpp,readability-isolate-declaration,readability-use-std-min-max,readability-named-parameter,cppcoreguidelines-avoid-non-const-global-variables,modernize-use-integer-sign-comparison,modernize-use-using,cppcoreguidelines-pro-type-cstyle-cast,cert-env33-c,bugprone-misplaced-widening-cast,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,performance-unnecessary-copy-initialization,cert-err34-c,modernize-avoid-variadic-functions)

// One entry of the windows-rtx model pack. Mirrors scripts/fetch_models.ps1:
// filename is the local name under the models dir, remote_path is the key
// under the Hugging Face repo, size_bytes is the exact expected artifact
// size (pack validity is name + size, matching doctor's contract probes).
struct ModelPackFile {
    const char* filename;
    const char* remote_path;
    std::uint64_t size_bytes;
    // BMT Build: track tag. "shared" ships on every precision track;
    // "fp16"/"fp32" mark track-specific artifacts (see app/model_track.hpp).
    const char* track = "shared";
};

// Every table entry across all tracks.
CORRIDORKEY_API const std::vector<ModelPackFile>& model_pack_files();

// Entries for one precision track: shared files plus the track-tagged ones.
CORRIDORKEY_API std::vector<ModelPackFile> model_pack_files_for_track(ModelTrack track);

CORRIDORKEY_API std::string model_pack_base_url();

CORRIDORKEY_API std::string model_pack_url(const ModelPackFile& file);

// True when dir/<filename> exists with exactly file.size_bytes bytes.
CORRIDORKEY_API bool model_pack_file_present(const std::filesystem::path& dir,
                                             const ModelPackFile& file);

// True when every table entry for the track is present with the expected
// size; nullopt track resolves through the env/default precedence chain.
CORRIDORKEY_API bool model_pack_present(const std::filesystem::path& dir,
                                        std::optional<ModelTrack> track = std::nullopt);

struct ModelPackEnsureResult {
    bool ok = false;
    int present_files = 0;
    int downloaded_files = 0;
    int failed_files = 0;
    std::string error;       // first failure detail
    std::string failed_url;  // manual retry URL for the failed file
};

// Verifies (and where needed downloads) the model pack into dir. Files land
// as <name>.part streamed with HTTP Range resume, verified by size, then
// moved into place. only_file restricts the run to one table entry (installer
// / smoke-test hook); empty means the full pack. On full-pack success a
// model_pack_status.json summary is written next to the artifacts.
CORRIDORKEY_API ModelPackEnsureResult ensure_model_pack(const std::filesystem::path& dir,
                                                       const std::string& only_file = {},
                                                       std::optional<ModelTrack> track = {},
                                                       const char* stage = "model-pack-fetch");

// BMT v0.3 installer mode: fetch the deduped union of the given tracks in a
// single pass (shared hint models counted once), so one progress bar covers
// the complete model pack.
CORRIDORKEY_API ModelPackEnsureResult ensure_model_pack_tracks(
    const std::filesystem::path& dir, const std::vector<ModelTrack>& tracks,
    const char* stage = "model-pack-fetch");

enum class ModelPackPhase : std::uint8_t { Idle, Downloading, Ready, Failed };

// Atomic progress snapshot shared between the fetch thread (spawned by the
// OFX layer or the CLI) and any UI reader.
struct ModelPackProgress {
    ModelPackPhase phase = ModelPackPhase::Idle;
    int completed_files = 0;
    int total_files = 0;
    std::string current_file;
    int percent = 0;
    std::string detail;     // error text while Failed
    std::string retry_url;  // manual retry URL while Failed
    // BMT v0.2 first-run overlay: whole-pack byte accounting. bytes_total
    // is the full size of the active track's pack (sum of table
    // size_bytes); bytes_done accumulates across the multi-file resume
    // sequence rather than tracking only the file in flight.
    std::uint64_t bytes_done = 0;
    std::uint64_t bytes_total = 0;
};

CORRIDORKEY_API ModelPackProgress model_pack_progress();

// Human-readable one-liner for the OFX "Model Pack" panel row:
// downloading -> "Downloading model pack (3/13): <file> - 42%",
// complete   -> "Model pack ready (13 files, 2.4 GB) - stored in <dir>",
// failure    -> "Model pack download failed: <error> - manual retry: <url>".
CORRIDORKEY_API std::string model_pack_status_label(const std::filesystem::path& dir,
                                                    std::string_view track_name = {});

}  // namespace corridorkey::app

// NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,cppcoreguidelines-pro-bounds-constant-array-index,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,cppcoreguidelines-pro-type-member-init,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-missing-std-forward,cppcoreguidelines-macro-usage,cppcoreguidelines-macro-to-enum,modernize-macro-to-enum,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-misleading-indentation,cert-dcl50-cpp,readability-isolate-declaration,readability-use-std-min-max,readability-named-parameter,cppcoreguidelines-avoid-non-const-global-variables,modernize-use-integer-sign-comparison,modernize-use-using,cppcoreguidelines-pro-type-cstyle-cast,cert-env33-c,bugprone-misplaced-widening-cast,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,performance-unnecessary-copy-initialization,cert-err34-c,modernize-avoid-variadic-functions)
