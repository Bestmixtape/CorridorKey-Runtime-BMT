// Offscreen test harness for the v0.2 status overlay.
#include "ofx_status_overlay.hpp"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

using namespace corridorkey;

int main(int argc, char** argv) {
    const int W = 1920, H = 1080;
    std::vector<unsigned char> buf(static_cast<std::size_t>(W) * H * 4);
    // Green plate, opaque.
    for (int i = 0; i < W * H; ++i) {
        buf[i * 4 + 0] = 60;   // R
        buf[i * 4 + 1] = 170;  // G
        buf[i * 4 + 2] = 60;   // B
        buf[i * 4 + 3] = 255;
    }
    app::ModelPackProgress p{};
    p.phase = app::ModelPackPhase::Downloading;
    p.percent = 337;
    p.bytes_done = 1'500'000'000ULL;
    p.bytes_total = 4'300'000'000ULL;
    p.current_file = "corridorkey_dynamic_green_fp32_1024.onnx";
    p.completed_files = 3;
    p.total_files = 12;

    const std::filesystem::path fonts_dir = argc > 1 ? argv[1] : "third_party/fonts";
    ofx::draw_model_pack_overlay(buf.data(), static_cast<std::int64_t>(W) * 4, W, H,
                                 "OfxBitDepthByte", p, "C:/models", fonts_dir);

    std::FILE* out = std::fopen("overlay_test.ppm", "wb");
    if (!out) return 2;
    std::fprintf(out, "P6\n%d %d\n255\n", W, H);
    for (int y = 0; y < H; ++y) {
        for (int x = 0; x < W; ++x) {
            const auto* px = buf.data() + (static_cast<std::size_t>(y) * W + x) * 4;
            std::fwrite(px, 1, 3, out);
        }
    }
    std::fclose(out);

    // --- Float surface (RGBA float, OFX rowbytes in BYTES) ---
    std::vector<float> fbuf(static_cast<std::size_t>(W) * H * 4);
    for (int i = 0; i < W * H; ++i) {
        fbuf[i * 4 + 0] = 0.235f; fbuf[i * 4 + 1] = 0.667f; fbuf[i * 4 + 2] = 0.235f; fbuf[i * 4 + 3] = 1.0f;
    }
    ofx::draw_model_pack_overlay(fbuf.data(), static_cast<std::int64_t>(W) * 16, W, H,
                                 "OfxBitDepthFloat", p, "C:/models", fonts_dir);
    std::vector<unsigned char> conv(static_cast<std::size_t>(W) * H * 4);
    for (std::size_t i = 0; i < fbuf.size(); ++i) {
        float v = fbuf[i];
        v = v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v);
        conv[i] = static_cast<unsigned char>(v * 255.0f + 0.5f);
    }
    {
        std::FILE* fo = std::fopen("overlay_test_float.ppm", "wb");
        if (fo) {
            std::fprintf(fo, "P6\n%d %d\n255\n", W, H);
            for (int y = 0; y < H; ++y)
                for (int x = 0; x < W; ++x)
                    std::fwrite(conv.data() + (static_cast<std::size_t>(y) * W + x) * 4, 1, 3, fo);
            std::fclose(fo);
        }
    }
    int white = 0, card = 0;
    for (std::size_t i = 0; i < conv.size(); i += 4) {
        if (conv[i] > 230 && conv[i + 1] > 230 && conv[i + 2] > 230) ++white;
        if (conv[i] < 25 && conv[i + 1] < 25 && conv[i + 2] < 30) ++card;
    }
    std::printf("wrote byte+float PPMs; float surface: white_px=%d card_px=%d (fonts_dir=%s)\n",
                white, card, fonts_dir.string().c_str());
    return 0;
}
