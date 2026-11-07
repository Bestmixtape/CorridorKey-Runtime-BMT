// BMT Build: regression coverage for the Custom Picker hue-rotation math
// (post_process/hue_rotate.hpp). The picker is only as good as the hue it
// measures, so the trained-hue anchors, wrap-around nearest selection, and
// an end-to-end red-plate rotation are pinned here without needing GPU
// weights.

#include <catch2/catch_all.hpp>

#include <array>
#include <optional>

#include "post_process/hue_rotate.hpp"

namespace {

// Average HSV hue of all pixels, measured straight from the Image view.
double mean_hue_degrees(const corridorkey::Image& image, int count) {
    double sum = 0.0;
    for (int i = 0; i < count; ++i) {
        const auto* px = image.data + static_cast<std::size_t>(i) * image.stride * sizeof(float);
        const std::optional<double> hue =
            corridorkey::post_process::screen_hue_degrees(px[0], px[1], px[2]);
        REQUIRE(hue.has_value());
        sum += *hue;
    }
    return sum / static_cast<double>(count);
}

}  // namespace

TEST_CASE("screen_hue_degrees anchors the trained and primary colours",
          "[unit][post_process][hue_rotate]") {
    const std::optional<double> green = corridorkey::post_process::screen_hue_degrees(0.0, 1.0, 0.0);
    const std::optional<double> blue = corridorkey::post_process::screen_hue_degrees(0.0, 0.0, 1.0);
    const std::optional<double> red = corridorkey::post_process::screen_hue_degrees(1.0, 0.0, 0.0);
    REQUIRE(green.has_value());
    REQUIRE(blue.has_value());
    REQUIRE(red.has_value());
    CHECK(*green == Approx(120.0));
    CHECK(*blue == Approx(240.0));
    CHECK(*red == Approx(0.0));
    // Classic BMT picker default (0.0, 0.56, 0.0) must measure as green: the
    // hue metric is scale-invariant, so the darker studio green scores 120.
    const std::optional<double> studio_green =
        corridorkey::post_process::screen_hue_degrees(0.0, 0.56, 0.0);
    REQUIRE(studio_green.has_value());
    CHECK(*studio_green == Approx(120.0));
}

TEST_CASE("screen_hue_degrees rejects achromatic, dark, and NaN colours",
          "[unit][post_process][hue_rotate]") {
    CHECK_FALSE(corridorkey::post_process::screen_hue_degrees(0.5, 0.5, 0.5).has_value());
    CHECK_FALSE(corridorkey::post_process::screen_hue_degrees(0.0, 0.0, 0.0).has_value());
    CHECK_FALSE(corridorkey::post_process::screen_hue_degrees(0.05, 0.0, 0.0).has_value());
    CHECK_FALSE(corridorkey::post_process::screen_hue_degrees(0.5, 0.5,
                                                              std::numeric_limits<double>::quiet_NaN())
                    .has_value());
}

TEST_CASE("nearest_trained_hue_degrees wraps around the hue circle",
          "[unit][post_process][hue_rotate]") {
    using corridorkey::post_process::kBlueTrainedHueDeg;
    using corridorkey::post_process::kGreenTrainedHueDeg;
    using corridorkey::post_process::nearest_trained_hue_degrees;

    CHECK(nearest_trained_hue_degrees(100.0) == kGreenTrainedHueDeg);
    CHECK(nearest_trained_hue_degrees(179.0) == kGreenTrainedHueDeg);
    // Magenta (300 deg) is 60 deg from blue and 120 deg from green: blue.
    CHECK(nearest_trained_hue_degrees(300.0) == kBlueTrainedHueDeg);
    // Red (0 deg) is 120 deg from green and 120 deg from blue; the shorter
    // wrap distance to either is equal, so the tie resolves to the optimized
    // green family (strict-less-than comparison keeps green on ties).
    CHECK(nearest_trained_hue_degrees(0.0) == kGreenTrainedHueDeg);
    // 350 deg wraps to 10 deg: 110 to green, 130 to blue -> green.
    CHECK(nearest_trained_hue_degrees(350.0) == kGreenTrainedHueDeg);
    // 250 deg: 130 to green, 10 to blue -> blue.
    CHECK(nearest_trained_hue_degrees(250.0) == kBlueTrainedHueDeg);
}

TEST_CASE("rotate_image_hue moves a red plate onto the green trained hue",
          "[unit][post_process][hue_rotate]") {
    // 64x64 pure-red plate (the deterministic red->green evidence from the
    // BMT spec): rotating +120 deg must land every pixel at ~120 deg hue
    // while preserving S/V (the red is fully saturated and bright, so the
    // rotated pixel is pure green).
    constexpr int kSize = 64;
    std::array<float, static_cast<std::size_t>(kSize) * kSize * 3> pixels{};
    for (int i = 0; i < kSize * kSize; ++i) {
        pixels[static_cast<std::size_t>(i) * 3 + 0] = 1.0F;
        pixels[static_cast<std::size_t>(i) * 3 + 1] = 0.0F;
        pixels[static_cast<std::size_t>(i) * 3 + 2] = 0.0F;
    }
    corridorkey::Image plate;
    plate.data = pixels.data();
    plate.width = kSize;
    plate.height = kSize;
    plate.stride = kSize;
    plate.channels = 3;

    corridorkey::post_process::rotate_image_hue(plate, 120.0);

    CHECK(mean_hue_degrees(plate, kSize * kSize) == Approx(120.0).margin(1.0));
    // S/V preserved: the rotated red is exactly the trained green primary.
    CHECK(pixels[0] == Approx(0.0F).margin(1e-4F));
    CHECK(pixels[1] == Approx(1.0F).margin(1e-4F));
    CHECK(pixels[2] == Approx(0.0F).margin(1e-4F));

    // Inverse rotation restores the original plate.
    corridorkey::post_process::rotate_image_hue(plate, -120.0);
    CHECK(pixels[0] == Approx(1.0F).margin(1e-3F));
    CHECK(pixels[1] == Approx(0.0F).margin(1e-3F));
    CHECK(pixels[2] == Approx(0.0F).margin(1e-3F));
}

TEST_CASE("rotate_image_hue preserves saturation and value on lit screens",
          "[unit][post_process][hue_rotate]") {
    // A shaded chroma-blue plate fragment (V varies per row): hue rotation
    // must not touch S or V, only translate hue by the requested delta.
    constexpr int kSize = 32;
    std::array<float, static_cast<std::size_t>(kSize) * kSize * 3> pixels{};
    for (int y = 0; y < kSize; ++y) {
        const float v = 0.35F + 0.02F * static_cast<float>(y);
        for (int x = 0; x < kSize; ++x) {
            const std::size_t base = (static_cast<std::size_t>(y) * kSize + x) * 3;
            pixels[base + 0] = 0.0F;
            pixels[base + 1] = 0.0F;
            pixels[base + 2] = v;
        }
    }
    corridorkey::Image plate;
    plate.data = pixels.data();
    plate.width = kSize;
    plate.height = kSize;
    plate.stride = kSize;
    plate.channels = 3;

    // Purple plate (270 deg) to the blue anchor: -30 deg keeps it blue-side,
    // mirroring what the picker computes for a violet backdrop.
    corridorkey::post_process::rotate_image_hue(plate, -30.0);

    for (int y = 0; y < kSize; ++y) {
        const float v = 0.35F + 0.02F * static_cast<float>(y);
        const std::size_t base = (static_cast<std::size_t>(y) * kSize) * 3;
        // Value preserved exactly (max channel unchanged), hue now 240 deg:
        // r/g lifted symmetrically below the blue maximum.
        CHECK(plate.data[base + 2] == Approx(v).margin(1e-4F));
        CHECK(plate.data[base + 0] == Approx(0.0F).margin(1e-4F));
        CHECK(plate.data[base + 1] == Approx(0.0F).margin(1e-4F));
    }
}
