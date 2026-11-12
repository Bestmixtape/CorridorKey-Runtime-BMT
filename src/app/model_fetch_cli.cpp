// corridorkey_model_fetch — BMT v0.3 installer-side model pack fetcher.
//
// Runs the full model pack verification/download exactly once, for a caller-
// supplied destination directory, and reports machine-readable progress on
// stdout so installers (Windows Setup wizard page, macOS installer app) can
// drive a progress bar during installation instead of the OFX plugin fetching
// models on first use.
//
// stdout protocol (unbuffered, one line per event):
//   PLAN files=<n> bytes=<total>                  (emitted before downloads)
//   PROGRESS file <i>/<n> name=<file> bytes <done>/<total> percent <0-100>
//   DONE ok=<0|1> downloaded=<k> [error=<sanitized>] [url=<retry-url>]
// Exit code 0 on success, 1 on fetch failure, 2 on usage error.

#include "app/model_fetch.hpp"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <string>
#include <algorithm>
#include <thread>

#ifdef _WIN32
// BMT v0.3: the Windows Setup wizard cannot host a live progress bar while it
// blocks in Exec(), so the helper owns a tiny native progress window instead
// (progress messages are sent from the poller thread; SendMessage marshals
// them to the window thread). macOS uses the Swift installer app's own
// NSProgressIndicator fed through the same stdout protocol instead.
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <commctrl.h>
#pragma comment(lib, "comctl32.lib")

namespace ui {

HWND g_bar = nullptr;
HWND g_file_label = nullptr;
HWND g_bytes_label = nullptr;

LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM w, LPARAM l) {
    if (msg == WM_CLOSE || msg == WM_DESTROY) {
        PostQuitMessage(0);
        return 0;
    }
    // DefWindowProcW, NOT the DefWindowProc macro: this target does not
    // define UNICODE, so the macro binds the ANSI thunk, whose CREATESTRUCT
    // conversion truncates the wide window title at its first embedded NUL
    // (the caption rendered as just "C" in v0.3.1 — reproduced live).
    return DefWindowProcW(hwnd, msg, w, l);
}

bool g_visible = false;

bool show(const wchar_t* title) {
    INITCOMMONCONTROLSEX icc{sizeof(icc), ICC_PROGRESS_CLASS | ICC_STANDARD_CLASSES};
    InitCommonControlsEx(&icc);
    const wchar_t* cls = L"CorridorKeyModelFetchUI";
    WNDCLASSW wc{};
    wc.lpfnWndProc = WindowProc;
    wc.hInstance = GetModuleHandle(nullptr);
    wc.lpszClassName = cls;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    static bool registered = false;
    if (!registered) {
        if (RegisterClassW(&wc) == 0) {
            return false;
        }
        registered = true;
    }
    const int w = 520;
    const int h = 190;
    const int x = (GetSystemMetrics(SM_CXSCREEN) - w) / 2;
    const int y = (GetSystemMetrics(SM_CYSCREEN) - h) / 3;
    // Created WS_VISIBLE, but the startup-flag override below is what really
    // guarantees visibility (see the post-creation block).
    HWND hwnd = CreateWindowExW(WS_EX_APPWINDOW, cls, title,
                                WS_CAPTION | WS_SYSMENU | WS_VISIBLE, x, y, w, h,
                                nullptr, nullptr, wc.hInstance, nullptr);
    if (hwnd == nullptr) {
        return false;
    }
    // Inno's Exec starts us with STARTF_USESHOWWINDOW + SW_HIDE, and Windows
    // applies that startup flag to the FIRST window shown -- overriding even
    // WS_VISIBLE at creation. The startup flag only overrides the first
    // ShowWindow call, so force-show twice: the first is swallowed, the
    // second actually displays the window. SWP_SHOWWINDOW bypasses the rule
    // as well; belt and braces.
    ShowWindow(hwnd, SW_SHOW);
    ShowWindow(hwnd, SW_SHOW);
    SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    SetForegroundWindow(hwnd);
    BringWindowToTop(hwnd);
    UpdateWindow(hwnd);
    HFONT font = static_cast<HFONT>(GetStockObject(DEFAULT_GUI_FONT));
    g_file_label = CreateWindowExW(0, L"STATIC", L"Preparing...",
        WS_CHILD | WS_VISIBLE, 18, 18, w - 36, 22, hwnd, nullptr, wc.hInstance, nullptr);
    g_bar = CreateWindowExW(0, PROGRESS_CLASSW, L"",
        WS_CHILD | WS_VISIBLE | PBS_SMOOTH, 18, 52, w - 36, 24, hwnd, nullptr, wc.hInstance, nullptr);
    g_bytes_label = CreateWindowExW(0, L"STATIC", L"",
        WS_CHILD | WS_VISIBLE, 18, 88, w - 36, 40, hwnd, nullptr, wc.hInstance, nullptr);
    SendMessageW(g_bar, PBM_SETRANGE32, 0, 1000);
    SendMessageW(g_bar, PBM_SETPOS, 0, 0);
    SendMessageW(g_file_label, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
    SendMessageW(g_bytes_label, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
    // Raise above the Setup wizard (visibility was already forced above).
    SetForegroundWindow(hwnd);
    BringWindowToTop(hwnd);
    UpdateWindow(hwnd);
    g_visible = true;
    return true;
}

void pump_until_done(const std::atomic<bool>& fetch_done) {
    // The window thread must pump messages for repaints and for the poller
    // thread's SendMessage calls; run it while the fetch worker downloads.
    MSG msg{};
    while (!fetch_done.load()) {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) {
                return;
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        Sleep(50);
    }
    if (g_visible) {
        // Final state stays visible for a moment before teardown.
        const ULONGLONG until = GetTickCount64() + 1500;
        while (GetTickCount64() < until) {
            while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
                if (msg.message == WM_QUIT) {
                    return;
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            Sleep(50);
        }
    }
}

// BMT v0.4: the byte-note under the bar differs per fetch flavour
// (v0.3 ONNX pack vs the v0.4 worker stack); default keeps v0.3 wording.
std::wstring g_note = L"  -  approx 2.4 GB total, one-time download";

void set_note(const std::wstring& note) {
    g_note = note;
}

void update(const std::string& file, std::uint64_t done, std::uint64_t total, int percent) {
    if (g_bar == nullptr) {
        return;
    }
    std::wstring wf(file.begin(), file.end());
    std::wstring label = L"Downloading " + wf + L"  (" + std::to_wstring(percent) + L"%)";
    std::wstring mb_done = std::to_wstring(done >> 20);
    std::wstring mb_total = std::to_wstring(total >> 20);
    std::wstring bytes = L"Downloaded: " + mb_done + L" MB of " + mb_total + L" MB" + g_note;
    // Determinate mode: leave any marquee from a status() phase first.
    SendMessageW(g_bar, PBM_SETMARQUEE, FALSE, 0);
    SendMessageW(g_bar, PBM_SETPOS, percent * 10, 0);
    SetWindowTextW(g_file_label, label.c_str());
    SetWindowTextW(g_bytes_label, bytes.c_str());
}

// BMT v0.4: phases without byte progress (Python runtime pip install, torch
// verify) previously left the bar frozen at 0%, which read as a hung Setup.
// status() shows the phase text and animates the bar as indeterminate.
void status(const std::string& text) {
    if (g_file_label == nullptr) {
        return;
    }
    std::wstring wt(text.begin(), text.end());
    SetWindowTextW(g_file_label, wt.c_str());
    if (g_bar != nullptr) {
        SendMessageW(g_bar, PBM_SETMARQUEE, TRUE, 40);
    }
}

void finish(bool ok, const std::string& detail,
            const wchar_t* ok_text = L"Model pack ready - finishing installation") {
    if (g_file_label == nullptr) {
        return;
    }
    if (g_bar != nullptr) {
        SendMessageW(g_bar, PBM_SETMARQUEE, FALSE, 0);
    }
    if (ok) {
        SetWindowTextW(g_file_label, ok_text);
    }
    else {
        std::string text = "Download failed: " + detail;
        std::wstring wt(text.begin(), text.end());
        SetWindowTextW(g_file_label, wt.c_str());
    }
}

}  // namespace ui
#endif  // _WIN32

namespace {

// Newlines/spaces would corrupt the single-line protocol; collapse them.
std::string sanitize(const std::string& text) {
    std::string out;
    out.reserve(text.size());
    for (char c : text) {
        if (c == '\n' || c == '\r' || c == '\t') {
            out.push_back(' ');
        }
        else if (static_cast<unsigned char>(c) >= 32) {
            out.push_back(c);
        }
    }
    for (std::size_t i = 0; i < out.size(); ++i) {
        if (out[i] == ' ') {
            out[i] = '_';
        }
    }
    return out;
}

}  // namespace

int main(int argc, char** argv) {
    using namespace corridorkey::app;

    std::string dest;
    std::vector<ModelTrack> tracks;  // v0.3: full-pack union
    bool worker_mode = false;        // v0.4: CorridorKey 2.0 worker stack
    std::string python_dir;          // v0.4: bundled Python dir for pip setup
    bool show_ui = false;
#ifndef _WIN32
    (void)show_ui;  // native progress window is Windows-only; macOS uses the installer app's own bar
#endif
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--dest" && i + 1 < argc) {
            dest = argv[++i];
        }
        else if (arg == "--worker") {
            worker_mode = true;  // v0.4: ck2-models + pip worker-env instead of v1 packs
        }
        else if (arg == "--python" && i + 1 < argc) {
            python_dir = argv[++i];
        }
        else if (arg == "--track" && i + 1 < argc) {
            const std::string value = argv[++i];
            if (value == "fp16") {
                tracks = {ModelTrack::Fp16};
            }
            else if (value == "fp32") {
                tracks = {ModelTrack::Fp32};
            }
            // Any other value (including legacy platform names) keeps the
            // default full-pack behaviour.
        }
        else if (arg == "--install-ui") {
            show_ui = true;
        }
        else if (arg == "--help" || arg == "-h") {
            std::printf("usage: corridorkey_model_fetch --dest DIR [--track fp16|fp32|both] [--worker [--python DIR]]\n");
            return 2;
        }
    }
    if (dest.empty()) {
        std::fprintf(stderr, "usage: corridorkey_model_fetch --dest DIR [--track fp16|fp32|both] [--worker [--python DIR]]\n");
        std::printf("DONE ok=0 downloaded=0 error=missing_dest\n");
        return 2;
    }

    // Installers read stdout while the process runs: line-buffered would risk
    // a stuck progress bar because of full-buffering on redirected handles.
    std::setvbuf(stdout, nullptr, _IONBF, 0);

    // v0.4: CorridorKey 2.0 worker stack — pinned 2.0 assets from official
    // upstreams + pip setup into the bundled Python (--python DIR). Reuses
    // the same PLAN/PROGRESS/DONE protocol and progress monitor as v0.3.
    if (worker_mode) {
        int worker_plan_files = 0;
        std::uint64_t worker_plan_bytes = 0;
        for (const auto& file : ck2_pack_files()) {
            ++worker_plan_files;
            worker_plan_bytes += file.size_bytes;
        }
        std::printf("PLAN files=%d bytes=%llu\n",
                    worker_plan_files,
                    static_cast<unsigned long long>(worker_plan_bytes));
        std::atomic<bool> worker_stop{false};
        std::thread worker_poller([&]() {
            int last_file = -1;
            std::string last_detail;
            while (!worker_stop.load()) {
                const ModelPackProgress p = model_pack_progress();
                const bool changed =
                    p.completed_files != last_file || p.detail != last_detail;
                if (p.phase == ModelPackPhase::Downloading && changed) {
                    last_file = p.completed_files;
                    last_detail = p.detail;
                    if (!p.detail.empty()) {
#ifdef _WIN32
                        if (show_ui) {
                            ui::status(p.detail);
                        }
#endif
                        std::printf("PROGRESS %s\n", sanitize(p.detail).c_str());
                    }
                    else {
#ifdef _WIN32
                        if (show_ui) {
                            const int overall = p.bytes_total
                                ? static_cast<int>(p.bytes_done * 100 / p.bytes_total)
                                : 0;
                            ui::update(p.current_file, p.bytes_done, p.bytes_total,
                                       overall);
                        }
#endif
                        std::printf("PROGRESS file %d/%d name=%s bytes %llu/%llu percent %d\n",
                                    p.completed_files + 1,
                                    p.total_files,
                                    sanitize(p.current_file).c_str(),
                                    static_cast<unsigned long long>(p.bytes_done),
                                    static_cast<unsigned long long>(p.bytes_total),
                                    p.percent / 10);
                    }
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(200));
            }
        });
        WorkerStackEnsureResult worker_result;
#ifdef _WIN32
        if (show_ui) {
            // BMT v0.4 regression: --install-ui was only wired to the v0.3
            // track fetch, so the worker path ran with NO visible window
            // (Setup's Exec is SW_HIDE) and the wizard looked frozen through
            // the whole multi-GB download plus the silent torch pip step.
            // Mirror the v0.3 shape: fetch on a worker thread, native
            // progress window pumped on the main thread.
            FreeConsole();
            std::atomic<bool> fetch_done{false};
            std::thread fetch([&]() {
                worker_result = ensure_worker_stack(
                    std::filesystem::path(dest), std::filesystem::path(python_dir),
                    "installer-worker-stack-setup");
                worker_stop.store(true);
                ui::finish(worker_result.ok,
                           worker_result.error.empty() ? worker_result.pip_error
                                                       : worker_result.error,
                           L"CorridorKey 2.0 stack ready - finishing installation");
                fetch_done.store(true);
            });
            ui::set_note(L"  -  models ~4.8 GB + Python runtime ~3 GB, one-time download");
            ui::show(L"CorridorKey 2.0 - Downloading models and Python runtime");
            ui::pump_until_done(fetch_done);
            fetch.join();
        }
        else
#endif
        {
            worker_result = ensure_worker_stack(
                std::filesystem::path(dest), std::filesystem::path(python_dir),
                "stdout-worker-stack-setup");
            worker_stop.store(true);
        }
        worker_poller.join();
        if (worker_result.ok) {
            std::printf("DONE ok=1 downloaded=%d pip=%d\n",
                        worker_result.downloaded_files,
                        worker_result.pip_ok ? 1 : 0);
            return 0;
        }
        const std::string worker_error =
            worker_result.error.empty() ? worker_result.pip_error : worker_result.error;
        std::printf("DONE ok=0 downloaded=%d error=%s url=%s\n",
                    worker_result.downloaded_files,
                    sanitize(worker_error).c_str(),
                    sanitize(worker_result.failed_url).c_str());
        return 2;
    }

    // v0.3 default: fetch the COMPLETE pack (both precision tracks) so the
    // plugin never needs to download anything, whatever the user later picks
    // in the OFX panel. Progress is cumulative across tracks: one smooth bar.
    if (tracks.empty()) {
        tracks = {ModelTrack::Fp32, ModelTrack::Fp16};
    }
    std::vector<ModelPackFile> plan;
    for (const auto t : tracks) {
        for (const auto& file : model_pack_files_for_track(t)) {
            if (std::none_of(plan.begin(), plan.end(),
                             [&](const ModelPackFile& e) { return std::string(e.filename) == std::string(file.filename); })) {
                plan.push_back(file);
            }
        }
    }
    const int plan_files = static_cast<int>(plan.size());
    std::uint64_t plan_bytes = 0;
    for (const auto& file : plan) {
        plan_bytes += file.size_bytes;
    }
    std::printf("PLAN files=%d bytes=%llu\n",
                plan_files,
                static_cast<unsigned long long>(plan_bytes));

    // Poll the in-process progress snapshot while ensure_model_pack blocks.
    std::atomic<bool> stop_poller{false};
    std::atomic<std::uint64_t> base_done{0};
    std::thread poller([&]() {
        int last_file = -1;
        std::uint64_t last_bytes = 0;
        while (!stop_poller.load()) {
            const ModelPackProgress p = model_pack_progress();
            const std::uint64_t done = base_done.load() + p.bytes_done;
            const std::uint64_t total = plan_bytes;
            const int percent = total > 0
                                    ? static_cast<int>(done * 1000 / total)
                                    : 0;
#ifdef _WIN32
            if (show_ui && p.phase == ModelPackPhase::Downloading) {
                ui::update(p.current_file, done, total, percent / 10);
            }
#endif
            if (p.phase == ModelPackPhase::Downloading &&
                (p.completed_files != last_file || done + (1u << 20) < last_bytes)) {
                last_file = p.completed_files;
                last_bytes = done;
                std::printf("PROGRESS file %d/%d name=%s bytes %llu/%llu percent %d\n",
                            p.completed_files + 1,
                            p.total_files,
                            sanitize(p.current_file).c_str(),
                            static_cast<unsigned long long>(done),
                            static_cast<unsigned long long>(total),
                            percent / 10);
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
    });

    std::atomic<bool> fetch_done{false};
    ModelPackEnsureResult result;
#ifdef _WIN32
    if (show_ui) {
        // Detach from any console the installer created: the progress window
        // replaces the console stream in this mode.
        FreeConsole();
        // Fetch on a worker thread; the main thread owns the progress window
        // and its message loop (needed for live repaints).
        std::thread fetch([&]() {
            result = ensure_model_pack_tracks(std::filesystem::path(dest), tracks,
                                              "installer-model-pack-fetch");
#ifdef _WIN32
            ui::finish(result.ok, result.error);
#endif
            stop_poller.store(true);
            fetch_done.store(true);
        });
        (void)ui::show(L"CorridorKey 2.0 - Installing model pack");
        ui::pump_until_done(fetch_done);
        fetch.join();
    }
    else
#endif
    {
        result = ensure_model_pack_tracks(std::filesystem::path(dest), tracks,
                                          "installer-model-pack-fetch");
        stop_poller.store(true);
    }
    poller.join();

    if (result.ok) {
        std::printf("DONE ok=1 downloaded=%d\n", result.downloaded_files);
        return 0;
    }
    std::printf("DONE ok=0 downloaded=%d error=%s url=%s\n",
                result.downloaded_files,
                sanitize(result.error).c_str(),
                sanitize(result.failed_url).c_str());
    return 1;
}
