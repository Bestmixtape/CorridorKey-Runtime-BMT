// BMT v0.2 first-run model-download overlay.
//
// While the model pack has not finished downloading, the render path copies
// the source through to the output surface and then calls
// draw_model_pack_overlay() to stamp a status card (message + progress bar)
// directly into the output pixels. Resolve / Fusion / Nuke viewers display
// the output surface, so the text appears in the preview without any host
// UI or overlay-interact support, and works identically on every host.
#pragma once

#include <app/model_fetch.hpp>

#include <cstdint>
#include <filesystem>
#include <string>

namespace corridorkey::ofx {

// Draws the first-run "models are downloading" card centered on the output
// surface. output_data/output_row_bytes describe the already-copied output
// image; bit_depth is the OFX bit-depth string ("OfxBitDepthByte" /
// "OfxBitDepthFloat"). Channel count is derived from row_bytes, and the
// alpha channel is never touched, so RGB/RGBA byte/float surfaces all work.
//
// progress drives the bar and wording (Downloading / Failed / Idle-preparing).
// models_dir is only used to show the user where the pack is being written.
// fonts_dir is the directory holding DejaVuSans.ttf / DejaVuSans-Bold.ttf
// (bundle Contents/Resources/fonts); if the fonts cannot be loaded the card
// degrades to a pure progress bar at the bottom of the frame.
void draw_model_pack_overlay(void* output_data,
                             std::int64_t output_row_bytes,
                             int width,
                             int height,
                             const std::string& bit_depth,
                             const app::ModelPackProgress& progress,
                             const std::filesystem::path& models_dir,
                             const std::filesystem::path& fonts_dir);

}  // namespace corridorkey::ofx
