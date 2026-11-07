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
//   * File naming: <sanitized-clip-name>-frame<N>.png with N =
//     round((kOfxImageEffectPropFrameFrom + time) * fps) from the source
//     image handle; kOfxImageClipPropFrameRange is read at button time for
//     the log line (and to tell the user the clip extent they asked to
//     "sequence" is beyond a single param-callback export).
#include "ofx_matte_export.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <filesystem>
#include <mutex>
#include <string>
#include <vector>

#include "common/runtime_paths.hpp"
#include "frame_io/matte_png.hpp"
#include "ofx_image_utils.hpp"
#include "ofx_logging.hpp"
#include "ofx_shared.hpp"

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

// %USERPROFILE%\Documents\CorridorKey2.0-BMT\matte (per the feature spec;
// falls back to %LOCALAPPDATA% when USERPROFILE is unset, same helper the
// models root uses).
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

void set_matte_status(InstanceData* data, const std::string& line) {
    {
        std::lock_guard<std::mutex> lock(data->matte_export_mutex);
        data->matte_status_line = line;
    }
    data->runtime_panel_dirty = true;
}

}  // namespace

void handle_matte_export_request(InstanceData* data) {
    if (data == nullptr) {
        return;
    }
    // Re-entrancy guard: a click while a request is still queued (state 1)
    // is ignored; completed/idle states re-arm normally.
    if (data->matte_export_state.load() == 1) {
        set_matte_status(data, "Matte export still queued — waiting for the next render.");
        log_message("matte_export", "ignored: request already queued");
        return;
    }

    std::string clip_name = "clip";
    if (data->source_clip != nullptr && g_suites.image_effect != nullptr) {
        OfxPropertySetHandle clip_props = nullptr;
        if (g_suites.image_effect->clipGetPropertySet(data->source_clip, &clip_props) ==
                kOfxStatOK &&
            clip_props != nullptr) {
            std::string raw_name;
            if (get_string(clip_props, kOfxPropName, raw_name) && !raw_name.empty()) {
                clip_name = sanitize_clip_name(raw_name);
            }
            double frame_range[2] = {0.0, 0.0};
            // "OfxImageClipPropFrameRange" is in the OFX clip property set but
            // missing a define in the vendored 1.4-era header; literal string,
            // Resolve populates it.
            if (g_suites.property != nullptr &&
                g_suites.property->propGetDoubleN(clip_props, "OfxImageClipPropFrameRange", 2,
                                                  frame_range) == kOfxStatOK) {
                log_message("matte_export",
                            "clip frame range (seconds): " + std::to_string(frame_range[0]) + ".." +
                                std::to_string(frame_range[1]));
            }
        }
    }
    {
        std::lock_guard<std::mutex> lock(data->matte_export_mutex);
        data->matte_clip_name = clip_name;
    }
    data->matte_export_state.store(1);
    set_matte_status(data, "Matte export queued — writing current frame after next render.");
    log_message("matte_export", "queued clip=" + clip_name);
}

void maybe_export_matte_png(InstanceData* data, const Image& alpha, double time,
                            OfxPropertySetHandle source_props) {
    if (data == nullptr || data->matte_export_state.load() != 1) {
        return;
    }
    // Consume the request up-front: a failed write completes the one-shot
    // cycle (status row carries the error), matching the button's
    // fire-once semantics.
    data->matte_export_state.store(2);

    std::string clip_name;
    {
        std::lock_guard<std::mutex> lock(data->matte_export_mutex);
        clip_name = data->matte_clip_name.empty() ? "clip" : data->matte_clip_name;
    }

    // Frame number for the filename: (clip-relative frameFrom + render time)
    // * fps. Resolve's clip-coordinate time starts at 0 for the clip's first
    // frame, so frameFrom is typically 0 and N is the clip-relative index.
    double frame_from = 0.0;
    double frame_rate_pair[2] = {24.0, 1.0};
    if (source_props != nullptr && g_suites.property != nullptr) {
        // "OfxImageEffectPropFrameFrom" is a spec image-handle property with
        // no define in the vendored header; Resolve sets it (0 for clips).
        get_double(source_props, "OfxImageEffectPropFrameFrom", frame_from);
        g_suites.property->propGetDoubleN(source_props, kOfxImageEffectPropFrameRate, 2,
                                          frame_rate_pair);
    }
    const double fps =
        (frame_rate_pair[1] > 0.0) ? frame_rate_pair[0] / frame_rate_pair[1] : 24.0;
    const long long frame_number =
        static_cast<long long>(std::llround((frame_from + time) * fps));

    const std::filesystem::path out_path =
        matte_export_dir() / (clip_name + "-frame" + std::to_string(frame_number) + ".png");

    // The final alpha plane is linear float in [0,1]; clamp and quantize to
    // 16-bit unsigned for a bit_depth=16 GRAY PNG (lossless, Resolve reads
    // it back as a 16-bit grey clip).
    const int width = alpha.width;
    const int height = alpha.height;
    std::vector<uint16_t> gray(static_cast<std::size_t>(width) * static_cast<std::size_t>(height));
    const std::size_t pixel_count = std::min(gray.size(), alpha.data.size());
    for (std::size_t i = 0; i < pixel_count; ++i) {
        const float clamped = std::clamp(alpha.data[i], 0.0F, 1.0F);
        gray[i] = static_cast<uint16_t>(std::lround(clamped * 65535.0F));
    }

    if (auto written = write_matte_png_16(out_path, width, height, gray.data(),
                                          static_cast<std::size_t>(width));
        !written.has_value()) {
        const std::string message =
            written.error().message.empty() ? "unknown error" : written.error().message;
        set_matte_status(data, "Matte export FAILED: " + message);
        log_message("matte_export", "write failed: " + message);
        return;
    }

    set_matte_status(data, "Matte written: " + out_path.string());
    log_message("matte_export", "wrote " + out_path.string());
}

}  // namespace corridorkey::ofx
// NOLINTEND(readability-function-cognitive-complexity,cppcoreguidelines-avoid-magic-numbers,readability-magic-numbers,readability-identifier-naming,modernize-use-integer-sign-comparison,cert-err33-c,cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-implicit-bool-conversion)
