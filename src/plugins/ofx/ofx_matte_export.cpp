// BMT Build: "Export Matte (PNG sequence)" push-button feature.
//
// Why this design (OFX-spec + this-codebase constraints):
//   * OFX clip/image getters (clipGetImage) are host-locked: legal only
//     inside host-driven actions on the calling context the host expects.
//     The repo already keeps every image fetch inside the Render action
//     (ofx_render.cpp fetch_image at kOfxPropTime), and the model-fetch
//     background worker deliberately touches *no* OFX image suites. A
//     plugin-spawned worker therefore cannot iterate a clip's frames.
//   * So the button (kOfxActionInstanceChanged, main thread) only arms a
//     one-shot request; the next Render — the host re-renders the current
//     displayed frame because the button param changed — taps the final
//     alpha plane and writes the PNG via frame_io/matte_png.cpp (libpng,
//     16-bit grayscale). The result string is surfaced on the Output
//     group's status row through the existing runtime_panel_dirty flush,
//     mirroring the model-pack progress reporting path.
//   * File naming: <stem>_%04lld.png with 0-based clip-relative index,
//     e.g. clip_0000.png, clip_0001.png, clip_0002.png for a 3-frame clip.
//     stem = user-chosen base name (dialog filename minus .png extension;
//     empty -> 'clip').
#include "ofx_matte_export.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <mutex>
#include <set>
#include <string>
#include <vector>

#include "common/runtime_paths.hpp"
#include "frame_io/matte_png.hpp"
#include "ofx_image_utils.hpp"
#include "ofx_logging.hpp"
#include "ofx_shared.hpp"

// Platform-specific save dialog declarations.
#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#define WIN32_LEAN_AND_MEAN
#include <shobjidl.h>
#include <windows.h>
#elif defined(__APPLE__)
// Declared in ofx_matte_save_panel.mm
extern "C" bool bmt_matte_native_save_panel(const char* default_name_utf8,
                                            char* out_path_utf8,
                                            int out_capacity);
#endif

// NOLINTBEGIN(readability-function-cognitive-complexity,cppcoreguidelines-avoid-magic-numbers,readability-magic-numbers,readability-identifier-naming,modernize-use-integer-sign-comparison,cert-err33-c,cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-implicit-bool-conversion)
namespace corridorkey::ofx {
namespace {

// Keep only characters that are safe in Windows filenames; everything else
// (spaces, slashes, Resolve's timeline name punctuation) collapses to '-'.
std::string sanitize_clip_name(const std::string& raw) {
    std::string out;
    out.reserve(raw.size());
    for (char ch : raw) {
        const unsigned char uch = static_cast<unsigned char>(ch);
        if (std::isalnum(uch) || ch == '_' || ch == '-') {
            out.push_back(ch);
        } else if (ch == ' ') {
            out.push_back('-');
        }
    }
    // Collapse runs of '-' and trim edges for readability.
    std::string tidy;
    tidy.reserve(out.size());
    for (std::size_t i = 0; i < out.size(); ++i) {
        if (out[i] == '-' && (tidy.empty() || tidy.back() == '-')) {
            continue;
        }
        tidy.push_back(out[i]);
    }
    while (!tidy.empty() && tidy.back() == '-') {
        tidy.pop_back();
    }
    if (tidy.empty()) {
        return "clip";
    }
    if (tidy.size() > 64) {
        tidy.resize(64);
    }
    return tidy;
}

void set_matte_status(InstanceData* data, const std::string& line) {
    {
        std::lock_guard<std::mutex> lock(data->matte_export_mutex);
        data->matte_status_line = line;
    }
    data->runtime_panel_dirty = true;
}

// %USERPROFILE%\Documents\CorridorKey2.0-BMT\matte (per the feature spec;
// falls back to %LOCALAPPDATA% when USERPROFILE is unset, same helper the
// models root uses). Used by the legacy single-frame path (state 1) and
// as the default fallback on non-Windows/macOS platforms.
std::filesystem::path matte_export_dir() {
    std::string root;
    if (auto profile = common::environment_variable_copy("USERPROFILE"); profile.has_value()) {
        root = *profile;
    } else if (auto local = common::environment_variable_copy("LOCALAPPDATA");
               local.has_value()) {
        root = *local;
    } else {
        root = ".";
    }
    return std::filesystem::path(root) / "Documents" / "CorridorKey2.0-BMT" / "matte";
}

// Windows: native IFileSaveDialog.
#if defined(_WIN32)
// Wide -> UTF-8 conversion (inverse of wide_to_utf8 in host_plugin_runtime_server_main.cpp).
// Defined BEFORE the dialog helper: same anonymous namespace as the call site.
std::string wide_string_to_utf8_string(const std::wstring& wide) {
    if (wide.empty()) {
        return std::string{};
    }
    const int size = ::WideCharToMultiByte(CP_UTF8, 0, wide.data(),
                                           static_cast<int>(wide.size()),
                                           nullptr, 0, nullptr, nullptr);
    if (size <= 0) {
        return std::string{};
    }
    std::string utf8(static_cast<std::size_t>(size), '\0');
    const int written = ::WideCharToMultiByte(CP_UTF8, 0, wide.data(),
                                              static_cast<int>(wide.size()),
                                              utf8.data(), size,
                                              nullptr, nullptr);
    if (written != size) {
        return std::string{};
    }
    return utf8;
}

bool show_windows_save_dialog(const std::string& default_name_utf8,
                              std::string& out_path_utf8) {
    // CoInitializeEx: host may have already initialized; RPC_E_CHANGED_MODE
    // is fine, we just ignore the result.
    ::CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);

    IFileSaveDialog* dialog = nullptr;
    HRESULT hr = ::CoCreateInstance(CLSID_FileSaveDialog, nullptr,
                                    CLSCTX_INPROC_SERVER,
                                    IID_PPV_ARGS(&dialog));
    if (FAILED(hr) || dialog == nullptr) {
        return false;
    }

    DWORD options = 0;
    dialog->GetOptions(&options);
    dialog->SetOptions(options | FOS_FORCEFILESYSTEM | FOS_OVERWRITEPROMPT);

    // Default extension ".png".
    dialog->SetDefaultExtension(L"png");

    // Title.
    dialog->SetTitle(L"Export Matte Sequence");

    // Default file name (sanitized clip name).
    std::wstring default_name_wide;
    default_name_wide.assign(default_name_utf8.begin(), default_name_utf8.end());
    dialog->SetFileName(default_name_wide.c_str());

    hr = dialog->Show(nullptr);
    if (SUCCEEDED(hr)) {
        IShellItem* item = nullptr;
        hr = dialog->GetResult(&item);
        if (SUCCEEDED(hr) && item != nullptr) {
            PWSTR psz_path = nullptr;
            hr = item->GetDisplayName(SIGDN_FILESYSPATH, &psz_path);
            if (SUCCEEDED(hr) && psz_path != nullptr) {
                std::wstring wide_path(psz_path);
                ::CoTaskMemFree(psz_path);
                out_path_utf8 = wide_string_to_utf8_string(wide_path);
                item->Release();
                dialog->Release();
                return true;
            }
            item->Release();
        }
    }
    dialog->Release();
    return false;
}

#endif  // _WIN32

// Read clip frame range (seconds) and frame rate from clip properties.
// Returns true on success, fills out expected_frames (>=1).
bool read_clip_extent(InstanceData* data, long long& out_expected_frames) {
    if (data == nullptr || data->source_clip == nullptr ||
        g_suites.image_effect == nullptr || g_suites.property == nullptr) {
        return false;
    }

    OfxPropertySetHandle clip_props = nullptr;
    if (g_suites.image_effect->clipGetPropertySet(data->source_clip,
                                                  &clip_props) != kOfxStatOK ||
        clip_props == nullptr) {
        return false;
    }

    double frame_range[2] = {0.0, 0.0};
    // Prefer the VISIBLE trimmed range (what the user sees in the timeline);
    // OfxImageClipPropFrameRange covers the whole source media, which would
    // over-count when the clip is a trim of a longer source.
    if (g_suites.property->propGetDoubleN(clip_props,
                                          "OfxImageClipPropClipRange",
                                          2, frame_range) != kOfxStatOK &&
        g_suites.property->propGetDoubleN(clip_props,
                                          "OfxImageClipPropFrameRange",
                                          2, frame_range) != kOfxStatOK) {
        return false;
    }

    double frame_rate_pair[2] = {24.0, 1.0};
    g_suites.property->propGetDoubleN(clip_props,
                                      kOfxImageEffectPropFrameRate,
                                      2, frame_rate_pair);

    const double fps = (frame_rate_pair[1] > 0.0)
                           ? frame_rate_pair[0] / frame_rate_pair[1]
                           : 24.0;
    const double duration_sec = frame_range[1] - frame_range[0];
    if (duration_sec <= 0.0 || fps <= 0.0) {
        return false;
    }

    // Number of frames = round(duration * fps) + 1 (inclusive endpoints).
    // This matches OFX's frame range convention where both endpoints are
    // frame indices. For example, 0..2 seconds at 24 fps = 49 frames (0..48).
    out_expected_frames =
        static_cast<long long>(std::llround(duration_sec * fps)) + 1;
    return out_expected_frames >= 1;
}

}  // namespace

void handle_matte_export_request(InstanceData* data) {
    if (data == nullptr) {
        return;
    }

    // Re-entrancy guard: a click while a request is still queued (state 1)
    // or streaming (state 3) is ignored; completed/idle states re-arm normally.
    int current_state = data->matte_export_state.load();
    if (current_state == 1 || current_state == 3) {
        set_matte_status(data,
                         "Matte export still in progress — waiting for renders.");
        log_message("matte_export", "ignored: request already queued/streaming");
        return;
    }

    // 1) Get sanitized clip name for dialog default.
    std::string clip_name = "clip";
    if (data->source_clip != nullptr && g_suites.image_effect != nullptr) {
        OfxPropertySetHandle clip_props = nullptr;
        if (g_suites.image_effect->clipGetPropertySet(data->source_clip,
                                                      &clip_props) == kOfxStatOK &&
            clip_props != nullptr) {
            std::string raw_name;
            if (get_string(clip_props, kOfxPropName, raw_name) &&
                !raw_name.empty()) {
                clip_name = sanitize_clip_name(raw_name);
            }
        }
    }

    // 2) Show native save dialog (main thread, instanceChanged context).
    std::string chosen_path_utf8;
    bool dialog_ok = false;

#if defined(_WIN32)
    dialog_ok = show_windows_save_dialog(clip_name + ".png", chosen_path_utf8);
#elif defined(__APPLE__)
    char out_path[4096] = {0};
    dialog_ok = bmt_matte_native_save_panel((clip_name + ".png").c_str(),
                                            out_path, sizeof(out_path));
    if (dialog_ok) {
        chosen_path_utf8 = out_path;
    }
#else
    // Other platforms: no dialog, accept defaults silently.
    // Fall back to the hardcoded directory with the sanitized clip name.
    chosen_path_utf8 =
        (matte_export_dir() / (clip_name + ".png")).string();
    dialog_ok = true;
#endif

    if (!dialog_ok) {
        // User cancelled.
        set_matte_status(data, "Matte export cancelled.");
        log_message("matte_export", "cancelled by user");
        return;
    }

    // 3) Parse chosen path into directory + stem (filename without .png).
    std::filesystem::path chosen_path(chosen_path_utf8);
    std::filesystem::path export_dir = chosen_path.parent_path();
    std::string stem = chosen_path.stem().string();
    if (stem.empty()) {
        stem = "clip";
    }

    // 4) Read clip extent to compute expected frame count.
    long long expected_frames = 0;
    if (!read_clip_extent(data, expected_frames)) {
        set_matte_status(data,
                         "Matte export: could not read clip extent.");
        log_message("matte_export", "abort: could not read clip extent");
        return;
    }

    // 5) Arm streaming sequence state (3).
    {
        std::lock_guard<std::mutex> lock(data->matte_export_mutex);
        data->matte_export_dir = std::move(export_dir);
        data->matte_export_stem = std::move(stem);
        data->matte_expected_frames = expected_frames;
        data->matte_written_frames.clear();
        data->matte_clip_name = clip_name;  // keep for legacy status lines
    }
    data->matte_export_state.store(3);

    set_matte_status(data,
                     "Matte sequence armed: " +
                         std::to_string(expected_frames) + " frames -> " +
                         data->matte_export_dir.string());
    log_message("matte_export",
                "sequence armed: dir=" + data->matte_export_dir.string() +
                    ", stem=" + data->matte_export_stem +
                    ", frames=" + std::to_string(expected_frames));
}

void maybe_export_matte_png(InstanceData* data, const Image& alpha, double time,
                            OfxPropertySetHandle source_props) {
    if (data == nullptr) {
        return;
    }

    int state = data->matte_export_state.load();
    if (state != 1 && state != 3) {
        return;  // idle (0) or completed (2)
    }

    // Legacy single-frame path (state 1): consume immediately.
    if (state == 1) {
        data->matte_export_state.store(2);

        std::string clip_name;
        {
            std::lock_guard<std::mutex> lock(data->matte_export_mutex);
            clip_name = data->matte_clip_name.empty() ? "clip"
                                                      : data->matte_clip_name;
        }

        // Frame number for the filename: (clip-relative frameFrom + render time)
        // * fps. Resolve's clip-coordinate time starts at 0 for the clip's first
        // frame, so frameFrom is typically 0 and N is the clip-relative index.
        double frame_from = 0.0;
        double frame_rate_pair[2] = {24.0, 1.0};
        if (source_props != nullptr && g_suites.property != nullptr) {
            get_double(source_props, "OfxImageEffectPropFrameFrom", frame_from);
            g_suites.property->propGetDoubleN(source_props,
                                              kOfxImageEffectPropFrameRate, 2,
                                              frame_rate_pair);
        }
        const double fps = (frame_rate_pair[1] > 0.0)
                               ? frame_rate_pair[0] / frame_rate_pair[1]
                               : 24.0;
        const long long frame_number =
            static_cast<long long>(std::llround((frame_from + time) * fps));

        const std::filesystem::path out_path =
            matte_export_dir() / (clip_name + "-frame" +
                                  std::to_string(frame_number) + ".png");

        // The final alpha plane is linear float in [0,1]; clamp and quantize to
        // 16-bit unsigned for a bit_depth=16 GRAY PNG (lossless, Resolve reads
        // it back as a 16-bit grey clip).
        const int width = alpha.width;
        const int height = alpha.height;
        std::vector<uint16_t> gray(static_cast<std::size_t>(width) *
                                   static_cast<std::size_t>(height));
        const std::size_t pixel_count =
            std::min(gray.size(), alpha.data.size());
        for (std::size_t i = 0; i < pixel_count; ++i) {
            const float clamped = std::clamp(alpha.data[i], 0.0F, 1.0F);
            gray[i] = static_cast<uint16_t>(std::lround(clamped * 65535.0F));
        }

        if (auto written = write_matte_png_16(out_path, width, height,
                                              gray.data(),
                                              static_cast<std::size_t>(width));
            !written.has_value()) {
            const std::string message =
                written.error().message.empty() ? "unknown error"
                                                : written.error().message;
            set_matte_status(data, "Matte export FAILED: " + message);
            log_message("matte_export", "write failed: " + message);
            return;
        }

        set_matte_status(data, "Matte written: " + out_path.string());
        log_message("matte_export", "wrote " + out_path.string());
        return;
    }

    // Streaming sequence path (state 3).
    std::filesystem::path export_dir;
    std::string export_stem;
    long long expected_frames = 0;
    long long frame_number = 0;

    // Compute clip-relative frame index N from render time.
    double frame_from = 0.0;
    double frame_rate_pair[2] = {24.0, 1.0};
    if (source_props != nullptr && g_suites.property != nullptr) {
        get_double(source_props, "OfxImageEffectPropFrameFrom", frame_from);
        g_suites.property->propGetDoubleN(source_props,
                                          kOfxImageEffectPropFrameRate, 2,
                                          frame_rate_pair);
    }
    const double fps = (frame_rate_pair[1] > 0.0)
                           ? frame_rate_pair[0] / frame_rate_pair[1]
                           : 24.0;
    frame_number =
        static_cast<long long>(std::llround((frame_from + time) * fps));

    // Snapshot sequence config under mutex.
    {
        std::lock_guard<std::mutex> lock(data->matte_export_mutex);
        export_dir = data->matte_export_dir;
        export_stem = data->matte_export_stem;
        expected_frames = data->matte_expected_frames;

        // Bounds check.
        if (frame_number < 0 || frame_number >= expected_frames) {
            return;  // Frame outside clip extent; ignore silently.
        }

        // Skip if already written.
        if (!data->matte_written_frames.insert(frame_number).second) {
            return;  // Already written this frame.
        }
    }

    // Build output path: <stem>_%04lld.png (zero-padded 4-digit, but grows if
    // frame index exceeds 9999).
    char frame_suffix[32];
    std::snprintf(frame_suffix, sizeof(frame_suffix), "_%04lld.png",
                  frame_number);
    const std::filesystem::path out_path =
        export_dir / (export_stem + frame_suffix);

    // Quantize and write (same PNG code path).
    const int width = alpha.width;
    const int height = alpha.height;
    std::vector<uint16_t> gray(static_cast<std::size_t>(width) *
                               static_cast<std::size_t>(height));
    const std::size_t pixel_count =
        std::min(gray.size(), alpha.data.size());
    for (std::size_t i = 0; i < pixel_count; ++i) {
        const float clamped = std::clamp(alpha.data[i], 0.0F, 1.0F);
        gray[i] = static_cast<uint16_t>(std::lround(clamped * 65535.0F));
    }

    if (auto written = write_matte_png_16(out_path, width, height,
                                          gray.data(),
                                          static_cast<std::size_t>(width));
        !written.has_value()) {
        const std::string message =
            written.error().message.empty() ? "unknown error"
                                            : written.error().message;
        set_matte_status(data, "Matte export FAILED: " + message);
        log_message("matte_export", "write failed: " + message);
        // Don't revert state; let user stop manually or continue.
        return;
    }

    // Update written count and status.
    long long written_count = 0;
    bool sequence_complete = false;
    {
        std::lock_guard<std::mutex> lock(data->matte_export_mutex);
        written_count = static_cast<long long>(data->matte_written_frames.size());
        if (written_count >= expected_frames) {
            sequence_complete = true;
            data->matte_export_state.store(2);
        }
    }

    if (sequence_complete) {
        set_matte_status(data,
                         "Matte sequence complete: " +
                             std::to_string(written_count) + " files in " +
                             export_dir.string());
        log_message("matte_export",
                    "sequence complete: " + std::to_string(written_count) +
                        " files in " + export_dir.string());
    } else {
        // Cheap intermediate status update.
        set_matte_status(data,
                         "Matte sequence: " + std::to_string(written_count) +
                             " / " + std::to_string(expected_frames));
    }
}

// Handle user pressing the button again while streaming (state 3): stop and finalize.
void handle_matte_export_stop(InstanceData* data) {
    if (data == nullptr) {
        return;
    }
    int state = data->matte_export_state.load();
    if (state != 3) {
        return;  // Only stoppable when streaming.
    }

    long long written_count = 0;
    long long expected_frames = 0;
    std::filesystem::path export_dir;
    {
        std::lock_guard<std::mutex> lock(data->matte_export_mutex);
        written_count = static_cast<long long>(data->matte_written_frames.size());
        expected_frames = data->matte_expected_frames;
        export_dir = data->matte_export_dir;
        data->matte_export_state.store(2);
    }

    set_matte_status(data,
                     "Matte sequence stopped: " + std::to_string(written_count) +
                         " of " + std::to_string(expected_frames) +
                         " files written in " + export_dir.string());
    log_message("matte_export",
                "sequence stopped: " + std::to_string(written_count) + " / " +
                    std::to_string(expected_frames));
}

}  // namespace corridorkey::ofx
// NOLINTEND(readability-function-cognitive-complexity,cppcoreguidelines-avoid-magic-numbers,readability-magic-numbers,readability-identifier-naming,modernize-use-integer-sign-comparison,cert-err33-c,cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-implicit-bool-conversion)
