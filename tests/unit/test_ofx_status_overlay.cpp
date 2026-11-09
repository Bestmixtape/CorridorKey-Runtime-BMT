#include <catch2/catch_all.hpp>

#include "plugins/ofx/ofx_status_overlay.hpp"
#include <app/model_fetch.hpp>

// stb_image_write is already implemented in corridors_core_static (png_io.cpp)
// Just include the header for declarations
#include "vendor/stb_image_write.h"

#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>

// OFX bit depth constants
#include <ofxCore.h>

// Include stb_truetype for font diagnostics (declarations only - impl in ofx_status_overlay.cpp)
#include "third_party/stb/stb_truetype.h"

using namespace corridorkey::ofx;
using namespace corridorkey::app;

static void check_fonts_exist(const std::filesystem::path& fonts_dir) {
    const std::filesystem::path candidates_regular[] = {
        fonts_dir / "DejaVuSans.ttf",
        std::filesystem::path("C:/Windows/Fonts/segoeui.ttf"),
    };
    const std::filesystem::path candidates_bold[] = {
        fonts_dir / "DejaVuSans-Bold.ttf",
        std::filesystem::path("C:/Windows/Fonts/segoeuib.ttf"),
    };
    
    std::cout << "FONT DIAG: Checking fonts from: " << fonts_dir << std::endl;
    for (const auto& candidate : candidates_regular) {
        std::cout << "FONT DIAG:   Regular candidate: " << candidate << " exists=" << std::filesystem::exists(candidate) << " size=";
        if (std::filesystem::exists(candidate)) {
            std::cout << std::filesystem::file_size(candidate);
        } else {
            std::cout << "N/A";
        }
        std::cout << std::endl;
    }
    for (const auto& candidate : candidates_bold) {
        std::cout << "FONT DIAG:   Bold candidate: " << candidate << " exists=" << std::filesystem::exists(candidate) << " size=";
        if (std::filesystem::exists(candidate)) {
            std::cout << std::filesystem::file_size(candidate);
        } else {
            std::cout << "N/A";
        }
        std::cout << std::endl;
    }
}

// Replicate the Face/FontSet logic for diagnostics
struct DiagFace {
    std::vector<unsigned char> data;
    stbtt_fontinfo info{};
    bool ok = false;
    bool load(const std::filesystem::path& path) {
        std::ifstream stream(path, std::ios::binary);
        if (!stream) return false;
        data.assign(std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>());
        if (data.empty()) return false;
        const int offset = stbtt_GetFontOffsetForIndex(data.data(), 0);
        if (offset < 0 || !stbtt_InitFont(&info, data.data(), offset)) {
            data.clear();
            return false;
        }
        ok = true;
        return true;
    }
};

static void diag_font_loading_and_text(const std::filesystem::path& fonts_dir) {
    DiagFace regular, bold;
    const std::filesystem::path candidates_regular[] = {
        fonts_dir / "DejaVuSans.ttf",
        std::filesystem::path("C:/Windows/Fonts/segoeui.ttf"),
    };
    const std::filesystem::path candidates_bold[] = {
        fonts_dir / "DejaVuSans-Bold.ttf",
        std::filesystem::path("C:/Windows/Fonts/segoeuib.ttf"),
    };
    
    for (const auto& candidate : candidates_regular) {
        if (regular.load(candidate)) {
            std::cout << "DIAG FONT: Loaded regular from: " << candidate << std::endl;
            break;
        }
    }
    for (const auto& candidate : candidates_bold) {
        if (bold.load(candidate)) {
            std::cout << "DIAG FONT: Loaded bold from: " << candidate << std::endl;
            break;
        }
    }
    if (!regular.ok && bold.ok) {
        regular.data = bold.data;
        regular.ok = stbtt_InitFont(&regular.info, regular.data.data(), stbtt_GetFontOffsetForIndex(regular.data.data(), 0)) != 0;
    }
    
    if (!regular.ok) {
        std::cout << "DIAG FONT: FAILED - no regular font loaded" << std::endl;
        return;
    }
    
    std::cout << "DIAG FONT: regular.ok=" << (regular.ok ? "true" : "false") << " bold.ok=" << (bold.ok ? "true" : "false") << std::endl;
    
    // Test glyph rendering for a simple character
    const char* test_text = "CORRIDORKEY";
    float base_px = 14.4f;  // 480 * 0.03
    float scale = stbtt_ScaleForPixelHeight(&regular.info, 1.25f * base_px);  // title size
    std::cout << "DIAG FONT: base_px=" << base_px << " title scale=" << scale << std::endl;
    
    int ascent, descent, line_gap;
    stbtt_GetFontVMetrics(&regular.info, &ascent, &descent, &line_gap);
    std::cout << "DIAG FONT: ascent=" << ascent << " descent=" << descent << " line_gap=" << line_gap << std::endl;
    
    for (size_t i = 0; i < strlen(test_text); ++i) {
        int cp = static_cast<unsigned char>(test_text[i]);
        int x0, y0, gw, gh;
        unsigned char* bitmap = stbtt_GetCodepointBitmapSubpixel(&regular.info, scale, scale, 0.0f, 0.0f, cp, &x0, &y0, &gw, &gh);
        if (bitmap) {
            int advance, lsb;
            stbtt_GetCodepointHMetrics(&regular.info, cp, &advance, &lsb);
            std::cout << "DIAG FONT: char='" << test_text[i] << "' cp=" << cp << " bitmap=" << gw << "x" << gh << " x0=" << x0 << " y0=" << y0 << " advance=" << advance << std::endl;
            stbtt_FreeBitmap(bitmap, nullptr);
        } else {
            std::cout << "DIAG FONT: char='" << test_text[i] << "' cp=" << cp << " bitmap=NULL" << std::endl;
        }
    }
    
    // Also test body text scale
    float body_scale = stbtt_ScaleForPixelHeight(&regular.info, 1.0f * base_px);
    std::cout << "DIAG FONT: body scale=" << body_scale << std::endl;
    
    const char* test_text2 = "The CorridorKey models are not on this system yet.";
    for (size_t i = 0; i < std::min<size_t>(20, strlen(test_text2)); ++i) {
        int cp = static_cast<unsigned char>(test_text2[i]);
        int x0, y0, gw, gh;
        unsigned char* bitmap = stbtt_GetCodepointBitmapSubpixel(&regular.info, body_scale, body_scale, 0.0f, 0.0f, cp, &x0, &y0, &gw, &gh);
        if (bitmap) {
            stbtt_FreeBitmap(bitmap, nullptr);
        } else {
            std::cout << "DIAG FONT: body char='" << test_text2[i] << "' cp=" << cp << " bitmap=NULL" << std::endl;
        }
    }
    
    // Check bounding boxes directly
    std::cout << "DIAG FONT: Checking bounding boxes..." << std::endl;
    for (size_t i = 0; i < strlen(test_text); ++i) {
        int cp = static_cast<unsigned char>(test_text[i]);
        int x0, y0, x1, y1;
        // Note: Box version has codepoint as 2nd param (vs 6th for Bitmap version)
        stbtt_GetCodepointBitmapBoxSubpixel(&regular.info, cp, scale, scale, 0.0f, 0.0f, &x0, &y0, &x1, &y1);
        int advance, lsb;
        stbtt_GetCodepointHMetrics(&regular.info, cp, &advance, &lsb);
        std::cout << "DIAG FONT: char='" << test_text[i] << "' bbox=(" << x0 << "," << y0 << "," << x1 << "," << y1 << ") w=" << (x1-x0) << " h=" << (y1-y0) << " advance=" << advance << std::endl;
    }
}

TEST_CASE("ofx_status_overlay draws card with text and progress bar", "[unit][ofx][overlay]") {
    // Create a 640x480 RGBA8 buffer pre-filled with mid-green (0, 128, 0, 255)
    constexpr int width = 640;
    constexpr int height = 480;
    constexpr int channels = 4;
    constexpr int row_bytes = width * channels;

    std::vector<unsigned char> buffer(width * height * channels);
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            size_t idx = (y * width + x) * channels;
            buffer[idx + 0] = 0;       // R
            buffer[idx + 1] = 128;     // G (mid-green)
            buffer[idx + 2] = 0;       // B
            buffer[idx + 3] = 255;     // A
        }
    }

    // Synthetic progress: Downloading phase, ~40% done
    ModelPackProgress progress;
    progress.phase = ModelPackPhase::Downloading;
    progress.bytes_done = 400 * 1000 * 1000;   // 400 MB
    progress.bytes_total = 1000 * 1000 * 1000; // 1 GB
    progress.current_file = "model_fp16.onnx";
    progress.completed_files = 2;
    progress.total_files = 5;
    progress.percent = 400; // 40% * 10

    // Paths
    std::filesystem::path models_dir = "C:/models";
    std::filesystem::path fonts_dir = PROJECT_ROOT "/third_party/fonts";

    // Check font files
    check_fonts_exist(fonts_dir);

    // Diagnose font loading and glyph rendering
    diag_font_loading_and_text(fonts_dir);

    // Call the overlay function
    draw_model_pack_overlay(
        buffer.data(),
        row_bytes,
        width,
        height,
        kOfxBitDepthByte, // byte depth
        progress,
        models_dir,
        fonts_dir
    );

    // Save PPM for visual inspection
    const char* ppm_path = "C:/hermes-files/corridorkey/overlay_test.ppm";
    int ppm_result = stbi_write_png(ppm_path, width, height, channels, buffer.data(), row_bytes);
    REQUIRE(ppm_result != 0);
    std::cout << "Saved overlay test image to: " << ppm_path << std::endl;

    // Diagnostics: we can't directly access fonts.ready from here, but we can
    // infer from the output. Let's also check the is_float and channels logic.
    bool is_float = (std::string(kOfxBitDepthByte) == kOfxBitDepthFloat);
    int derived_channels = static_cast<int>(row_bytes / (static_cast<int64_t>(width) * 1)); // 1 byte per component
    std::cout << "DIAG: is_float=" << (is_float ? "true" : "false")
              << " derived_channels=" << derived_channels
              << " row_bytes=" << row_bytes
              << " width=" << width
              << std::endl;

    // Verify card background: near-black pixels should exist in the center region
    // Card is centered, roughly 88% width x 92% height of frame
    int cx0 = static_cast<int>((width - width * 0.88f) * 0.5f);
    int cy0 = static_cast<int>((height - height * 0.92f) * 0.5f);
    int cx1 = cx0 + static_cast<int>(width * 0.88f);
    int cy1 = cy0 + static_cast<int>(height * 0.92f);

    bool found_near_black = false;
    bool found_near_white = false;
    bool found_blue_progress = false;

    // Sample pixels in the card region
    for (int y = cy0; y < cy1 && !(found_near_black && found_near_white && found_blue_progress); ++y) {
        for (int x = cx0; x < cx1 && !(found_near_black && found_near_white && found_blue_progress); ++x) {
            size_t idx = (y * width + x) * channels;
            uint8_t r = buffer[idx + 0];
            uint8_t g = buffer[idx + 1];
            uint8_t b = buffer[idx + 2];

            // Near-black: all channels low (card background is ~0.09, 0.09, 0.12 in float = ~23, 23, 30 in byte)
            if (r < 60 && g < 60 && b < 60) {
                found_near_black = true;
            }

            // Near-white: all channels high (text is ~0.93, 0.93, 0.95 = ~237, 237, 242)
            if (r > 200 && g > 200 && b > 200) {
                found_near_white = true;
            }

            // Blue progress: B dominant, R and G low (progress bar is ~0.16, 0.45, 0.95 = ~41, 115, 242)
            if (b > 180 && r < 100 && g < 150 && b > r && b > g) {
                found_blue_progress = true;
            }
        }
    }

    std::cout << "DIAG: found_near_black=" << (found_near_black ? "true" : "false")
              << " found_near_white=" << (found_near_white ? "true" : "false")
              << " found_blue_progress=" << (found_blue_progress ? "true" : "false")
              << std::endl;

    // Assertions
    REQUIRE(found_near_black);
    REQUIRE(found_near_white);
    REQUIRE(found_blue_progress);
}

TEST_CASE("ofx_status_overlay draws card on float surface", "[unit][ofx][overlay]") {
    // Create a 640x480 RGBA float buffer pre-filled with mid-green
    constexpr int width = 640;
    constexpr int height = 480;
    constexpr int channels = 4;
    constexpr int row_bytes = width * channels * sizeof(float);

    std::vector<float> buffer(width * height * channels);
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            size_t idx = (y * width + x) * channels;
            buffer[idx + 0] = 0.0f;   // R
            buffer[idx + 1] = 0.5f;   // G (mid-green)
            buffer[idx + 2] = 0.0f;   // B
            buffer[idx + 3] = 1.0f;   // A
        }
    }

    ModelPackProgress progress;
    progress.phase = ModelPackPhase::Downloading;
    progress.bytes_done = 400 * 1000 * 1000;
    progress.bytes_total = 1000 * 1000 * 1000;
    progress.current_file = "model_fp16.onnx";
    progress.completed_files = 2;
    progress.total_files = 5;
    progress.percent = 400;

    std::filesystem::path models_dir = "C:/models";
    std::filesystem::path fonts_dir = PROJECT_ROOT "/third_party/fonts";

    draw_model_pack_overlay(
        buffer.data(),
        row_bytes,
        width,
        height,
        kOfxBitDepthFloat, // float depth
        progress,
        models_dir,
        fonts_dir
    );

    // Convert to bytes for saving
    std::vector<unsigned char> byte_buffer(width * height * channels);
    for (size_t i = 0; i < buffer.size(); ++i) {
        byte_buffer[i] = static_cast<unsigned char>(std::clamp(buffer[i] * 255.0f + 0.5f, 0.0f, 255.0f));
    }

    const char* ppm_path = "C:/hermes-files/corridorkey/overlay_test_float.png";
    int ppm_result = stbi_write_png(ppm_path, width, height, channels, byte_buffer.data(), width * channels);
    REQUIRE(ppm_result != 0);
    std::cout << "Saved float overlay test image to: " << ppm_path << std::endl;

    // Diagnostics
    bool is_float = (std::string(kOfxBitDepthFloat) == kOfxBitDepthFloat);
    int derived_channels = static_cast<int>(row_bytes / (static_cast<int64_t>(width) * 4)); // 4 bytes per component
    std::cout << "DIAG FLOAT: is_float=" << (is_float ? "true" : "false")
              << " derived_channels=" << derived_channels
              << " row_bytes=" << row_bytes
              << " width=" << width
              << std::endl;

    // Verify card background on float (near-black ~0.015, 0.015, 0.020 = ~4, 4, 5 in byte)
    int cx0 = static_cast<int>((width - width * 0.88f) * 0.5f);
    int cy0 = static_cast<int>((height - height * 0.92f) * 0.5f);
    int cx1 = cx0 + static_cast<int>(width * 0.88f);
    int cy1 = cy0 + static_cast<int>(height * 0.92f);

    bool found_near_black = false;
    bool found_near_white = false;
    bool found_blue_progress = false;

    for (int y = cy0; y < cy1 && !(found_near_black && found_near_white && found_blue_progress); ++y) {
        for (int x = cx0; x < cx1 && !(found_near_black && found_near_white && found_blue_progress); ++x) {
            size_t idx = (y * width + x) * channels;
            uint8_t r = byte_buffer[idx + 0];
            uint8_t g = byte_buffer[idx + 1];
            uint8_t b = byte_buffer[idx + 2];

            if (r < 30 && g < 30 && b < 30) {
                found_near_black = true;
            }
            if (r > 200 && g > 200 && b > 200) {
                found_near_white = true;
            }
            if (b > 180 && r < 100 && g < 150 && b > r && b > g) {
                found_blue_progress = true;
            }
        }
    }

    std::cout << "DIAG FLOAT: found_near_black=" << (found_near_black ? "true" : "false")
              << " found_near_white=" << (found_near_white ? "true" : "false")
              << " found_blue_progress=" << (found_blue_progress ? "true" : "false")
              << std::endl;

    REQUIRE(found_near_black);
    REQUIRE(found_near_white);
    REQUIRE(found_blue_progress);
}