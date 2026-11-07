#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <corridorkey/types.hpp>
#include <optional>

#include "common/parallel_for.hpp"

namespace corridorkey {

// Hue-rotation preprocessing for arbitrary screen colours (BMT Build).
//
// Rationale for the trick: both trained matting families expect the screen
// plate's chroma axis to sit on a specific hue — the green track on a green
// screen (hue ~= 120 deg) and the dedicated blue track on a blue screen
// (hue ~= 240 deg). Any other saturated background (red, magenta, yellow,
// teal, ...) is out of distribution for the weights. Instead of training a
// model per background colour we rotate the *hue channel only* of the frame
// fed to the matting model so the picked background hue lands on the
// weights' trained hue. Saturation and value are preserved, so lighting,
// gradients and screen spill texture survive the rotation untouched;
// achromatic pixels (grey/black/white, s ~= 0) are invariant under the
// rotation by construction of the HSV round-trip, which keeps neutrals and
// white clothing colour-accurate. The alpha map returned by the model is
// hue-agnostic and used unmodified; only the model foreground is rotated
// back with the inverse delta before compositing.
//
// Limitation the UI hint flags as "experimental": subject hues rotate with
// the plate (a warm skin tone on a red plate becomes green-leaning inside
// the model domain). Despill and edge detail still behave because the whole
// input is shifted consistently, but hue rotations >= ~150 deg push skin
// tones through the magenta range, which the matting weights see less often.
inline constexpr double kGreenTrainedHueDeg = 120.0;
inline constexpr double kBlueTrainedHueDeg = 240.0;

// HSV saturation floor below which a pixel/colour carries no reliable hue
// axis (grey plates, tinted blacks). Hue read from those colours is noise.
inline constexpr double kHueRotationSaturationFloor = 0.05;

inline double wrap_hue_degrees(double hue_deg) {
    double wrapped = std::fmod(hue_deg, 360.0);
    if (wrapped < 0.0) {
        wrapped += 360.0;
    }
    return wrapped;
}

// Maps a rotation amount onto the shortest path (-180, 180].
inline double normalize_hue_delta_degrees(double delta_deg) {
    double delta = wrap_hue_degrees(delta_deg);
    if (delta > 180.0) {
        delta -= 360.0;
    }
    return delta;
}

// HSV hue (degrees, [0,360)) of an RGB colour in [0,1]. Returns nullopt for
// colours whose HSV saturation sits under kHueRotationSaturationFloor.
inline std::optional<double> screen_hue_degrees(double red, double green, double blue) {
    if (!(std::isfinite(red) && std::isfinite(green) && std::isfinite(blue))) {
        return std::nullopt;
    }
    const double max_channel = std::max({red, green, blue});
    const double min_channel = std::min({red, green, blue});
    const double chroma = max_channel - min_channel;
    if (!(max_channel > 0.0) || !(std::isfinite(max_channel))) {
        return std::nullopt;
    }
    if (chroma / max_channel < kHueRotationSaturationFloor) {
        return std::nullopt;
    }

    double hue_deg = 0.0;
    if (max_channel == red) {
        hue_deg = 60.0 * std::fmod((green - blue) / chroma, 6.0);
    } else if (max_channel == green) {
        hue_deg = 60.0 * ((blue - red) / chroma + 2.0);
    } else {
        hue_deg = 60.0 * ((red - green) / chroma + 4.0);
    }
    return wrap_hue_degrees(hue_deg);
}

// Nearest trained hue for a picked background hue, using circular distance
// so the wrap between red-family hues cannot flip the choice on hue-wrap.
// Exact 180 deg ties resolve to the green track (the optimized ONNX ladder).
inline double nearest_trained_hue_degrees(double hue_deg) {
    const double hue = wrap_hue_degrees(hue_deg);
    const double green_distance = std::abs(normalize_hue_delta_degrees(hue - kGreenTrainedHueDeg));
    const double blue_distance = std::abs(normalize_hue_delta_degrees(hue - kBlueTrainedHueDeg));
    if (blue_distance < green_distance) {
        return kBlueTrainedHueDeg;
    }
    return kGreenTrainedHueDeg;
}

// Rotates the hue channel of every RGB pixel by delta_degrees, preserving
// saturation and value. No-op for |delta| below a tenth of a degree or for
// images without three channels.
inline void rotate_image_hue(Image image, double delta_degrees) {
    const float delta = static_cast<float>(normalize_hue_delta_degrees(delta_degrees));
    if (image.channels < 3 || !std::isfinite(delta) || std::abs(delta) < 0.1F) {
        return;
    }

    common::parallel_for_rows(image.height, [&](int y_begin, int y_end) {
        for (int y = y_begin; y < y_end; ++y) {
            for (int x = 0; x < image.width; ++x) {
                const float red = image(y, x, 0);
                const float green = image(y, x, 1);
                const float blue = image(y, x, 2);

                const float max_channel = std::max({red, green, blue});
                const float min_channel = std::min({red, green, blue});
                const float chroma = max_channel - min_channel;
                if (chroma <= 0.0F) {
                    continue;  // achromatic: hue-invariant, keep pixel untouched
                }

                float hue = 0.0F;
                if (max_channel == red) {
                    hue = 60.0F * ((green - blue) / chroma);
                } else if (max_channel == green) {
                    hue = 60.0F * ((blue - red) / chroma + 2.0F);
                } else {
                    hue = 60.0F * ((red - green) / chroma + 4.0F);
                }
                if (hue < 0.0F) {
                    hue += 360.0F;
                }

                float rotated_hue = hue + delta;
                if (rotated_hue >= 360.0F) {
                    rotated_hue -= 360.0F;
                } else if (rotated_hue < 0.0F) {
                    rotated_hue += 360.0F;
                }

                // HSV -> RGB with hue on [0,360), s and v untouched.
                const float saturation = max_channel > 0.0F ? chroma / max_channel : 0.0F;
                const float sector = rotated_hue / 60.0F;
                const int sector_index = static_cast<int>(sector) % 6;
                const float sector_fract = sector - std::floor(sector);
                const float value = max_channel;
                const float p = value * (1.0F - saturation);
                const float q = value * (1.0F - saturation * sector_fract);
                const float t = value * (1.0F - saturation * (1.0F - sector_fract));

                std::array<float, 3> rgb = {value, value, value};
                switch (sector_index) {
                    case 0:
                        rgb = {value, t, p};
                        break;
                    case 1:
                        rgb = {q, value, p};
                        break;
                    case 2:
                        rgb = {p, value, t};
                        break;
                    case 3:
                        rgb = {p, q, value};
                        break;
                    case 4:
                        rgb = {t, p, value};
                        break;
                    case 5:
                        rgb = {value, p, q};
                        break;
                    default:
                        break;
                }

                image(y, x, 0) = std::clamp(rgb[0], 0.0F, 1.0F);
                image(y, x, 1) = std::clamp(rgb[1], 0.0F, 1.0F);
                image(y, x, 2) = std::clamp(rgb[2], 0.0F, 1.0F);
            }
        }
    });
}

}  // namespace corridorkey
