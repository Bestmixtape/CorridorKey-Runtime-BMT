
#include "app/model_fetch.hpp"

#include "app/ck2_files.gen.hpp"  // kCk2PackFiles / kCk2PackFileCount / kCk2PackTotalBytes

#include <cpr/cpr.h>

#include <atomic>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <algorithm>
#include <functional>
#include <mutex>
#include <nlohmann/json.hpp>
#include <optional>
#include <string>
#include <system_error>
#include <vector>

#ifdef __APPLE__
// BMT v0.4 mac port: POSIX process spawning for the worker-env pip steps
// (run_python_step below). macOS <unistd.h> declares `environ` under
// _DARWIN_C_SOURCE (default), matching host_plugin_runtime_client.cpp's
// posix_spawn(..., environ) usage.
#include <cerrno>
#include <cstdlib>  // std::getenv for relocated_worker_python_dir
#include <fcntl.h>    // O_WRONLY | O_CREAT | O_APPEND for the log fds
#include <spawn.h>    // posix_spawn / posix_spawn_file_actions_*
#include <sys/wait.h>  // waitpid / WIFEXITED / WEXITSTATUS
#include <unistd.h>   // STDOUT_FILENO / STDERR_FILENO
extern char **environ;  // CI-proven: macOS <unistd.h> does NOT declare this
                        // for C++; mirror host_plugin_runtime_client.cpp's
                        // explicit extern instead.
#endif
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
    // BMT v0.2 first-run overlay: bytes of the other pack files already
    // complete on disk when this file starts (multi-file resume state), so
    // the progress callback can report whole-pack bytes, not just this file.
    std::uint64_t pack_base_bytes = 0;
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
    // BMT: seed the pack-level byte base (files other than this one that are
    // already at their exact expected size on disk).
    for (const auto& other : model_pack_files()) {
        if (other.filename == file.filename) {
            continue;
        }
        if (model_pack_file_present(dir, other)) {
            context.pack_base_bytes += other.size_bytes;
        }
    }

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
                // BMT v0.2: whole-pack bytes for the preview overlay bar.
                std::uint64_t pack_done = ctx->pack_base_bytes + done;
                if (progress.bytes_total > 0 && pack_done > progress.bytes_total) {
                    pack_done = progress.bytes_total;
                }
                progress.bytes_done = pack_done;
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
        // BMT macOS: MLX weights + fixed-resolution callable bridges. The
        // bridge set was regenerated ("mlx-repack" CI) with mlx==0.32.4 to
        // match the runtime pin — MLX's export format is version-fragile and
        // the original 0.31-era HF files fail import in 0.32.x. Sizes below
        // must equal the republished mlx/*_bridge_*.mlxfn bytes exactly.
        // Track tag "mlx": fetched on Apple platforms only, outside the
        // precision tracks (see model_pack_files_for_track).
        {"corridorkey_mlx.safetensors", "mlx/corridorkey_mlx.safetensors",
         398849072ULL, "mlx"},
        {"corridorkey_mlx_bridge_512.mlxfn", "mlx/corridorkey_mlx_bridge_512.mlxfn",
         288923661ULL, "mlx"},
        {"corridorkey_mlx_bridge_768.mlxfn", "mlx/corridorkey_mlx_bridge_768.mlxfn",
         298098701ULL, "mlx"},
        {"corridorkey_mlx_bridge_1024.mlxfn", "mlx/corridorkey_mlx_bridge_1024.mlxfn",
         310943757ULL, "mlx"},
        {"corridorkey_mlx_bridge_1536.mlxfn", "mlx/corridorkey_mlx_bridge_1536.mlxfn",
         347643917ULL, "mlx"},
        {"corridorkey_mlx_bridge_2048.mlxfn", "mlx/corridorkey_mlx_bridge_2048.mlxfn",
         399024141ULL, "mlx"},
    };
    return files;
}

std::vector<ModelPackFile> model_pack_files_for_track(ModelTrack track) {
    const char* wanted = model_track_name(track);
    std::vector<ModelPackFile> selected;
    for (const auto& file : model_pack_files()) {
#if defined(__APPLE__)
        // BMT macOS: MLX safetensors + resolution bridges replace the ONNX
        // main models and bypass the precision tracks (runtime_contracts
        // registers corridorkey_mlx.safetensors + the per-resolution
        // corridorkey_mlx_bridge_<res>.mlxfn set under CORRIDORKEY_WITH_MLX).
        // Hint models stay ONNX fp16 — they run through ONNX Runtime's
        // CoreML EP — and the fp16 corridorkey ONNX graphs are skipped so
        // the first-run download is exactly the MLX set + hints.
        if (std::string_view(file.track) == "mlx") {
            selected.push_back(file);
            continue;
        }
        if (std::string_view(file.filename).rfind("corridorkey_fp16_", 0) == 0) {
            continue;
        }
#endif
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

// BMT: the repacked MLX callable bridges (exported by CI with mlx==0.32.4,
// see .github/workflows/mlx-repack.yml) are hosted as GitHub release assets
// on this repo — the upstream HF mlx/ tree still carries 0.31-era exports,
// which MLX 0.32.x refuses to import ("[import_function] Invalid string
// size", ml-explore/mlx#4637). Only .mlxfn artifacts redirect; everything
// else (weights, ONNX, hints) still downloads from HF.
std::string model_pack_url(const ModelPackFile& file) {
    const std::string_view remote = file.remote_path;
    constexpr std::string_view suffix = ".mlxfn";
    if (remote.size() >= suffix.size() && remote.compare(remote.size() - suffix.size(),
                                                         suffix.size(), suffix) == 0) {
        const auto slash = remote.find_last_of('/');
        return std::string("https://github.com/Bestmixtape/CorridorKey2.0-OFX-BMT/"
                           "releases/download/mlx-bridges-v1/") +
               std::string(remote.substr(slash == std::string_view::npos ? 0 : slash + 1));
    }
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

ModelPackEnsureResult ensure_model_pack_impl(const std::filesystem::path& dir,
                                             const std::string& only_file,
                                             const std::vector<ModelPackFile>& selected_in,
                                             const char* status_track,
                                             const char* status_stage = "ofx-first-run-model-fetch") {
    ModelPackEnsureResult result;
    std::error_code error;
    std::filesystem::create_directories(dir, error);

    // BMT: full-pack selection arrives precomputed by the public wrappers —
    // model_pack_files_for_track carries the platform rules (no .ts off
    // Windows, MLX set on Apple); union mode dedupes shared entries once.
    std::vector<ModelPackFile> selected = selected_in;
    if (!only_file.empty()) {
        selected.clear();
        for (const auto& file : model_pack_files()) {
            if (only_file == file.filename) {
                selected.push_back(file);
            }
        }
    }
    if (selected.empty()) {
        result.error = "Unknown model file: " + only_file + " (not in the model pack table)";
        return result;
    }

    std::uint64_t present_bytes = 0;
    for (const auto& file : selected) {
        if (model_pack_file_present(dir, file)) {
            ++result.present_files;
            present_bytes += file.size_bytes;
        }
    }

    if (!only_file.empty() && result.present_files == 1) {
        result.ok = true;
        return result;
    }
    if (only_file.empty() && std::all_of(selected.begin(), selected.end(),
                                 [&](const ModelPackFile& file) { return model_pack_file_present(dir, file); })) {
        const std::uint64_t pack_bytes = [&] {
            std::uint64_t t = 0;
            for (const auto& f : selected) t += f.size_bytes;
            return t;
        }();
        monitor_update([&](ModelPackProgress& progress) {
            progress.phase = ModelPackPhase::Ready;
            progress.total_files = static_cast<int>(selected.size());
            progress.completed_files = progress.total_files;
            progress.percent = kPercentScale;
            progress.bytes_total = pack_bytes;
            progress.bytes_done = pack_bytes;
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
        // BMT v0.2: whole-pack sizing for the preview overlay progress bar.
        progress.bytes_total = [&] { std::uint64_t t = 0; for (const auto& f : selected) t += f.size_bytes; return t; }();
        progress.bytes_done = present_bytes;
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
            monitor_update([&file](ModelPackProgress& progress) {
                ++progress.completed_files;
                progress.bytes_done += file.size_bytes;
                if (progress.bytes_total > 0 && progress.bytes_done > progress.bytes_total) {
                    progress.bytes_done = progress.bytes_total;
                }
            });
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
        (only_file.empty() ? std::all_of(selected.begin(), selected.end(),
                                     [&](const ModelPackFile& file) { return model_pack_file_present(dir, file); })
                       : model_pack_file_present(dir, selected[0]));
    if (complete) {
        if (only_file.empty()) {
                    // model_pack_status.json mirrors the packaging-stage status file
                    // shape (stage / models_dir / expected / present / missing /
                    // counts). Only written for full-pack runs; --only single-file
                    // fetches (installer smoke tests) leave it untouched.
                    nlohmann::json status;
                status["stage"] = status_stage;
        status["models_dir"] = dir.string();
        // BMT Build: records the precision track this pack run targeted so
        // later launches and the status panel know which artifact set the
        // dir is certified for.
        status["track"] = status_track;
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
        int present_count = static_cast<int>(present_models.size());
        int missing_count = static_cast<int>(missing_models.size());
        status["present_models"] = present_models;  // copy; present_models valid for move below
        status["missing_models"] = std::move(missing_models);
        status["present_count"] = present_count;
        status["missing_count"] = missing_count;
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
                progress.bytes_total = [&] { std::uint64_t t = 0; for (const auto& f : selected) t += f.size_bytes; return t; }();
                progress.bytes_done = progress.bytes_total;
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


// NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-ranges,modernize-use-starts-ends-with,modernize-return-braced-init-list,performance-unnecessary-value-param,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
// BMT v0.3: single-track path keeps the resolve_model_track() default of old.
ModelPackEnsureResult ensure_model_pack(const std::filesystem::path& dir,
                                        const std::string& only_file,
                                        std::optional<ModelTrack> track,
                                        const char* stage) {
    const ModelTrack active_track = track.value_or(resolve_model_track());
    // --only runs fetch any table entry regardless of track (installer smoke
    // tests / manual pulls); full-pack follows the track's platform set.
    std::vector<ModelPackFile> selected;
    if (only_file.empty()) {
        selected = model_pack_files_for_track(active_track);
    } else {
        for (const auto& file : model_pack_files()) {
            if (only_file == file.filename) {
                selected.push_back(file);
            }
        }
    }
    return ensure_model_pack_impl(dir, only_file, selected,
                                  model_track_name(active_track), stage);
}

// BMT v0.3 installer mode: deduped union of the given tracks (shared hint
// models counted once), one single-pass download covering the full pack.
ModelPackEnsureResult ensure_model_pack_tracks(
    const std::filesystem::path& dir, const std::vector<ModelTrack>& tracks,
    const char* stage) {
    std::vector<ModelPackFile> selected;
    for (const auto& track : tracks) {
        for (const auto& file : model_pack_files_for_track(track)) {
            bool seen = false;
            for (const auto& existing : selected) {
                if (std::string(existing.filename) == std::string(file.filename)) {
                    seen = true;
                    break;
                }
            }
            if (!seen) {
                selected.push_back(file);
            }
        }
    }
    return ensure_model_pack_impl(dir, {}, selected, "both", stage);
}

// ---------------------------------------------------------------------------
// BMT v0.4: CorridorKey 2.0 worker stack (see model_fetch.hpp banner).
// NOLINTBEGIN(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-ranges,modernize-use-starts-ends-with,modernize-return-braced-init-list,performance-unnecessary-value-param,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)

const std::vector<Ck2PackFile>& ck2_pack_files() {
    // Generated from a validated local mirror of the official tree
    // (scripts/packaging/generate_ck2_table.py): relpath, revision-pinned
    // upstream URL, exact size. Do not edit by hand.
    static const std::vector<Ck2PackFile> files = [] {
        std::vector<Ck2PackFile> v;
        v.reserve(kCk2PackFileCount);
        for (const auto& f : kCk2PackFiles) {
            v.push_back(f);
        }
        return v;
    }();
    return files;
}

namespace {

bool ck2_file_present_at(const std::filesystem::path& root, const Ck2PackFile& file) {
    std::error_code error;
    // relpath uses forward slashes; filesystem::path accepts them on Windows.
    const auto path = root / file.relpath;
    if (!std::filesystem::exists(path, error) || error) {
        return false;
    }
    return std::filesystem::file_size(path, error) == file.size_bytes && !error;
}

// Same streaming/Range-resume discipline as download_one_file, but the
// destination may live in subdirectories (weights/, vfms/...).
bool ck2_download_one_file(const std::filesystem::path& root,
                           const Ck2PackFile& file,
                           std::string& error) {
    std::error_code ec;
    const auto final_path = root / file.relpath;
    std::filesystem::create_directories(final_path.parent_path(), ec);
    if (ec) {
        error = "Cannot create directory for " + std::string(file.relpath) + ": " + ec.message();
        return false;
    }
    const auto part_path = final_path.string() + ".part";
    const std::uint64_t resume_bytes =
        std::filesystem::exists(part_path, ec) && !ec
            ? static_cast<std::uint64_t>(std::filesystem::file_size(part_path, ec))
            : 0ULL;

    cpr::Session session;
    session.SetUrl(cpr::Url{file.url});
    session.SetHeader(cpr::Header{{"User-Agent", kUserAgent}});
    session.SetVerifySsl(cpr::VerifySsl{false});
    session.SetTimeout(std::chrono::milliseconds(30000));
    if (resume_bytes > 0) {
        session.SetHeader(cpr::Header{{"Range", "bytes=" + std::to_string(resume_bytes) + "-"}});
    }

    // Byte accounting for the shared progress monitor: other files already
    // complete on disk count toward bytes_done, matching v0.3 multi-file
    // resume semantics.
    std::uint64_t pack_base_bytes = 0;
    int total_files = 0;
    for (const auto& other : ck2_pack_files()) {
        ++total_files;
        if (other.relpath == file.relpath) {
            continue;
        }
        if (ck2_file_present_at(root, other)) {
            pack_base_bytes += other.size_bytes;
        }
    }

    DownloadContext ctx;
    ctx.total_files = total_files;
    ctx.pack_base_bytes = pack_base_bytes;
    ctx.filename = file.relpath;
    const std::string part_str = part_path;
    ctx.out.open(part_str, std::ios::binary | (resume_bytes > 0 ? std::ios::app : std::ios::trunc));
    if (!ctx.out.is_open()) {
        error = "Cannot open " + part_str + " for writing";
        return false;
    }
    ctx.resume_bytes = resume_bytes;
    monitor_update([&](ModelPackProgress& progress) {
        progress.current_file = file.relpath;
        progress.percent = 0;
    });
    // Same cpr streaming shape as download_one_file: a WriteCallback feeding
    // the .part file plus a ProgressCallback feeding the shared monitor
    // (whole-pack bytes, v0.3 resume semantics).
    session.SetWriteCallback(cpr::WriteCallback{
        [](std::string_view data, intptr_t userdata) -> bool {
            auto* dl = reinterpret_cast<DownloadContext*>(userdata);  // NOLINT
            dl->out.write(data.data(), static_cast<std::streamsize>(data.size()));
            if (!dl->out.good()) {
                return false;
            }
            const std::uint64_t written =
                dl->resume_bytes + static_cast<std::uint64_t>(dl->out.tellp());
            monitor_update([&](ModelPackProgress& progress) {
                const std::uint64_t done = dl->pack_base_bytes + written;
                if (progress.bytes_total > 0 && done > progress.bytes_total) {
                    progress.bytes_done = progress.bytes_total;
                }
                else {
                    progress.bytes_done = done;
                }
                if (progress.bytes_total > 0) {
                    progress.percent =
                        static_cast<int>(done * kPercentScale / progress.bytes_total);
                }
            });
            return true;
        },
        reinterpret_cast<intptr_t>(&ctx)});  // NOLINT
    const auto response = session.Get();
    ctx.out.close();

    constexpr int kHttpOk = 200;
    constexpr int kHttpPartialContent = 206;
    if (response.status_code == kHttpOk && resume_bytes > 0) {
        std::filesystem::remove(part_path, ec);
        error = "Range resume rejected for " + std::string(file.relpath) +
                "; deleted partial file, retry will start over.";
        return false;
    }
    if (response.status_code != kHttpOk && response.status_code != kHttpPartialContent) {
        error = "HTTP " + std::to_string(response.status_code) + " for " + file.url;
        return false;
    }
    if (!std::filesystem::exists(part_path, ec) || ec) {
        error = "Temp file missing after transfer: " + part_str;
        return false;
    }
    const std::uint64_t downloaded = std::filesystem::file_size(part_path, ec);
    if (downloaded != file.size_bytes) {
        error = "Size mismatch for " + std::string(file.relpath) + ": got " +
                std::to_string(downloaded) + " bytes, expected " +
                std::to_string(file.size_bytes);
        return false;
    }
    std::filesystem::remove(final_path, ec);
    std::filesystem::rename(part_path, final_path, ec);
    if (ec) {
        error = "Failed to move " + part_str + " into place: " + ec.message();
        return false;
    }
    return true;
}

#ifdef _WIN32
std::filesystem::path worker_env_marker(const std::filesystem::path& python_dir) {
    return python_dir / "Lib" / "site-packages" / "bmt_worker_env.json";
}

// Run one bundled-Python command to a log file; returns exit code, -1 on
// spawn failure.
int run_python_step(const std::filesystem::path& python_exe,
                    const std::wstring& args,
                    const std::filesystem::path& log_path,
                    std::string& spawn_error,
                    const std::filesystem::path& working_dir = {}) {
    std::wstring cmd = L"\"" + python_exe.native() + L"\" " + args;
    std::error_code ec;
    const std::wstring log_str = log_path.native();
    // Append: run_python_step is called for every pip step and each truncation
    // previously hid the real pip failure behind the last step's output.
    HANDLE log_handle = CreateFileW(log_str.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr,
                                    OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (log_handle == INVALID_HANDLE_VALUE) {
        spawn_error = "Cannot open log file " + log_path.string();
        return -1;
    }
    SetFilePointer(log_handle, 0, nullptr, FILE_END);
    SECURITY_ATTRIBUTES sa{};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;
    // Duplicate with inheritance for the child's std handles.
    HANDLE inherit_handle = nullptr;
    if (!DuplicateHandle(GetCurrentProcess(), log_handle, GetCurrentProcess(), &inherit_handle, 0,
                         TRUE, DUPLICATE_SAME_ACCESS)) {
        inherit_handle = log_handle;
    }
    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdOutput = inherit_handle;
    si.hStdError = inherit_handle;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    PROCESS_INFORMATION pi{};
    std::wstring cmd_mut = cmd;
    const BOOL spawned = CreateProcessW(nullptr, cmd_mut.data(), nullptr, nullptr, TRUE,
                                        CREATE_NO_WINDOW, nullptr,
                                        working_dir.empty() ? nullptr : working_dir.native().c_str(),
                                        &si, &pi);
    CloseHandle(inherit_handle);
    CloseHandle(log_handle);
    if (!spawned) {
        spawn_error = "CreateProcess failed spawning Python worker (see " +
                      log_path.string() + ")";
        return -1;
    }
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD exit_code = 1;
    GetExitCodeProcess(pi.hProcess, &exit_code);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return static_cast<int>(exit_code);
}
#endif  // _WIN32

#ifdef __APPLE__
// BMT v0.4 mac port: marker lives in the POSIX multiarch site-packages of
// the standalone CPython bundle (the 3.12 pin matches the python-builds.org
// artifact staged by scripts/packaging; Windows' embedded layout has no
// version component under Lib\site-packages).
std::filesystem::path worker_env_marker(const std::filesystem::path& python_dir) {
    return python_dir / "lib" / "python3.12" / "site-packages" / "bmt_worker_env.json";
}

// BMT v0.4 mac port: POSIX twin of run_python_step above — argv array goes
// straight into posix_spawn (no CreateProcessW command-line quoting), and
// stdout+stderr are O_APPEND-opened onto the same worker_env_pip.log via
// spawn file actions, so the append-across-steps discipline (each truncation
// would hide the real pip failure behind the last step's output) holds.
// working_dir uses posix_spawn_file_actions_addchdir_np (macOS 10.15+;
// deployment target is 14.0). Returns exit code, -1 on spawn failure.
int run_python_step(const std::filesystem::path& python_exe,
                    const std::vector<std::string>& args,
                    const std::filesystem::path& log_path,
                    std::string& spawn_error,
                    const std::filesystem::path& working_dir = {}) {
    std::vector<std::string> arg_storage;
    arg_storage.reserve(args.size() + 2);
    arg_storage.push_back(python_exe.string());
    for (const auto& arg : args) {
        arg_storage.push_back(arg);
    }
    std::vector<char*> argv;
    argv.reserve(arg_storage.size() + 1);
    for (auto& value : arg_storage) {
        argv.push_back(value.data());
    }
    argv.push_back(nullptr);

    posix_spawn_file_actions_t actions;
    if (posix_spawn_file_actions_init(&actions) != 0) {
        spawn_error = "Cannot init spawn file actions for " + log_path.string();
        return -1;
    }
    bool actions_ok = true;
    actions_ok = actions_ok && posix_spawn_file_actions_addopen(&actions, STDOUT_FILENO,
                                                                log_path.c_str(),
                                                                O_WRONLY | O_CREAT | O_APPEND,
                                                                0644) == 0;
    actions_ok = actions_ok && posix_spawn_file_actions_addopen(&actions, STDERR_FILENO,
                                                                log_path.c_str(),
                                                                O_WRONLY | O_CREAT | O_APPEND,
                                                                0644) == 0;
    if (!working_dir.empty()) {
        actions_ok = actions_ok &&
                     posix_spawn_file_actions_addchdir_np(&actions, working_dir.c_str()) == 0;
    }
    int exit_code = -1;
    if (!actions_ok) {
        spawn_error = "Cannot configure spawn file actions for " + log_path.string();
    } else {
        pid_t pid = -1;
        const int spawn_rc =
            posix_spawn(&pid, python_exe.c_str(), &actions, nullptr, argv.data(), environ);
        if (spawn_rc == 0) {
            // status sentinel -1: WIFEXITED(-1) is false, so a waitpid error
            // (non-EINTR) surfaces as -1 instead of a bogus exit 0.
            int status = -1;
            while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {
            }
            exit_code = WIFEXITED(status) ? WEXITSTATUS(status) : -1;
        } else {
            spawn_error = "posix_spawn failed spawning Python worker (see " +
                          log_path.string() + ")";
        }
    }
    posix_spawn_file_actions_destroy(&actions);
    return exit_code;
}
#endif  // __APPLE__
}  // namespace

bool ck2_models_present(const std::filesystem::path& worker_root) {
    for (const auto& file : ck2_pack_files()) {
        if (!ck2_file_present_at(worker_root, file)) {
            return false;
        }
    }
    return true;
}

std::filesystem::path relocated_worker_python_dir() {
#ifdef _WIN32
    wchar_t buf[4096];
    const DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", buf, 4095);
    if (n == 0 || n > 4095) {
        return {};
    }
    return std::filesystem::path(buf) / L"CorridorKey2.0-BMT" / L"python";
#elif defined(__APPLE__)
    // BMT v0.4 mac port: the .bundle under /Library/OFX-Plugins is
    // root-owned, so the relocated interpreter lives under the user's
    // Application Support (POSIX twin of %LOCALAPPDATA%\CorridorKey2.0-BMT).
    const char* home = std::getenv("HOME");
    if (home == nullptr || home[0] == '\0') {
        return {};
    }
    return std::filesystem::path(home) / "Library" / "Application Support" /
           "CorridorKey2.0-BMT" / "python";
#else
    return {};
#endif
}

bool worker_env_ready(const std::filesystem::path& python_dir) {
#ifdef _WIN32
    if (python_dir.empty()) {
        return false;
    }
    std::error_code ec;
    return std::filesystem::exists(worker_env_marker(python_dir), ec) && !ec;
#elif defined(__APPLE__)
    // BMT v0.4 mac port: same marker check as Windows; the APPLE
    // worker_env_marker above resolves the POSIX site-packages path.
    if (python_dir.empty()) {
        return false;
    }
    std::error_code ec;
    return std::filesystem::exists(worker_env_marker(python_dir), ec) && !ec;
#else
    (void)python_dir;
    return false;
#endif
}

WorkerStackEnsureResult ensure_worker_stack(const std::filesystem::path& worker_root,
                                            const std::filesystem::path& python_dir,
                                            const char* stage) {
    WorkerStackEnsureResult result;
#ifdef _WIN32
    std::error_code ec;
    std::filesystem::create_directories(worker_root, ec);

    const auto& selected = ck2_pack_files();
    std::uint64_t present_bytes = 0;
    for (const auto& file : selected) {
        if (ck2_file_present_at(worker_root, file)) {
            ++result.present_files;
            present_bytes += file.size_bytes;
        }
    }
    const bool models_complete = result.present_files == static_cast<int>(selected.size());

    if (!models_complete) {
        bool expected = false;
        if (!fetch_busy().compare_exchange_strong(expected, true)) {
            result.error = "A download is already running in this process.";
            return result;
        }
        monitor_update([&](ModelPackProgress& progress) {
            progress.phase = ModelPackPhase::Downloading;
            progress.completed_files = result.present_files;
            progress.total_files = static_cast<int>(selected.size());
            progress.percent = 0;
            progress.bytes_total = kCk2PackTotalBytes;
            progress.bytes_done = present_bytes;
            progress.detail.clear();
            progress.retry_url.clear();
        });
        for (const auto& file : selected) {
            if (ck2_file_present_at(worker_root, file)) {
                continue;
            }
            std::string download_error;
            if (ck2_download_one_file(worker_root, file, download_error)) {
                ++result.downloaded_files;
                monitor_update([&file](ModelPackProgress& progress) {
                    ++progress.completed_files;
                    progress.bytes_done += file.size_bytes;
                    if (progress.bytes_done > progress.bytes_total) {
                        progress.bytes_done = progress.bytes_total;
                    }
                });
                continue;
            }
            ++result.failed_files;
            if (result.error.empty()) {
                result.error = std::move(download_error);
                result.failed_url = file.url;
            }
        }
        fetch_busy().store(false);
        if (result.failed_files != 0 ||
            !ck2_models_present(worker_root)) {
            monitor_update([&](ModelPackProgress& progress) {
                progress.phase = ModelPackPhase::Failed;
                progress.detail = result.error;
                progress.retry_url = result.failed_url;
            });
            return result;
        }
        // ck2_models_status.json: same shape discipline as the v0.3 status
        // file — counts captured before any move.
        nlohmann::json status;
        status["stage"] = stage;
        status["models_dir"] = worker_root.string();
        nlohmann::json present_models = nlohmann::json::array();
        for (const auto& file : selected) {
            present_models.push_back(file.relpath);
        }
        status["expected_count"] = static_cast<int>(selected.size());
        status["present_count"] = static_cast<int>(present_models.size());
        status["missing_count"] = 0;
        status["expected_models"] = present_models;
        status["present_models"] = std::move(present_models);
        std::ofstream status_stream(worker_root / "ck2_models_status.json",
                                    std::ios::binary | std::ios::trunc);
        if (status_stream.is_open()) {
            status_stream << status.dump(4) << "\n";
        }
    }

    if (python_dir.empty()) {
        result.ok = true;
        return result;
    }
    if (worker_env_ready(python_dir)) {
        result.pip_ok = true;
        result.ok = true;
        return result;
    }

    std::filesystem::path py = python_dir;
    auto python_exe = py / "python.exe";
    if (!std::filesystem::exists(python_exe, ec) || ec) {
        result.pip_error = "Bundled python missing: " + python_exe.string();
        return result;
    }
    // BMT v0.4: a complete relocated %LOCALAPPDATA% env outranks a writable
    // but empty bundle env — the OFX runtime client prefers the relocated
    // dir, and re-pipping ~3 GB of torch into Program Files while the
    // relocated env is already ready is pure waste (observed on a dev
    // machine during an elevated Setup run: minutes of silent pip that
    // looked exactly like a hung installer).
    if (!result.pip_ok) {
        const auto rel = relocated_worker_python_dir();
        if (!rel.empty() && worker_env_ready(rel)) {
            py = rel;
            std::ofstream append_skip_log(worker_root / "worker_env_pip.log",
                                          std::ios::binary | std::ios::app);
            append_skip_log << "relocated worker env already ready; skipping pip setup\n";
            result.pip_ok = true;
        }
    }
    {
        // The bundle lives in admin-owned Program Files, where pip cannot
        // write without elevation. Probe the site-packages dir; if the
        // interpreter is not writable, relocate it — plus the small
        // worker-src payload — to %LOCALAPPDATA%\CorridorKey2.0-BMT\python,
        // which keeps the runtime's <python_dir>/../worker/bmt_worker.py
        // resolution intact and survives plugin re-installs.
        std::error_code probe_ec;
        const auto probe_dir = py / "Lib" / "site-packages";
        std::filesystem::create_directories(probe_dir, probe_ec);
        const auto probe_file = probe_dir / ".write-probe";
        std::ofstream probe(probe_file, std::ios::binary);
        if (!probe.is_open()) {
            const auto target = relocated_worker_python_dir();
            if (target.empty() || target == py) {
                result.pip_error = "Bundled python not writable and no LOCALAPPDATA target: " +
                                   py.string();
                return result;
            }
            std::filesystem::copy(py, target, std::filesystem::copy_options::recursive |
                                                 std::filesystem::copy_options::skip_existing,
                                  probe_ec);
            if (probe_ec) {
                result.pip_error = "Failed to relocate python env to " + target.string() +
                                   ": " + probe_ec.message();
                return result;
            }
            std::error_code worker_ec;
            std::filesystem::copy(py.parent_path() / "worker",
                                  target.parent_path() / "worker",
                                  std::filesystem::copy_options::recursive |
                                      std::filesystem::copy_options::skip_existing,
                                  worker_ec);
            py = target;
            python_exe = py / "python.exe";
        } else {
            probe.close();
            std::filesystem::remove(probe_file, probe_ec);
        }
    }
    if (worker_env_ready(py)) {
        result.pip_ok = true;
        result.ok = true;
        return result;
    }
    const auto site_packages = py / "Lib" / "site-packages";
    std::filesystem::create_directories(site_packages, ec);
    const auto log_path = worker_root / "worker_env_pip.log";

    monitor_update([&](ModelPackProgress& progress) {
        progress.phase = ModelPackPhase::Downloading;
        progress.current_file = "python-runtime-setup";
        progress.detail = "installing Python runtime (torch cu128, one-time)";
    });

    // 1. get-pip bootstrap (embedded Python ships without pip).
    if (!std::filesystem::exists(site_packages / "pip" / "__init__.py", ec) || ec) {
        const auto get_pip = worker_root / "get-pip.py";
        cpr::Session session;
        session.SetUrl(cpr::Url{"https://bootstrap.pypa.io/get-pip.py"});
        session.SetHeader(cpr::Header{{"User-Agent", kUserAgent}});
        const auto get_pip_response = session.Get();
        if (get_pip_response.error || get_pip_response.status_code != 200) {
            result.pip_error = "HTTP " + std::to_string(get_pip_response.status_code) +
                               " fetching get-pip.py";
            return result;
        }
        std::ofstream pip_stream(get_pip, std::ios::binary);
        pip_stream << get_pip_response.text;
        if (!pip_stream.good()) {
            result.pip_error = "Cannot write get-pip.py";
            return result;
        }
        pip_stream.close();
        std::string spawn_error;
        const int rc = run_python_step(python_exe,
                                       L"-s \"" + get_pip.native() + L"\" --no-warn-script-location",
                                       log_path, spawn_error);
        if (rc != 0) {
            result.pip_error = spawn_error.empty()
                                   ? "get-pip.py failed (see worker_env_pip.log)"
                                   : std::move(spawn_error);
            return result;
        }
    }

    // 2a. Pre-install build tooling into the embedded interpreter. Embeddable
    //     CPython's ._pth mechanism silently breaks pip's venv build isolation
    //     (build deps "install" but cannot be imported), so source-built
    //     requirements (utils3d @ git+...) need setuptools available directly
    //     and a --no-build-isolation install below.
    {
        std::ofstream append_marker(log_path, std::ios::binary | std::ios::app);
    }
    std::string setup_spawn_error;
    const int setup_rc = run_python_step(
        python_exe,
        L"-s -m pip install --disable-pip-version-check --no-input "
        L"--no-warn-script-location --no-cache-dir setuptools wheel",
        log_path, setup_spawn_error);
    if (setup_rc != 0) {
        result.pip_error = setup_spawn_error.empty()
                               ? "setuptools bootstrap failed (see worker_env_pip.log)"
                               : std::move(setup_spawn_error);
        return result;
    }

    // 2b. Install the pinned requirements + the corridorkey wheel from the
    //     bundle. torch cu128 comes from the PyTorch index; the rest resolves
    //     through the PyPI extra index.
    const auto worker_bundle = py.parent_path() / "worker";
    const auto requirements = worker_bundle / "requirements-win.txt";
    const auto wheel = worker_bundle / "corridorkey_bmt.whl";
    if (!std::filesystem::exists(requirements, ec) || ec) {
        result.pip_error = "Bundled requirements missing: " + requirements.string();
        return result;
    }
    std::wstring args = L"-s -m pip install --disable-pip-version-check --no-input "
                        L"--no-warn-script-location --no-build-isolation "
                        L"--index-url https://download.pytorch.org/whl/cu128 "
                        L"--extra-index-url https://pypi.org/simple -r \"" +
                        requirements.native() + L"\"";
    if (std::filesystem::exists(wheel, ec) && !ec) {
        args += L" \"" + wheel.native() + L"\"";
    }
    std::string spawn_error;
    {
        // pip writes its own log line; append instead of truncate.
        std::ofstream append_marker(log_path, std::ios::binary | std::ios::app);
    }
    const int pip_rc = run_python_step(python_exe, args, log_path, spawn_error);
    if (pip_rc != 0) {
        result.pip_error = spawn_error.empty()
                               ? "pip install failed with exit " + std::to_string(pip_rc) +
                                     " (see worker_env_pip.log)"
                               : std::move(spawn_error);
        return result;
    }

    // 3. Verification gate: the exact import surface bmt_worker.py needs.
    //    The corridorkey package is not a wheel — it lives in the bundle's
    //    worker/ directory next to bmt_worker.py, exactly how the OFX host
    //    puts it on sys.path, so verify with that directory as the CWD.
    {
        std::ofstream append_marker(log_path, std::ios::binary | std::ios::app);
    }
    std::wstring verify_code = L"-s -c \"import sys; sys.path.insert(0, r'";
    verify_code += worker_bundle.native();
    verify_code += L"'); import torch, torchvision, corridorkey; "
                   L"print(torch.__version__, torch.cuda.is_available())\"";
    const int verify_rc = run_python_step(
        python_exe,
        verify_code,
        log_path, spawn_error, worker_bundle);
    if (verify_rc != 0) {
        result.pip_error = "worker-env verification import failed (see worker_env_pip.log)";
        return result;
    }
    {
        nlohmann::json marker;
        marker["ok"] = true;
        marker["requirements"] = requirements.string();
        std::ofstream marker_stream(worker_env_marker(py),
                                    std::ios::binary | std::ios::trunc);
        if (marker_stream.is_open()) {
            marker_stream << marker.dump(2) << "\n";
        }
    }
    result.pip_ok = true;
    result.ok = true;
    monitor_update([&](ModelPackProgress& progress) {
        progress.phase = ModelPackPhase::Ready;
        progress.percent = kPercentScale;
        progress.current_file.clear();
        progress.detail.clear();
    });
    return result;
#elif defined(__APPLE__)
    // BMT v0.4 mac port: same shape as the Windows path above — fetch the
    // ck2 model pack, then pip-install the worker env into the bundled
    // Python when the marker is absent. Deliberate differences: the
    // standalone CPython bundle ships WITH pip and a regular sys.path (no
    // embedded-Python ._pth quirks), so the get-pip and setuptools/wheel
    // bootstrap steps are skipped; requirements-mac.txt replaces
    // requirements-win.txt; torch resolves from the default PyPI index (the
    // PyPI wheel is the MPS build — no download.pytorch.org cu128 index-url
    // on macOS); and the verification gate checks torch.backends.mps.
    std::error_code ec;
    std::filesystem::create_directories(worker_root, ec);

    const auto& selected = ck2_pack_files();
    std::uint64_t present_bytes = 0;
    for (const auto& file : selected) {
        if (ck2_file_present_at(worker_root, file)) {
            ++result.present_files;
            present_bytes += file.size_bytes;
        }
    }
    const bool models_complete = result.present_files == static_cast<int>(selected.size());

    if (!models_complete) {
        bool expected = false;
        if (!fetch_busy().compare_exchange_strong(expected, true)) {
            result.error = "A download is already running in this process.";
            return result;
        }
        monitor_update([&](ModelPackProgress& progress) {
            progress.phase = ModelPackPhase::Downloading;
            progress.completed_files = result.present_files;
            progress.total_files = static_cast<int>(selected.size());
            progress.percent = 0;
            progress.bytes_total = kCk2PackTotalBytes;
            progress.bytes_done = present_bytes;
            progress.detail.clear();
            progress.retry_url.clear();
        });
        for (const auto& file : selected) {
            if (ck2_file_present_at(worker_root, file)) {
                continue;
            }
            std::string download_error;
            if (ck2_download_one_file(worker_root, file, download_error)) {
                ++result.downloaded_files;
                monitor_update([&file](ModelPackProgress& progress) {
                    ++progress.completed_files;
                    progress.bytes_done += file.size_bytes;
                    if (progress.bytes_done > progress.bytes_total) {
                        progress.bytes_done = progress.bytes_total;
                    }
                });
                continue;
            }
            ++result.failed_files;
            if (result.error.empty()) {
                result.error = std::move(download_error);
                result.failed_url = file.url;
            }
        }
        fetch_busy().store(false);
        if (result.failed_files != 0 ||
            !ck2_models_present(worker_root)) {
            monitor_update([&](ModelPackProgress& progress) {
                progress.phase = ModelPackPhase::Failed;
                progress.detail = result.error;
                progress.retry_url = result.failed_url;
            });
            return result;
        }
        // ck2_models_status.json: same shape discipline as the Windows path
        // — counts captured before any move.
        nlohmann::json status;
        status["stage"] = stage;
        status["models_dir"] = worker_root.string();
        nlohmann::json present_models = nlohmann::json::array();
        for (const auto& file : selected) {
            present_models.push_back(file.relpath);
        }
        status["expected_count"] = static_cast<int>(selected.size());
        status["present_count"] = static_cast<int>(present_models.size());
        status["missing_count"] = 0;
        status["expected_models"] = present_models;
        status["present_models"] = std::move(present_models);
        std::ofstream status_stream(worker_root / "ck2_models_status.json",
                                    std::ios::binary | std::ios::trunc);
        if (status_stream.is_open()) {
            status_stream << status.dump(4) << "\n";
        }
    }

    if (python_dir.empty()) {
        result.ok = true;
        return result;
    }
    if (worker_env_ready(python_dir)) {
        result.pip_ok = true;
        result.ok = true;
        return result;
    }

    std::filesystem::path py = python_dir;
    auto python_exe = py / "bin" / "python3";
    if (!std::filesystem::exists(python_exe, ec) || ec) {
        result.pip_error = "Bundled python missing: " + python_exe.string();
        return result;
    }
    {
        // BMT v0.4 mac port: the bundle lives under the root-owned
        // /Library/OFX-Plugins tree, where pip cannot write without
        // elevation. Probe the POSIX site-packages dir; if the interpreter
        // is not writable, relocate it — plus the small worker-src payload
        // — to ~/Library/Application Support/CorridorKey2.0-BMT/python,
        // which keeps the runtime's <python_dir>/../worker/bmt_worker.py
        // resolution intact and survives plugin re-installs.
        std::error_code probe_ec;
        const auto probe_dir = py / "lib" / "python3.12" / "site-packages";
        std::filesystem::create_directories(probe_dir, probe_ec);
        const auto probe_file = probe_dir / ".write-probe";
        std::ofstream probe(probe_file, std::ios::binary);
        if (!probe.is_open()) {
            const auto target = relocated_worker_python_dir();
            if (target.empty() || target == py) {
                result.pip_error = "Bundled python not writable and no HOME target: " +
                                   py.string();
                return result;
            }
            std::filesystem::copy(py, target, std::filesystem::copy_options::recursive |
                                                 std::filesystem::copy_options::skip_existing,
                                  probe_ec);
            if (probe_ec) {
                result.pip_error = "Failed to relocate python env to " + target.string() +
                                   ": " + probe_ec.message();
                return result;
            }
            std::error_code worker_ec;
            std::filesystem::copy(py.parent_path() / "worker",
                                  target.parent_path() / "worker",
                                  std::filesystem::copy_options::recursive |
                                      std::filesystem::copy_options::skip_existing,
                                  worker_ec);
            py = target;
            python_exe = py / "bin" / "python3";
        } else {
            probe.close();
            std::filesystem::remove(probe_file, probe_ec);
        }
    }
    if (worker_env_ready(py)) {
        result.pip_ok = true;
        result.ok = true;
        return result;
    }
    const auto site_packages = py / "lib" / "python3.12" / "site-packages";
    std::filesystem::create_directories(site_packages, ec);
    const auto log_path = worker_root / "worker_env_pip.log";

    monitor_update([&](ModelPackProgress& progress) {
        progress.phase = ModelPackPhase::Downloading;
        progress.current_file = "python-runtime-setup";
        progress.detail = "installing Python runtime (torch MPS, one-time)";
    });

    // 1. No get-pip / setuptools bootstrap on macOS: the standalone CPython
    //    bundle already ships a working pip, pip's venv build isolation
    //    works normally without the embedded ._pth mechanism, and PyPI
    //    wheels cover any source-build needs (requirements-mac.txt pins).

    // 2. Install the pinned requirements + the corridorkey wheel from the
    //    bundle through the default PyPI index — on macOS the PyPI torch
    //    wheel is the MPS build, so no PyTorch cu128 index-url.
    const auto worker_bundle = py.parent_path() / "worker";
    const auto requirements = worker_bundle / "requirements-mac.txt";
    const auto wheel = worker_bundle / "corridorkey_bmt.whl";
    if (!std::filesystem::exists(requirements, ec) || ec) {
        result.pip_error = "Bundled requirements missing: " + requirements.string();
        return result;
    }
    std::vector<std::string> pip_args = {
        "-s",
        "-m", "pip", "install",
        "--disable-pip-version-check", "--no-input",
        "--no-warn-script-location", "--no-cache-dir",
        "-r", requirements.string(),
    };
    if (std::filesystem::exists(wheel, ec) && !ec) {
        pip_args.push_back(wheel.string());
    }
    std::string spawn_error;
    const int pip_rc = run_python_step(python_exe, pip_args, log_path, spawn_error);
    if (pip_rc != 0) {
        result.pip_error = spawn_error.empty()
                               ? "pip install failed with exit " + std::to_string(pip_rc) +
                                     " (see worker_env_pip.log)"
                               : std::move(spawn_error);
        return result;
    }

    // 3. Verification gate: the exact import surface bmt_worker.py needs.
    //    The corridorkey package is not a wheel — it lives in the bundle's
    //    worker/ directory next to bmt_worker.py, exactly how the OFX host
    //    puts it on sys.path, so verify with that directory prepended to
    //    sys.path and as the CWD (mirrors the Windows gate).
    //    torch.cuda.is_available() is not valid on macOS: probe MPS.
    const std::string verify_code =
        "import sys; sys.path.insert(0, r'" + worker_bundle.string() +
        "'); import torch, torchvision, corridorkey; "
        "print(torch.__version__, torch.backends.mps.is_available())";
    const int verify_rc = run_python_step(python_exe, {"-s", "-c", verify_code},
                                          log_path, spawn_error, worker_bundle);
    if (verify_rc != 0) {
        result.pip_error = "worker-env verification import failed (see worker_env_pip.log)";
        return result;
    }
    {
        nlohmann::json marker;
        marker["ok"] = true;
        marker["requirements"] = requirements.string();
        std::ofstream marker_stream(worker_env_marker(py),
                                    std::ios::binary | std::ios::trunc);
        if (marker_stream.is_open()) {
            marker_stream << marker.dump(2) << "\n";
        }
    }
    result.pip_ok = true;
    result.ok = true;
    monitor_update([&](ModelPackProgress& progress) {
        progress.phase = ModelPackPhase::Ready;
        progress.percent = kPercentScale;
        progress.current_file.clear();
        progress.detail.clear();
    });
    return result;
#else
    result.error = "The CorridorKey 2.0 worker stack is Windows-only in v0.4.";
    return result;
#endif  // _WIN32
}

std::string worker_stack_status_label(const std::filesystem::path& worker_root,
                                      const std::filesystem::path& python_dir) {
    const bool models = ck2_models_present(worker_root);
    const bool env = worker_env_ready(python_dir);
    if (models && env) {
        return "CorridorKey 2.0 runtime ready (" +
               std::to_string(ck2_pack_files().size()) + " model files, 5.1 GB) — stored in " +
               worker_root.string();
    }
    const auto progress = model_pack_progress();
    if (progress.phase == ModelPackPhase::Downloading) {
        if (!progress.detail.empty()) {
            return "CorridorKey 2.0 runtime: " + progress.detail;
        }
        return "Downloading CorridorKey 2.0 models (" +
               std::to_string(progress.completed_files) + "/" +
               std::to_string(progress.total_files) + "): " + progress.current_file + " — " +
               std::to_string(progress.percent) + "%";
    }
    if (progress.phase == ModelPackPhase::Failed) {
        return "CorridorKey 2.0 runtime setup failed: " + progress.detail +
               " — manual retry: " + progress.retry_url;
    }
    if (!models) {
        return "CorridorKey 2.0 models not installed yet — download starting…";
    }
    return "CorridorKey 2.0 Python runtime not installed yet — setup starting…";
}

// NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-ranges,modernize-use-starts-ends-with,modernize-return-braced-init-list,performance-unnecessary-value-param,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)

}  // namespace corridorkey::app
