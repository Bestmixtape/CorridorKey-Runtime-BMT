// stb_truetype sanity probe against the bundled DejaVu font.
#include <cstdio>
#include <fstream>
#include <iterator>
#include <vector>
#define STB_TRUETYPE_IMPLEMENTATION
#include "stb_truetype.h"

int main() {
    std::ifstream f("C:/hermes-files/corridorkey/CorridorKey-Runtime/third_party/fonts/DejaVuSans.ttf", std::ios::binary);
    std::vector<unsigned char> data((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    std::printf("file bytes=%zu\n", data.size());
    stbtt_fontinfo info{};
    int off = stbtt_GetFontOffsetForIndex(data.data(), 0);
    std::printf("font offset=%d init=%d\n", off, stbtt_InitFont(&info, data.data(), off));
    int asc = 0, desc = 0, gap = 0;
    stbtt_GetFontVMetrics(&info, &asc, &desc, &gap);
    std::printf("vmetrics asc=%d desc=%d gap=%d\n", asc, desc, gap);
    std::printf("index('A')=%d index(' ')=%d\n", stbtt_FindGlyphIndex(&info, 'A'), stbtt_FindGlyphIndex(&info, ' '));
    int adv = 0, lsb = 0;
    stbtt_GetCodepointHMetrics(&info, 'A', &adv, &lsb);
    std::printf("advance('A')=%d\n", adv);
    float scale = stbtt_ScaleForPixelHeight(&info, 32.0f);
    std::printf("scale=%f\n", scale);
    int x0 = 0, y0 = 0, gw = 0, gh = 0;
    unsigned char* bmp = stbtt_GetCodepointBitmapSubpixel(&info, scale, scale, 0.f, 0.f, 'A', &x0, &y0, &gw, &gh);
    std::printf("bitmap('A') ptr=%p x0=%d y0=%d w=%d h=%d\n", (void*)bmp, x0, y0, gw, gh);
    if (bmp) {
        int nonzero = 0;
        for (int i = 0; i < gw * gh; ++i) if (bmp[i]) ++nonzero;
        std::printf("coverage nonzero=%d\n", nonzero);
    }
    return 0;
}
