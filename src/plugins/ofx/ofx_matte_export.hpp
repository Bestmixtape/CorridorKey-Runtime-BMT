#pragma once

#include <corridorkey/types.hpp>

#include "ofxCore.h"
#include "ofxImageEffect.h"

namespace corridorkey::ofx {

struct InstanceData;

/**
 * @brief BMT Build: one-click AI-matte export (see ofx_matte_export.cpp).
 *
 * Design (OFX-spec-constrained): OFX image/clip getters are host-locked and
 * only legal inside host-driven actions, so a plugin-spawned background
 * worker cannot pull frames. Instead the push button (main thread) arms a
 * one-shot request, and the next host-driven Render of the current frame
 * taps the final alpha buffer and writes the PNG there. The host re-renders
 * the displayed frame on any param change (the button push changes the
 * button param), so the export lands without any host seek. A full-clip
 * sequence export is impossible from a param callback without the render
 * queue; the panel's status row states this.
 */

// Main-thread handler for the kParamBmtExportMatte button notify. Captures
// the sanitized source clip name, arms matte_export_state, and (re-)arms a
// re-entrant guard while a request is still queued.
void handle_matte_export_request(InstanceData* data);

// Render-action tap: if a matte export is queued, convert the final alpha
// plane (linear float 0..1) to 16-bit grayscale and write
// %USERPROFILE%\Documents\CorridorKey2.0-BMT\matte\<clip>-frame<N>.png.
// `time` is the OFX render time (seconds); the frame number is derived from
// the source image's kOfxImageEffectPropFrameFrom / kOfxImageEffectPropFrameRate.
void maybe_export_matte_png(InstanceData* data, const Image& alpha, double time,
                            OfxPropertySetHandle source_props);

}  // namespace corridorkey::ofx
