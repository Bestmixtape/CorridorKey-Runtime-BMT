// BMT v0.2 first-run model-download overlay implementation.
//
// Pure software stamping into the OFX output surface — no host UI, no GPU
// dependencies beyond what the render pass already needs. Text is rendered
// from bundled DejaVu TTFs via stb_truetype; if the fonts are missing the
// card degrades to a full-width progress strip at the bottom of the frame
// so the user still sees motion instead of a "hung" preview.
#include "ofx_status_overlay.hpp"

#include "ofxImageEffect.h"  // bit-depth property constants

#if defined(_MSC_VER)
#pragma warning(push)
#pragma warning(disable : 4100 4189 4127 4244 4267 4456 4996)
#endif
#define STB_TRUETYPE_IMPLEMENTATION
#include "stb_truetype.h"
#if defined(_MSC_VER)
#pragma warning(pop)
#endif

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

namespace corridorkey::ofx {
namespace {

constexpr std::uint64_t kBytesPerMb = 1000ULL * 1000ULL;
constexpr std::uint64_t kBytesPerGb = 1000ULL * 1000ULL * 1000ULL;

std::string format_bytes(std::uint64_t bytes) {
    char buffer[32];
    if (bytes >= kBytesPerGb) {
        std::snprintf(buffer, sizeof(buffer), "%.1f GB", static_cast<double>(bytes) / static_cast<double>(kBytesPerGb));
    } else if (bytes >= kBytesPerMb) {
        std::snprintf(buffer, sizeof(buffer), "%.0f MB", static_cast<double>(bytes) / static_cast<double>(kBytesPerMb));
    } else {
        std::snprintf(buffer, sizeof(buffer), "%.0f KB", static_cast<double>(bytes) / 1000.0);
    }
    return buffer;
}

// Minimal UTF-8 decoder; invalid bytes fall through as U+FFFD so the card
// never renders garbage boxes from mixed-encoding host strings.
std::uint32_t next_codepoint(const std::string& text, std::size_t& index) {
    const auto b0 = static_cast<unsigned char>(text[index]);
    auto cont = [&](std::size_t k) {
        return index + k < text.size() ? static_cast<unsigned char>(text[index + k]) : 0u;
    };
    std::uint32_t cp = 0xFFFD;
    std::size_t width = 1;
    if (b0 < 0x80) {
        cp = b0;
    } else if ((b0 & 0xE0u) == 0xC0u && (cont(1) & 0xC0u) == 0x80u) {
        cp = ((b0 & 0x1Fu) << 6) | (cont(1) & 0x3Fu);
        width = 2;
    } else if ((b0 & 0xF0u) == 0xE0u && (cont(1) & 0xC0u) == 0x80u && (cont(2) & 0xC0u) == 0x80u) {
        cp = ((b0 & 0x0Fu) << 12) | ((cont(1) & 0x3Fu) << 6) | (cont(2) & 0x3Fu);
        width = 3;
    } else if ((b0 & 0xF8u) == 0xF0u && (cont(1) & 0xC0u) == 0x80u && (cont(2) & 0xC0u) == 0x80u &&
               (cont(3) & 0xC0u) == 0x80u) {
        cp = ((b0 & 0x07u) << 18) | ((cont(1) & 0x3Fu) << 12) | ((cont(2) & 0x3Fu) << 6) | (cont(3) & 0x3Fu);
        width = 4;
    }
    index += width;
    return cp;
}

std::string truncate_utf8(const std::string& text, std::size_t max_codepoints) {
    std::size_t index = 0;
    std::size_t count = 0;
    std::size_t cut = 0;
    bool truncated = false;
    while (index < text.size()) {
        next_codepoint(text, index);
        ++count;
        if (count > max_codepoints) {
            truncated = true;
            break;
        }
        cut = index;
    }
    if (!truncated) {
        return text;
    }
    return text.substr(0, cut) + "...";
}

// One loaded face: the TTF bytes must outlive the stbtt_fontinfo (it points
// into them), so both live in this static holder.
struct Face {
    std::vector<unsigned char> data;
    stbtt_fontinfo info{};
    bool ok = false;

    bool load(const std::filesystem::path& path) {
        std::ifstream stream(path, std::ios::binary);
        if (!stream) {
            return false;
        }
        data.assign(std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>());
        stream.close();
        if (data.empty()) {
            return false;
        }
        const int offset = stbtt_GetFontOffsetForIndex(data.data(), 0);
        if (offset < 0 || !stbtt_InitFont(&info, data.data(), offset)) {
            data.clear();
            return false;
        }
        ok = true;
        return true;
    }
};

struct FontSet {
    Face regular;
    Face bold;
    bool ready = false;

    explicit FontSet(const std::filesystem::path& fonts_dir) {
        // Try the bundle first, then common OS font locations so an exotic
        // packaging slip still yields readable text where possible.
        const std::filesystem::path candidates_regular[] = {
            fonts_dir / "DejaVuSans.ttf",
#ifdef _WIN32
            std::filesystem::path("C:/Windows/Fonts/segoeui.ttf"),
#else
            std::filesystem::path("/System/Library/Fonts/Helvetica.ttc"),
            std::filesystem::path("/Library/Fonts/Arial.ttf"),
#endif
        };
        const std::filesystem::path candidates_bold[] = {
            fonts_dir / "DejaVuSans-Bold.ttf",
#ifdef _WIN32
            std::filesystem::path("C:/Windows/Fonts/segoeuib.ttf"),
#else
            std::filesystem::path("/System/Library/Fonts/Helvetica.ttc"),
            std::filesystem::path("/Library/Fonts/Arial Bold.ttf"),
#endif
        };
        for (const auto& candidate : candidates_regular) {
            if (regular.load(candidate)) {
                break;
            }
        }
        for (const auto& candidate : candidates_bold) {
            if (bold.load(candidate)) {
                break;
            }
        }
        if (!regular.ok && bold.ok) {
            // Reuse the bold bytes as the regular face rather than losing text.
            regular.data = bold.data;
            regular.ok = stbtt_InitFont(&regular.info, regular.data.data(), stbtt_GetFontOffsetForIndex(regular.data.data(), 0)) != 0;
        }
        ready = regular.ok;
    }
};

FontSet& fonts_for(const std::filesystem::path& fonts_dir) {
    // Magic static: thread-safe init, fonts load once per process even with
    // multithreaded rendering. The path is stable for the plugin's lifetime.
    static FontSet fonts(fonts_dir);
    return fonts;
}

// ---------------------------------------------------------------------------
// Surface access

struct Surface {
    unsigned char* bytes = nullptr;
    float* floats = nullptr;
    std::int64_t row_bytes = 0;
    int width = 0;
    int height = 0;
    int channels = 4;
    bool is_float = false;
};

inline void blend_pixel(Surface& s, int x, int y, float r, float g, float b, float a) {
    if (a <= 0.0f || x < 0 || y < 0 || x >= s.width || y >= s.height) {
        return;
    }
    const std::int64_t offset = static_cast<std::int64_t>(y) * s.row_bytes +
                                static_cast<std::int64_t>(x) * (s.is_float ? 4 : s.channels);
    const int comps = std::min(s.channels, 3);
    if (s.is_float) {
        float* px = s.floats + offset / 4;
        for (int c = 0; c < comps; ++c) {
            px[c] += (r - px[c]) * a;
        }
    } else {
        unsigned char* px = s.bytes + offset;
        const unsigned char nr = static_cast<unsigned char>(r * 255.0f + 0.5f);
        const unsigned char ng = static_cast<unsigned char>(g * 255.0f + 0.5f);
        const unsigned char nb = static_cast<unsigned char>(b * 255.0f + 0.5f);
        if (comps >= 3) {
            px[0] = static_cast<unsigned char>(px[0] + (nr - px[0]) * a);
            px[1] = static_cast<unsigned char>(px[1] + (ng - px[1]) * a);
            px[2] = static_cast<unsigned char>(px[2] + (nb - px[2]) * a);
        } else {
            const unsigned char v = static_cast<unsigned char>((r * 0.299f + g * 0.587f + b * 0.114f) * 255.0f + 0.5f);
            px[0] = static_cast<unsigned char>(px[0] + (v - px[0]) * a);
        }
        // Alpha channel (channel 4) is deliberately untouched: the card must
        // not punch holes in the matte the user is auditioning.
    }
}

inline void fill_rect(Surface& s, int x0, int y0, int x1, int y1, float r, float g, float b, float a) {
    for (int y = std::max(y0, 0); y < std::min(y1, s.height); ++y) {
        for (int x = std::max(x0, 0); x < std::min(x1, s.width); ++x) {
            blend_pixel(s, x, y, r, g, b, a);
        }
    }
}

// ---------------------------------------------------------------------------
// Text

struct TextStyle {
    float r, g, b, alpha;
};

float text_width(Face& face, float scale, const std::string& text) {
    float width = 0.0f;
    std::size_t index = 0;
    while (index < text.size()) {
        int advance = 0;
        int lsb = 0;
        stbtt_GetCodepointHMetrics(&face.info, static_cast<int>(next_codepoint(text, index)), &advance, &lsb);
        width += advance * scale;
    }
    return width;
}

void draw_text(Surface& s, Face& face, float scale, int pen_x, int baseline_y, const std::string& text,
               const TextStyle& style) {
    int x = pen_x;
    std::size_t index = 0;
    while (index < text.size()) {
        const std::uint32_t cp = next_codepoint(text, index);
        // NOTE (v0.2.1): stbtt_GetCodepointBitmapSubpixel's out-params are
        // (width, height, xoffset, yoffset) — NOT (x, y, w, h). v0.2 passed
        // them in (x,y,w,h) order, so the loop bound (gh) received the glyph
        // yoffset (negative), the row loop never ran, and every glyph rendered
        // as nothing — the "blank download card" bug.
        int gw = 0;
        int gh = 0;
        int gxo = 0;
        int gyo = 0;
        unsigned char* bitmap =
            stbtt_GetCodepointBitmapSubpixel(&face.info, scale, scale, 0.0f, 0.0f, static_cast<int>(cp), &gw, &gh, &gxo, &gyo);
        if (bitmap) {
            const int gx = x + gxo;
            const int gy = baseline_y + gyo;
            for (int row = 0; row < gh; ++row) {
                for (int col = 0; col < gw; ++col) {
                    const unsigned char coverage = bitmap[row * gw + col];
                    if (coverage) {
                        blend_pixel(s, gx + col, gy + row, style.r, style.g, style.b,
                                    style.alpha * (coverage / 255.0f));
                    }
                }
            }
            stbtt_FreeBitmap(bitmap, nullptr);
        }
        int advance = 0;
        int lsb = 0;
        stbtt_GetCodepointHMetrics(&face.info, static_cast<int>(cp), &advance, &lsb);
        x += static_cast<int>(advance * scale + 0.5f);
    }
}

// ---------------------------------------------------------------------------
// Card model

struct CardLine {
    std::string text;
    float size = 16.0f;
    bool bold = false;
    TextStyle style{};
};

TextStyle style_body(bool is_float) {
    return is_float ? TextStyle{0.86f, 0.86f, 0.88f, 1.0f} : TextStyle{0.93f, 0.93f, 0.95f, 1.0f};
}
TextStyle style_muted(bool is_float) {
    return is_float ? TextStyle{0.55f, 0.55f, 0.58f, 1.0f} : TextStyle{0.72f, 0.72f, 0.74f, 1.0f};
}
TextStyle style_title(bool is_float) {
    return is_float ? TextStyle{0.92f, 0.92f, 0.95f, 1.0f} : TextStyle{1.0f, 1.0f, 1.0f, 1.0f};
}
TextStyle style_error(bool is_float) {
    return is_float ? TextStyle{0.95f, 0.32f, 0.30f, 1.0f} : TextStyle{1.0f, 0.42f, 0.40f, 1.0f};
}

void build_card_lines(const app::ModelPackProgress& progress, const std::filesystem::path& models_dir,
                      bool is_float, std::vector<CardLine>& lines) {
    const float base = 1.0f;  // scaled by caller against base_px
    auto body = style_body(is_float);
    auto muted = style_muted(is_float);
    auto title = style_title(is_float);
    auto error = style_error(is_float);

    if (progress.phase == app::ModelPackPhase::Failed) {
        lines.push_back({"CORRIDORKEY 2.0 — MODEL DOWNLOAD FAILED", base * 1.25f, true, error});
        const std::string detail = progress.detail.empty() ? "Unknown download error." : progress.detail;
        lines.push_back({truncate_utf8(detail, 84), base * 0.85f, false, body});
        lines.push_back({"Check your internet connection. The download retries", base, false, body});
        lines.push_back({"automatically when you re-open the clip or restart Resolve.", base, false, body});
        lines.push_back({"You can also copy the model pack manually into:", base * 0.8f, false, muted});
        lines.push_back({truncate_utf8(models_dir.string(), 92), base * 0.75f, false, muted});
        return;
    }

    lines.push_back({"CORRIDORKEY 2.0 — BMT BUILD", base * 1.25f, true, title});
    lines.push_back({"The CorridorKey models are not on this system yet.", base * 1.05f, false, body});
    lines.push_back({"They are downloading automatically. This only happens once.", base, false, body});
    std::string current = progress.current_file.empty() ? "Starting download..."
                                                        : truncate_utf8(progress.current_file, 72);
    lines.push_back({"Now: " + current, base * 0.8f, false, muted});
    lines.push_back({"The effect stays locked while the models download.", base * 0.9f, false, muted});
    lines.push_back({"Keep Resolve open — the effect unlocks by itself.", base * 0.9f, false, muted});
}

std::string bar_label(const app::ModelPackProgress& progress) {
    if (progress.phase == app::ModelPackPhase::Failed) {
        return "download failed";
    }
    int percent = 0;
    if (progress.bytes_total > 0) {
        percent = static_cast<int>((progress.bytes_done * 100ULL) / progress.bytes_total);
    } else if (progress.percent > 0) {
        percent = progress.percent / 10;
    }
    std::string label = std::to_string(percent) + "%";
    if (progress.bytes_total > 0) {
        label += "  ·  " + format_bytes(progress.bytes_done) + " of " + format_bytes(progress.bytes_total);
    }
    if (progress.total_files > 0) {
        label += "  ·  file " + std::to_string(std::max(progress.completed_files, 0) + 1) + "/" +
                 std::to_string(progress.total_files);
    }
    return label;
}

void draw_strip_fallback(Surface& s, const app::ModelPackProgress& progress) {
    // No usable fonts: full-width bar pinned to the bottom so the user can
    // still tell the plugin is downloading rather than hung.
    const int bar_h = std::max(6, s.height / 60);
    const int y0 = s.height - bar_h * 2;
    fill_rect(s, 0, y0, s.width, y0 + bar_h, 0.05f, 0.05f, 0.06f, 0.85f);
    const double ratio = progress.phase == app::ModelPackPhase::Failed
                             ? 1.0
                             : (progress.bytes_total > 0
                                    ? static_cast<double>(progress.bytes_done) / static_cast<double>(progress.bytes_total)
                                    : static_cast<double>(progress.percent) / 1000.0);
    const int fill_w = static_cast<int>(ratio * s.width);
    if (progress.phase == app::ModelPackPhase::Failed) {
        fill_rect(s, 0, y0, fill_w, y0 + bar_h, 0.85f, 0.20f, 0.18f, 0.95f);
    } else {
        fill_rect(s, 0, y0, fill_w, y0 + bar_h, 0.16f, 0.45f, 0.95f, 0.95f);
    }
}

}  // namespace

void draw_model_pack_overlay(void* output_data,
                             std::int64_t output_row_bytes,
                             int width,
                             int height,
                             const std::string& bit_depth,
                             const app::ModelPackProgress& progress,
                             const std::filesystem::path& models_dir,
                             const std::filesystem::path& fonts_dir) {
    if (!output_data || width <= 0 || height <= 0 || output_row_bytes <= 0) {
        return;
    }
    Surface surface;
    surface.bytes = static_cast<unsigned char*>(output_data);
    surface.floats = static_cast<float*>(output_data);
    surface.row_bytes = output_row_bytes;
    surface.width = width;
    surface.height = height;
    surface.is_float = bit_depth == kOfxBitDepthFloat;
    const int bytes_per_component = surface.is_float ? 4 : 1;
    // Derive channel count from the row stride (tolerant of trailing padding).
    int channels = static_cast<int>(output_row_bytes / (static_cast<std::int64_t>(width) * bytes_per_component));
    if (channels < 1) {
        channels = 1;
    }
    if (channels > 4) {
        channels = 4;  // planar or exotic stride: only RGB(A) interleaved is supported
    }
    surface.channels = channels;

    FontSet& fonts = fonts_for(fonts_dir);
    if (!fonts.ready) {
        draw_strip_fallback(surface, progress);
        return;
    }

    const float base_px = std::clamp(static_cast<float>(height) * 0.030f, 12.0f, 44.0f);
    std::vector<CardLine> lines;
    build_card_lines(progress, models_dir, surface.is_float, lines);

    // Measure.
    float line_height_total = 0.0f;
    float max_width = 0.0f;
    std::vector<float> scales;
    scales.reserve(lines.size());
    for (const auto& line : lines) {
        Face& face = line.bold ? fonts.bold : fonts.regular;
        if (!face.ok) {
            face = fonts.regular;
        }
        const float scale = stbtt_ScaleForPixelHeight(&face.info, line.size * base_px);
        scales.push_back(scale);
        max_width = std::max(max_width, text_width(face, scale, line.text));
        int ascent = 0;
        int descent = 0;
        int line_gap = 0;
        stbtt_GetFontVMetrics(&face.info, &ascent, &descent, &line_gap);
        line_height_total += (ascent - descent + line_gap) * scale;
    }

    const float bar_h = base_px * 0.55f;
    const float label_h = base_px * 1.4f;
    const float pad = base_px * 1.1f;
    const float gap = base_px * 0.35f;
    float card_w = max_width + pad * 2.0f;
    float card_h = line_height_total + gap * (lines.size() + 1) + bar_h + label_h + pad * 2.0f;
    card_w = std::min(card_w, static_cast<float>(width) * 0.88f);
    card_h = std::min(card_h, static_cast<float>(height) * 0.92f);
    const int cx0 = static_cast<int>((static_cast<float>(width) - card_w) * 0.5f);
    const int cy0 = static_cast<int>((static_cast<float>(height) - card_h) * 0.5f);

    // Card background + hairline border.
    if (surface.is_float) {
        fill_rect(surface, cx0, cy0, cx0 + static_cast<int>(card_w), cy0 + static_cast<int>(card_h), 0.015f, 0.015f,
                  0.020f, 0.84f);
    } else {
        fill_rect(surface, cx0, cy0, cx0 + static_cast<int>(card_w), cy0 + static_cast<int>(card_h), 0.09f, 0.09f,
                  0.12f, 0.86f);
    }
    fill_rect(surface, cx0, cy0, cx0 + static_cast<int>(card_w), cy0 + 1, 0.45f, 0.45f, 0.50f, 0.55f);
    fill_rect(surface, cx0, cy0 + static_cast<int>(card_h) - 1, cx0 + static_cast<int>(card_w),
              cy0 + static_cast<int>(card_h), 0.45f, 0.45f, 0.50f, 0.55f);
    fill_rect(surface, cx0, cy0, cx0 + 1, cy0 + static_cast<int>(card_h), 0.45f, 0.45f, 0.50f, 0.55f);
    fill_rect(surface, cx0 + static_cast<int>(card_w) - 1, cy0, cx0 + static_cast<int>(card_w),
              cy0 + static_cast<int>(card_h), 0.45f, 0.45f, 0.50f, 0.55f);

    // Text lines.
    float pen_y = cy0 + pad;
    for (std::size_t i = 0; i < lines.size(); ++i) {
        Face& face = lines[i].bold && fonts.bold.ok ? fonts.bold : fonts.regular;
        const float scale = scales[i];
        int ascent = 0;
        int descent = 0;
        int line_gap = 0;
        stbtt_GetFontVMetrics(&face.info, &ascent, &descent, &line_gap);
        const float line_h = (ascent - descent + line_gap) * scale;
        draw_text(surface, face, scale, cx0 + static_cast<int>(pad),
                  static_cast<int>(pen_y + ascent * scale), lines[i].text, lines[i].style);
        pen_y += line_h + gap;
    }

    // Progress bar.
    const int bar_x0 = cx0 + static_cast<int>(pad);
    const int bar_x1 = cx0 + static_cast<int>(card_w) - static_cast<int>(pad);
    const int bar_y0 = static_cast<int>(pen_y);
    const int bar_y1 = bar_y0 + static_cast<int>(bar_h);
    fill_rect(surface, bar_x0, bar_y0, bar_x1, bar_y1, 0.18f, 0.18f, 0.21f, 0.90f);
    double ratio = 0.0;
    if (progress.bytes_total > 0) {
        ratio = static_cast<double>(progress.bytes_done) / static_cast<double>(progress.bytes_total);
    } else {
        ratio = static_cast<double>(progress.percent) / 1000.0;
    }
    ratio = std::clamp(ratio, 0.0, 1.0);
    const int fill_x1 = bar_x0 + static_cast<int>(ratio * (bar_x1 - bar_x0));
    if (progress.phase == app::ModelPackPhase::Failed) {
        fill_rect(surface, bar_x0, bar_y0, fill_x1, bar_y1, 0.85f, 0.20f, 0.18f, 0.95f);
    } else {
        fill_rect(surface, bar_x0, bar_y0, fill_x1, bar_y1, 0.16f, 0.45f, 0.95f, 0.95f);
    }
    fill_rect(surface, bar_x0, bar_y1, bar_x1, bar_y1 + 1, 0.45f, 0.45f, 0.50f, 0.55f);
    fill_rect(surface, bar_x0, bar_y0 - 1, bar_x1, bar_y0, 0.45f, 0.45f, 0.50f, 0.55f);

    // Bar label.
    Face& label_face = fonts.regular;
    const float label_scale = stbtt_ScaleForPixelHeight(&label_face.info, base_px * 0.95f);
    const std::string label = bar_label(progress);
    int ascent = 0;
    int descent = 0;
    int line_gap = 0;
    stbtt_GetFontVMetrics(&label_face.info, &ascent, &descent, &line_gap);
    draw_text(surface, label_face, label_scale, bar_x0, bar_y1 + static_cast<int>(base_px * 0.35f + ascent * label_scale),
              label, style_body(surface.is_float));
}

}  // namespace corridorkey::ofx
