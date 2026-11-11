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
 *
 * Sequence export (state 3): the button opens a native save dialog, reads
 * the clip extent for the frame count, then arms a streaming export. Each
 * subsequent Render writes one frame until all frames are written. Pressing
 * the button again while streaming stops and finalizes.
 */

// Main-thread handler for the kParamBmtExportMatte button notify. Captures
// the sanitized source clip name, shows a native save dialog, reads the clip
// extent for the frame count, and arms matte_export_state=3 (streaming
// sequence). Cancel leaves state=0 with status "Matte export cancelled."
void handle_matte_export_request(InstanceData* data);

// Main-thread handler to stop a streaming sequence export (state 3).
// Called when the button is pressed again while streaming. Finalizes with
// status "Matte sequence stopped: N of M files written."
void handle_matte_export_stop(InstanceData* data);

// Render-action tap: if a matte export is queued (state 1 legacy or state 3
// streaming), convert the final alpha plane (linear float 0..1) to 16-bit
// grayscale and write the PNG. For state 3, writes frames as
// <dir>/<stem>_%04lld.png until all expected frames are written, then
// transitions to state 2 (completed).
// `time` is the OFX render time (seconds); the frame number is derived from
// the source image's kOfxImageEffectPropFrameFrom / kOfxImageEffectPropFrameRate.
void maybe_export_matte_png(InstanceData* data, const Image& alpha, double time,
                            OfxPropertySetHandle source_props);

}  // namespace corridorkey::ofx
