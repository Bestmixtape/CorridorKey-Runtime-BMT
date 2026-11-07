#pragma once

#include <corridorkey/api_export.hpp>
#include <corridorkey/types.hpp>

#include <cstddef>
#include <cstdint>
#include <filesystem>

namespace corridorkey {

/**
 * @brief Write a single-frame 16-bit grayscale PNG (the OFX matte export
 * target format).
 *
 * Pure host-free helper: takes a row-major uint16 plane and writes a
 * bit_depth=16, color-type=GRAY PNG via libpng (PNG::PNG is already a
 * corridorkey_common dependency — no new ports). Deliberately separate from
 * write_png() in png_io.hpp, which quantizes float RGB through the sRGB LUT
 * to 8-bit channels and is unsuitable for a linear alpha matte.
 *
 * @param path              Destination file (parent dirs created).
 * @param width             Image width in pixels.
 * @param height            Image height in pixels.
 * @param gray              Row-major uint16 samples.
 * @param row_stride_values Samples per row (>= width); lets callers pass a
 *                          padded stride without a copy.
 */
CORRIDORKEY_API Result<void> write_matte_png_16(const std::filesystem::path& path, int width,
                                                int height, const uint16_t* gray,
                                                std::size_t row_stride_values);

}  // namespace corridorkey
