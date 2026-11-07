
#include "app/model_fetch.hpp"

#include <cpr/cpr.h>

#include <atomic>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <mutex>
#include <nlohmann/json.hpp>
#include <optional>
#include <string>
#include <system_error>
#include <vector>

//
// model_fetch.cpp tidy-suppression rationale.
//
// Implements the BMT first-run model pack fetcher: a name+size manifest of
// the windows-rtx profile from scripts/fetch_models.ps1, streamed cpr
// downloads with HTTP Range resume, atomic .part -> final renames, and the
// shared progress monitor that feeds the OFX "Model Pack" row. Not on the
// per-pixel render hot path. The suppression set mirrors app/version_check.cpp
// (same offline-network-helper shape: magic numbers are HTTP status bounds and
// formatting bases; error-prone JSON key access follows contains()/operator[]
// conventions identical to version_check's cache reader).
//
// NOLINTBEGIN(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-ranges,modernize-use-starts-ends-with,modernize-return-braced-init-list,performance-unnecessary-value-param,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
namespace corridorkey::app {

namespace {

constexpr const char* kHfRepo = "alexandrealvaro/CorridorKey";
constexpr const char* kHfRevision = "main";
constexpr const char* kUserAgent = "CorridorKey-ModelFetch/1";
constexpr const char* kStatusJsonName = "model_pack_status.json";
constexpr int kPercentScale = 100;

struct DownloadContext {
    std::ofstream out;
    std::uint64_t resume_bytes = 0;
    std::uint64_t completed_before = 0;
    int total_files = 0;
    std::string filename;
};

struct FetchMonitor {
    std::mutex mutex;
    ModelPackProgress progress;
};

FetchMonitor& monitor() {
    static FetchMonitor instance;
    return instance;
}

std::atomic<bool>& fetch_busy() {
    static std::atomic<bool> busy{false};
    return busy;
}

void monitor_update(const std::function<void(ModelPackProgress&)>& mutate) {
    auto& mon = monitor();
    const std::scoped_lock lock(mon.mutex);
    mutate(mon.progress);
}

std::uint64_t expected_pack_bytes(std::optional<ModelTrack> track = std::nullopt) {
    std::uint64_t total = 0;
    for (const auto& file :
         model_pack_files_for_track(track.value_or(resolve_model_track()))) {
        total += file.size_bytes;
    }
    return total;
}

std::string pack_size_string(std::optional<ModelTrack> track = std::nullopt) {
    // Decimal GB to match how the pack size is quoted in docs and the
    // installer copy (2,615,431,075 bytes -> "2.4 GB").
    constexpr double kBytesPerGb = 1000.0 * 1000.0 * 1000.0;
    char buffer[32];
    const double gb = static_cast<double>(expected_pack_bytes(track)) / kBytesPerGb;
    std::snprintf(buffer, sizeof(buffer), "%.1f GB", gb);
    return buffer;
}

bool download_one_file(const std::filesystem::path& dir, const ModelPackFile& file,
                       const std::string& url, std::string& error) {
    const auto final_path = dir / file.filename;
    const auto part_path = dir / (std::string(file.filename) + ".part");

    std::error_code error_code;
    std::uint64_t resume_bytes = 0;
    if (std::filesystem::exists(part_path, error_code) && !error_code) {
        resume_bytes = std::filesystem::file_size(part_path, error_code);
    }

    std::ofstream out(part_path, std::ios::binary | std::ios::app);
    if (!out.is_open()) {
        error = "Failed to open temp file for write: " + part_path.string();
        return false;
    }

    cpr::Session session;
    session.SetUrl(cpr::Url{url});
    session.SetHeader(cpr::Header{{"User-Agent", kUserAgent}});
    if (resume_bytes > 0 && resume_bytes < file.size_bytes) {
        session.SetRange(cpr::Range{static_cast<std::int64_t>(resume_bytes), std::nullopt});
    } else if (resume_bytes >= file.size_bytes) {
        // Stale oversized .part: restart the transfer from scratch.
        out.close();
        std::filesystem::remove(part_path, error_code);
        resume_bytes = 0;
        out.open(part_path, std::ios::binary | std::ios::app);
        if (!out.is_open()) {
            error = "Failed to open temp file for write: " + part_path.string();
            return false;
        }
    }

    DownloadContext context;
    context.resume_bytes = resume_bytes;
    context.filename = file.filename;

    session.SetWriteCallback(cpr::WriteCallback{
        [](std::string_view data, intptr_t userdata) -> bool {
            auto* stream = reinterpret_cast<std::ofstream*>(userdata);  // NOLINT
            stream->write(data.data(), static_cast<std::streamsize>(data.size()));
            return stream->good();
        },
        reinterpret_cast<intptr_t>(&out)});  // NOLINT

    session.SetProgressCallback(cpr::ProgressCallback{
        [](cpr::cpr_pf_arg_t download_total, cpr::cpr_pf_arg_t download_now,
           cpr::cpr_pf_arg_t /*upload_total*/, cpr::cpr_pf_arg_t /*upload_now*/,
           intptr_t userdata) -> bool {
            auto* ctx = reinterpret_cast<DownloadContext*>(userdata);  // NOLINT
            const std::uint64_t done = ctx->resume_bytes + static_cast<std::uint64_t>(download_now);
            std::uint64_t total = ctx->resume_bytes;
            if (download_total > 0) {
                total += static_cast<std::uint64_t>(download_total);
            }
            const int percent =
                total > 0 ? static_cast<int>(done * kPercentScale / total) : 0;
            monitor_update([&](ModelPackProgress& progress) {
                progress.current_file = ctx->filename;
                progress.percent = percent > kPercentScale ? kPercentScale : percent;
            });
            return true;
        },
        reinterpret_cast<intptr_t>(&context)});  // NOLINT

    const cpr::Response response = session.Get();
    out.close();

    if (response.error) {
        // Keep the .part file: the next ensure_model_pack pass resumes it via
        // Range. Surface the libcurl transport message verbatim.
        error = "Transfer error for " + std::string(file.filename) + ": " + response.error.message;
        return false;
    }

    constexpr int kHttpOk = 200;
    constexpr int kHttpPartialContent = 206;
    if (response.status_code == kHttpOk && resume_bytes > 0) {
        // The CDN ignored the Range header; the appended body would corrupt
        // the file. Drop the .part and let the next attempt start clean.
        std::filesystem::remove(part_path, error_code);
        error = "Range resume rejected for " + std::string(file.filename) +
                "; deleted partial file, retry will start over.";
        return false;
    }
    if (response.status_code != kHttpOk && response.status_code != kHttpPartialContent) {
        error = "HTTP " + std::to_string(response.status_code) + " for " + url;
        return false;
    }

    std::uint64_t downloaded = 0;
    if (!std::filesystem::exists(part_path, error_code) || error_code) {
        error = "Temp file missing after transfer: " + part_path.string();
        return false;
    }
    downloaded = std::filesystem::file_size(part_path, error_code);
    if (downloaded != file.size_bytes) {
        // Truncated transfer: keep the .part for a later Range resume.
        error = "Size mismatch for " + std::string(file.filename) + ": got " +
                std::to_string(downloaded) + " bytes, expected " +
                std::to_string(file.size_bytes);
        return false;
    }

    std::filesystem::remove(final_path, error_code);
    std::filesystem::rename(part_path, final_path, error_code);
    if (error_code) {
        error = "Failed to move " + part_path.string() + " into place: " + error_code.message();
        return false;
    }
    return true;
}

}  // namespace

const std::vector<ModelPackFile>& model_pack_files() {
    // Exact byte sizes of the windows-rtx profile (verified against both the
    // build bundle Resources/models tree and HF Content-Length headers,
    // 2026-11: every entry below returned HTTP 200 with the stated length;
    // torchtrt/fp32/ green paths 404 — upstream publishes no green fp32
    // artifacts, so the fp32 track reuses the fp16 green weights and ships
    // the dedicated blue FP32 model, see app/model_track.hpp).
    static const std::vector<ModelPackFile> files = {
        {"corridorkey_fp16_512.onnx", "onnx/fp16/corridorkey_fp16_512.onnx", 144861873ULL,
         "shared"},
        {"corridorkey_fp16_1024.onnx", "onnx/fp16/corridorkey_fp16_1024.onnx", 155871862ULL,
         "shared"},
        {"corridorkey_fp16_1536.onnx", "onnx/fp16/corridorkey_fp16_1536.onnx", 174222105ULL,
         "shared"},
        {"corridorkey_fp16_2048.onnx", "onnx/fp16/corridorkey_fp16_2048.onnx", 199912223ULL,
         "shared"},
        {"corridorkey_torchtrt_fp16_512.ts", "torchtrt/fp16/corridorkey_torchtrt_fp16_512.ts",
         408190005ULL, "fp16"},
        {"corridorkey_torchtrt_fp16_1024.ts", "torchtrt/fp16/corridorkey_torchtrt_fp16_1024.ts",
         430065683ULL, "fp16"},
        {"corridorkey_torchtrt_fp16_1536.ts", "torchtrt/fp16/corridorkey_torchtrt_fp16_1536.ts",
         501770173ULL, "fp16"},
        {"corridorkey_torchtrt_fp16_2048.ts", "torchtrt/fp16/corridorkey_torchtrt_fp16_2048.ts",
         558427453ULL, "fp16"},
        {"corridorkey_dynamic_blue_fp16.ts", "torchtrt/dynamic-blue/corridorkey_dynamic_blue_fp16.ts",
         145140062ULL, "fp16"},
        // The published blue FP32 artifact (1536 frame size only; upstream
        // notes blue FP16 NaNs in LayerNorm/Softmax at 1536+).
        {"corridorkey_blue_torchtrt_fp32_1536.ts",
         "torchtrt/fp32-blue/corridorkey_blue_torchtrt_fp32_1536.ts", 470207019ULL, "fp32"},
        {"cutie_feature_extractor_fp16.onnx", "hint/cutie_feature_extractor_fp16.onnx",
         17614918ULL, "shared"},
        {"cutie_init_memory_fp16.onnx", "hint/cutie_init_memory_fp16.onnx", 956337ULL, "shared"},
        {"cutie_tracking_memory_fp16.onnx", "hint/cutie_tracking_memory_fp16.onnx", 966516ULL,
         "shared"},
        {"mobilesam_image_encoder_fp16.onnx", "hint/mobilesam_image_encoder_fp16.onnx",
         14347062ULL, "shared"},
        {"mobilesam_prompt_decoder_fp16.onnx", "hint/mobilesam_prompt_decoder_fp16.onnx",
         8224865ULL, "shared"},
    };
    return files;
}

std::vector<ModelPackFile> model_pack_files_for_track(ModelTrack track) {
    const char* wanted = model_track_name(track);
    std::vector<ModelPackFile> selected;
    for (const auto& file : model_pack_files()) {
        if (std::string_view(file.track) != "shared" && std::string_view(file.track) != wanted) {
            continue;
        }
#if !defined(_WIN32)
        // BMT macOS/Linux builds: the torchtrt .ts artifacts require the
        // Windows-only Torch-TensorRT runtime (CORRIDORKEY_HAS_TORCHTRT is
        // FALSE off Windows, see root CMakeLists). The upstream HF tree
        // (api listing 2026-11) publishes no blue ONNX model — blue is
        // .ts-only — so on non-Windows platforms the pack is exactly the
        // shared green fp16 ONNX + hint ONNX set, and any blue work runs
        // through the green model behind the hue picker.
        const std::string_view name = file.filename;
        if (name.size() >= 3 && name.substr(name.size() - 3) == ".ts") {
            continue;
        }
#endif
        selected.push_back(file);
    }
    return selected;
}

std::string model_pack_base_url() {
    return std::string("https://huggingface.co/") + kHfRepo + "/resolve/" + kHfRevision;
}

std::string model_pack_url(const ModelPackFile& file) {
    return model_pack_base_url() + "/" + file.remote_path;
}

bool model_pack_file_present(const std::filesystem::path& dir, const ModelPackFile& file) {
    std::error_code error;
    const auto path = dir / file.filename;
    if (!std::filesystem::exists(path, error) || error) {
        return false;
    }
    return std::filesystem::file_size(path, error) == file.size_bytes && !error;
}

bool model_pack_present(const std::filesystem::path& dir, std::optional<ModelTrack> track) {
    for (const auto& file : model_pack_files_for_track(track.value_or(resolve_model_track()))) {
        if (!model_pack_file_present(dir, file)) {
            return false;
        }
    }
    return true;
}

ModelPackEnsureResult ensure_model_pack(const std::filesystem::path& dir,
                                        const std::string& only_file,
                                        std::optional<ModelTrack> track) {
    ModelPackEnsureResult result;
    std::error_code error;
    std::filesystem::create_directories(dir, error);

    // Full-pack runs follow the active precision track; --only runs fetch any
    // table entry regardless of track (installer smoke tests / manual pulls).
    const ModelTrack active_track = track.value_or(resolve_model_track());
    std::vector<ModelPackFile> selected;
    for (const auto& file : model_pack_files()) {
        const bool track_match = std::string_view(file.track) == "shared" ||
                                 std::string_view(file.track) == model_track_name(active_track);
        if (only_file.empty() ? track_match : only_file == file.filename) {
            selected.push_back(file);
        }
    }
    if (selected.empty()) {
        result.error = "Unknown model file: " + only_file + " (not in the model pack table)";
        return result;
    }

    for (const auto& file : selected) {
        if (model_pack_file_present(dir, file)) {
            ++result.present_files;
        }
    }

    if (!only_file.empty() && result.present_files == 1) {
        result.ok = true;
        return result;
    }
    if (only_file.empty() && model_pack_present(dir, active_track)) {
        monitor_update([&](ModelPackProgress& progress) {
            progress.phase = ModelPackPhase::Ready;
            progress.total_files = static_cast<int>(selected.size());
            progress.completed_files = progress.total_files;
            progress.percent = kPercentScale;
            progress.current_file.clear();
            progress.detail.clear();
            progress.retry_url.clear();
        });
        result.ok = true;
        return result;
    }

    bool expected = false;
    if (!fetch_busy().compare_exchange_strong(expected, true)) {
        // Another thread already owns the fetch for this process; its progress
        // monitor updates carry the UI. Report not-ready without stacking a
        // duplicate downloader.
        result.error = "A model pack fetch is already running in this process.";
        return result;
    }

    monitor_update([&](ModelPackProgress& progress) {
        progress.phase = ModelPackPhase::Downloading;
        progress.completed_files = result.present_files;
        progress.total_files = static_cast<int>(selected.size());
        progress.percent = 0;
        progress.detail.clear();
        progress.retry_url.clear();
    });

    for (const auto& file : selected) {
        if (model_pack_file_present(dir, file)) {
            continue;
        }
        const std::string url = model_pack_url(file);
        std::string download_error;
        if (download_one_file(dir, file, url, download_error)) {
            ++result.downloaded_files;
            monitor_update([](ModelPackProgress& progress) { ++progress.completed_files; });
            continue;
        }
        ++result.failed_files;
        if (result.error.empty()) {
            result.error = std::move(download_error);
            result.failed_url = url;
        }
    }

    const bool complete =
        result.failed_files == 0 &&
        (only_file.empty() ? model_pack_present(dir, active_track)
                           : model_pack_file_present(dir, selected[0]));
    if (complete) {
        if (only_file.empty()) {
            // model_pack_status.json mirrors the packaging-stage status file
            // shape (stage / models_dir / expected / present / missing /
            // counts). Only written for full-pack runs; --only single-file
            // fetches (installer smoke tests) leave it untouched.
            nlohmann::json status;
        status["stage"] = "ofx-first-run-model-fetch";
        status["models_dir"] = dir.string();
        // BMT Build: records the precision track this pack run targeted so
        // later launches and the status panel know which artifact set the
        // dir is certified for.
        status["track"] = model_track_name(active_track);
        nlohmann::json expected_models = nlohmann::json::array();
        nlohmann::json present_models = nlohmann::json::array();
        nlohmann::json missing_models = nlohmann::json::array();
        for (const auto& file : selected) {
            expected_models.push_back(file.filename);
            if (model_pack_file_present(dir, file)) {
                present_models.push_back(file.filename);
            } else {
                missing_models.push_back(file.filename);
            }
        }
        status["expected_models"] = std::move(expected_models);
        status["present_models"] = std::move(present_models);
        status["missing_models"] = std::move(missing_models);
        status["present_count"] = static_cast<int>(present_models.size());
        status["missing_count"] = static_cast<int>(missing_models.size());
        status["missing_models_allowed"] = false;
        status["parity_validated_models"] = nlohmann::json::array();
        status["contract_validated_models"] = std::move(present_models);
        status["generation_failures"] = nlohmann::json::array();
        std::ofstream status_stream(dir / kStatusJsonName, std::ios::binary | std::ios::trunc);
        if (status_stream.is_open()) {
            status_stream << status.dump(4) << "\n";
        }
        }
        if (only_file.empty()) {
            monitor_update([&](ModelPackProgress& progress) {
                progress.phase = ModelPackPhase::Ready;
                progress.completed_files = static_cast<int>(selected.size());
                progress.total_files = progress.completed_files;
                progress.percent = kPercentScale;
                progress.current_file.clear();
                progress.detail.clear();
                progress.retry_url.clear();
            });
        }
        result.ok = true;
    } else {
        monitor_update([&](ModelPackProgress& progress) {
            progress.phase = ModelPackPhase::Failed;
            progress.detail = result.error;
            progress.retry_url = result.failed_url;
        });
    }

    fetch_busy().store(false);
    return result;
}

ModelPackProgress model_pack_progress() {
    auto& mon = monitor();
    const std::scoped_lock lock(mon.mutex);
    return mon.progress;
}

std::string model_pack_status_label(const std::filesystem::path& dir,
                                    std::string_view track_name) {
    // Panel-supplied track name (Model Precision dropdown) participates in
    // the precedence chain; CORRIDORKEY_MODEL_TRACK env still wins.
    const ModelTrack track = resolve_model_track(
        track_name.empty() ? std::nullopt : std::optional<std::string_view>{track_name});
    if (model_pack_present(dir, track)) {
        const int count = static_cast<int>(model_pack_files_for_track(track).size());
        return std::string("Model pack ready [") + model_track_name(track) + "] (" +
               std::to_string(count) + " files, " + pack_size_string(track) + ") — stored in " +
               dir.string();
    }
    const auto progress = model_pack_progress();
    switch (progress.phase) {
        case ModelPackPhase::Downloading:
            return "Downloading model pack (" + std::to_string(progress.completed_files) + "/" +
                   std::to_string(progress.total_files) + "): " + progress.current_file + " — " +
                   std::to_string(progress.percent) + "%";
        case ModelPackPhase::Failed:
            return "Model pack download failed: " + progress.detail +
                   " — manual retry: " + progress.retry_url;
        case ModelPackPhase::Ready:
            // Present check above missed: a file changed underneath us; show
            // progress state anyway rather than lying about readiness.
            break;
        case ModelPackPhase::Idle:
        default:
            break;
    }
    return "Model pack not installed yet — download starting…";
}

}  // namespace corridorkey::app

// NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-ranges,modernize-use-starts-ends-with,modernize-return-braced-init-list,performance-unnecessary-value-param,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
