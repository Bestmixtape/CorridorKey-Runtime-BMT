// BMT Build: macOS native save panel for matte export sequence.
// Uses AppKit NSSavePanel on the main queue to prompt the user for a
// destination file name. The dialog runs synchronously on the main thread
// (dispatch_sync) because OFX instanceChanged actions are already on the
// host's main thread, but we defensively dispatch to the main queue to
// satisfy AppKit's thread requirements.
//
// Exposed as extern "C" so the C++ OFX plugin can call it without Objective-C++
// in the main translation unit. The .mm file is compiled as Objective-C++ and
// linked into the corridorkey_ofx target on Apple platforms only.

#import <Cocoa/Cocoa.h>
#include <dispatch/dispatch.h>
#include <cstring>
#include <string>
#import <UniformTypeIdentifiers/UTType.h>

extern "C" bool bmt_matte_native_save_panel(const char* default_name_utf8,
                                            char* out_path_utf8,
                                            int out_capacity) {
    if (default_name_utf8 == nullptr || out_path_utf8 == nullptr ||
        out_capacity <= 0) {
        return false;
    }

    // NSSavePanel must be used on the main thread. OFX instanceChanged is
    // called on the host's main thread, but we dispatch_sync to the main
    // queue as a defensive measure in case the host calls from a background
    // thread (rare but possible).
    __block bool result = false;
    __block std::string chosen_path;

    dispatch_sync(dispatch_get_main_queue(), ^{
        NSSavePanel* panel = [NSSavePanel savePanel];
        [panel setTitle:@"Export Matte Sequence"];
        [panel setNameFieldStringValue:
            [NSString stringWithUTF8String:default_name_utf8]];
        // UTType-based filter on macOS 11+; allowedFileTypes is deprecated
        // and would be fatal under -Werror if referenced unguarded.
        if (__builtin_available(macOS 11.0, *)) {
            panel.allowedContentTypes =
                @[[UTType typeWithIdentifier:@"public.png"]];
        } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
            panel.allowedFileTypes = @[@"png"];
#pragma clang diagnostic pop
        }
        [panel setAllowsOtherFileTypes:NO];
        [panel setCanCreateDirectories:YES];
        [panel setShowsTagField:NO];
        [panel setExtensionHidden:NO];
        [panel setPrompt:@"Export"];

        NSInteger response = [panel runModal];
        if (response == NSModalResponseOK) {
            NSURL* url = [panel URL];
            if (url != nil) {
                NSString* path_str = [url path];
                chosen_path = [path_str UTF8String];
                result = true;
            }
        }
    });

    if (result) {
        if (static_cast<int>(chosen_path.size()) + 1 <= out_capacity) {
            std::strcpy(out_path_utf8, chosen_path.c_str());
            return true;
        }
        // Buffer too small.
        return false;
    }

    return false;
}