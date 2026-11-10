// Probe several TTFs to find ones stb_truetype v1.26 can actually rasterize.
#include <cstdio>
#include <fstream>
#include <iterator>
#include <vector>
#define STB_TRUETYPE_IMPLEMENTATION
#include "stb_truetype.h"

static void probe(const char* path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) { std::printf("%-70s OPEN_FAIL\n", path); return; }
    std::vector<unsigned char> data((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    stbtt_fontinfo info{};
    int off = stbtt_GetFontOffsetForIndex(data.data(), 0);
    if (off < 0 || !stbtt_InitFont(&info, data.data(), off)) {
        std::printf("%-70s INIT_FAIL\n", path); return;
    }
    float scale = stbtt_ScaleForPixelHeight(&info, 32.0f);
    int x0=0,y0=0,w=0,h=0;
    unsigned char* bmp = stbtt_GetCodepointBitmapSubpixel(&info, scale, scale, 0.f, 0.f, 'A', &x0,&y0,&w,&h);
    int nonzero = 0;
    if (bmp) { for (int i=0;i<w*h;++i) if (bmp[i]) ++nonzero; }
    std::printf("%-70s w=%d h=%d nonzero=%d\n", path, w, h, nonzero);
}

int main() {
    probe("C:/hermes-files/corridorkey/CorridorKey-Runtime/third_party/fonts/DejaVuSans.ttf");
    probe("C:/Windows/Fonts/segoeui.ttf");
    probe("C:/Windows/Fonts/arial.ttf");
    probe("C:/Windows/Fonts/verdana.ttf");
    probe("C:/Windows/Fonts/tahoma.ttf");
    probe("C:/Windows/Fonts/times.ttf");
    probe("C:/Windows/Fonts/lucon.ttf");
    return 0;
}
