#include "matte_png.hpp"

#include <png.h>

#include <cstdio>
#include <csetjmp>
#include <memory>
#include <vector>

// NOLINTBEGIN(cppcoreguidelines-avoid-magic-numbers,readability-magic-numbers,concurrency-mt-unsafe,cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,cppcoreguidelines-owning-memory,cert-err33-c,modernize-use-integer-sign-comparison,readability-identifier-naming,cppcoreguidelines-pro-type-cstyle-cast)
//
// matte_png.cpp tidy-suppression rationale.
//
// libpng's canonical C idiom (setjmp longjmp error trap + create/destroy
// round-trips + raw png_byte pointers for the row table) fights the usual
// ownership/bounds tidy checks; the code below keeps the documented libpng
// sequence intact rather than wrapping every step in a bespoke RAII shim.
// All destructor-bearing locals are declared *before* the setjmp so MSVC
// C4611 (setjmp/destructor interaction, fatal under /WX) cannot fire.

namespace corridorkey {
namespace {

// RAII guard for the libpng write struct pair. Constructed before setjmp():
// a libpng longjmp returns through the setjmp branch, and this guard's
// destructor then runs on the normal function-exit path.
struct PngWriteGuard {
    png_structp png = nullptr;
    png_infop info = nullptr;
    PngWriteGuard() = default;
    PngWriteGuard(const PngWriteGuard&) = delete;
    PngWriteGuard& operator=(const PngWriteGuard&) = delete;
    ~PngWriteGuard() {
        if (png != nullptr) {
            png_destroy_write_struct(&png, info != nullptr ? &info : nullptr);
        }
    }
};

}  // namespace

// POD-only helper that owns the libpng setjmp()/write sequence. Kept separate
// from write_matte_png_16 so MSVC C4611 (destructor-bearing locals at setjmp,
// fatal under /WX) cannot fire: every RAII owner lives in the caller.
// Returns 0 on success, nonzero if libpng longjmp'd.
#pragma warning(push)
#pragma warning(disable : 4611)  // safe: no destructor-bearing local is constructed
                                 // between setjmp and the guarded writes below; all
                                 // RAII owners live in the caller and outlive this frame.
static int png_write_guarded(png_structp png, png_infop info, std::FILE* handle,
                             png_bytep* rows, unsigned width, unsigned height) {
    if (setjmp(png_jmpbuf(png))) {
        return 1;
    }
    png_init_io(png, handle);
    png_set_IHDR(png, info, static_cast<png_uint_32>(width), static_cast<png_uint_32>(height), 16,
                 PNG_COLOR_TYPE_GRAY, PNG_INTERLACE_NONE, PNG_COMPRESSION_TYPE_DEFAULT,
                 PNG_FILTER_TYPE_DEFAULT);
    png_set_rows(png, info, rows);
    png_write_png(png, info, PNG_TRANSFORM_IDENTITY, nullptr);
    return 0;
}
#pragma warning(pop)

Result<void> write_matte_png_16(const std::filesystem::path& path, int width, int height,
                                const uint16_t* gray, std::size_t row_stride_values) {
    if (width <= 0 || height <= 0 || gray == nullptr ||
        row_stride_values < static_cast<std::size_t>(width)) {
        return Unexpected(
            Error{ErrorCode::InvalidParameters, "write_matte_png_16: invalid dimensions or null plane"});
    }

    std::error_code dir_error;
    if (path.has_parent_path()) {
        std::filesystem::create_directories(path.parent_path(), dir_error);
    }

    // _wfopen keeps non-ASCII clip names working on Windows; path.string()
    // would mangle them under the active code page.
    std::FILE* handle = nullptr;
#ifdef _WIN32
    handle = _wfopen(path.wstring().c_str(), L"wb");
#else
    handle = std::fopen(path.string().c_str(), "wb");
#endif
    if (handle == nullptr) {
        return Unexpected(Error{ErrorCode::IoError, "write_matte_png_16: cannot open output file"});
    }
    std::unique_ptr<std::FILE, int (*)(std::FILE*)> file_owner(handle, std::fclose);

    PngWriteGuard png_guard;
    png_guard.png = png_create_write_struct(PNG_LIBPNG_VER_STRING, nullptr, nullptr, nullptr);
    if (png_guard.png == nullptr) {
        return Unexpected(
            Error{ErrorCode::IoError, "write_matte_png_16: png_create_write_struct"});
    }
    png_guard.info = png_create_info_struct(png_guard.png);
    if (png_guard.info == nullptr) {
        return Unexpected(Error{ErrorCode::IoError, "write_matte_png_16: png_create_info_struct"});
    }

// Row table prepared before setjmp so no destructor-bearing locals are
    // introduced between setjmp() and the error return. MSVC C4611 warns for
    // ANY destructor-bearing local in scope at a setjmp() call, so the guarded
    // write lives in a POD-only helper where the warning cannot fire; the
    // guard/file owners above still run normally on both return paths.
    std::vector<png_bytep> rows(static_cast<std::size_t>(height));
    for (int y = 0; y < height; ++y) {
        // libpng consumes 16-bit samples in native byte order and swaps to
        // the big-endian PNG layout itself (no PNG_TRANSFORM_* needed).
        rows[static_cast<std::size_t>(y)] = const_cast<png_bytep>(reinterpret_cast<const png_byte*>(
            gray + static_cast<std::size_t>(y) * row_stride_values));
    }

    if (png_write_guarded(png_guard.png, png_guard.info, handle, rows.data(),
                          static_cast<unsigned>(width), static_cast<unsigned>(height)) != 0) {
        return Unexpected(Error{ErrorCode::IoError, "write_matte_png_16: libpng write failed"});
    }

    return {};
}

}  // namespace corridorkey
// NOLINTEND(cppcoreguidelines-avoid-magic-numbers,readability-magic-numbers,concurrency-mt-unsafe,cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,cppcoreguidelines-owning-memory,cert-err33-c,modernize-use-integer-sign-comparison,readability-identifier-naming,cppcoreguidelines-pro-type-cstyle-cast)
