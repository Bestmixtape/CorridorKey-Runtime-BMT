//
// CorridorKey 2.0 BMT Build — macOS installer app (v0.3)
//
// Single-file AppKit program compiled with plain swiftc (no Xcode project):
//
//   xcrun swiftc -O -swift-version 5 -target arm64-apple-macos13 \
//     -framework AppKit main.swift -o ".../Contents/MacOS/CorridorKeyInstaller"
//
// Install flow (mirrors the Windows Inno wizard):
//   Step 1: privileged copy of the bundled CorridorKey-BMT.ofx.bundle into
//           /Library/OFX/Plugins, shelled out through
//           osascript 'do shell script ... with administrator privileges'
//           (GUI admin prompt; no SMJobBless helper).
//   Step 2: per-user model download by launching the bundled
//           corridorkey_model_fetch helper and parsing its unbuffered
//           'PROGRESS file i/n name=NAME bytes DONE/TOTAL' / 'DONE ok=..
//           downloaded=..' lines, driving a determinate NSProgressIndicator.
//

import Cocoa

// MARK: - Fixed contract constants

let kModelPackURL = "https://huggingface.co/nikopueringer/CorridorKey2.0"
let kBundleName   = "CorridorKey-BMT.ofx.bundle"
let kPluginDir    = "/Library/OFX/Plugins"
let kFetchBinary  = "corridorkey_model_fetch"
// v0.4: the fetcher stages the whole CorridorKey 2.0 stack (35 ck2 model/
// weight files + worker sources; pip then fills the bundle's CPython) under
// the user Library worker root — the same layout bmt_worker.py resolves
// (~/Library/Application Support/CorridorKey2.0-BMT/worker).
let kModelSubpath = "Library/Application Support/CorridorKey2.0-BMT/worker"
// CPython the worker env installs into, shipped inside the OFX bundle.
let kRuntimePython = kPluginDir + "/" + kBundleName + "/Contents/MacOS/runtime/python"

// MARK: - Window controller: all UI plus the two install steps

final class InstallerWindowController: NSObject {

    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var progress: NSProgressIndicator!
    private var installButton: NSButton!
    private var uninstallButton: NSButton!
    private var busy = false

    // MARK: Window construction

    func makeWindow() {
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 260),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false)
        w.title = "Install CorridorKey 2.0"
        // We keep the controller alive from AppDelegate, so the window must
        // not be released when the user closes it (avoids a dangling window).
        w.isReleasedWhenClosed = false

        let headline = NSTextField(labelWithString: "CorridorKey 2.0 BMT Build")
        headline.font = NSFont.boldSystemFont(ofSize: 15)
        headline.frame = NSRect(x: 24, y: 214, width: 512, height: 24)

        let desc = NSTextField(wrappingLabelWithString:
            "Step 1 copies the Open FX plug-in into /Library/OFX/Plugins — macOS will ask for an administrator password. Step 2 downloads the full model pack (17 files, ~4.3 GB: MLX weights, per-resolution bridges and hint models) into your user Library, which needs no admin rights. When it finishes, restart DaVinci Resolve and look under Open FX > Keying.")
        desc.font = NSFont.systemFont(ofSize: 11)
        desc.frame = NSRect(x: 24, y: 112, width: 512, height: 90)

        statusLabel = NSTextField(wrappingLabelWithString: "Ready. Click Install to begin.")
        statusLabel.font = NSFont.systemFont(ofSize: 11)
        statusLabel.frame = NSRect(x: 24, y: 56, width: 512, height: 44)

        progress = NSProgressIndicator(frame: NSRect(x: 24, y: 26, width: 360, height: 16))
        progress.isIndeterminate = false
        progress.minValue = 0
        progress.maxValue = 100
        progress.doubleValue = 0
        progress.isDisplayedWhenStopped = true

        installButton = NSButton(frame: NSRect(x: 404, y: 18, width: 132, height: 32))
        installButton.title = "Install"
        installButton.bezelStyle = .rounded
        installButton.target = self
        installButton.action = #selector(installTapped)

        // BMT v0.3.1: the installer doubles as the uninstall entry point
        // (macOS has no Add/Remove programs), matching the Windows wizard's
        // Install-or-Uninstall page.
        uninstallButton = NSButton(frame: NSRect(x: 264, y: 18, width: 132, height: 32))
        uninstallButton.title = "Uninstall"
        uninstallButton.bezelStyle = .rounded
        uninstallButton.target = self
        uninstallButton.action = #selector(uninstallTapped)

        let cv = w.contentView!
        cv.addSubview(headline)
        cv.addSubview(desc)
        cv.addSubview(statusLabel)
        cv.addSubview(progress)
        cv.addSubview(installButton)
        cv.addSubview(uninstallButton)

        window = w
    }

    func show() {
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: Install entry point

    @objc private func installTapped() {
        guard !busy else { return }

        guard let res = Bundle.main.resourceURL else {
            setStatus("Internal error: this app has no Contents/Resources — re-download the DMG.")
            return
        }
        let srcPath = res.appendingPathComponent(kBundleName).path
        let fetchPath = res.appendingPathComponent(kFetchBinary).path
        let fm = FileManager.default
        guard fm.fileExists(atPath: srcPath) else {
            setStatus("Internal error: \(kBundleName) is not inside this installer app. "
                + "Re-download the DMG. Model pack: \(kModelPackURL)")
            return
        }
        guard fm.isExecutableFile(atPath: fetchPath) else {
            setStatus("Internal error: \(kFetchBinary) is not inside this installer app. "
                + "Re-download the DMG.")
            return
        }

        busy = true
        installButton.isEnabled = false
        installButton.title = "Installing…"
        progress.doubleValue = 0
        setStatus("Step 1 of 2: installing the plug-in. Approve the administrator prompt macOS shows…")

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runInstall(srcPath: srcPath, fetchPath: fetchPath)
        }
    }

    private func runInstall(srcPath: String, fetchPath: String) {
        let (copyOK, copyErr) = runPrivilegedCopy(from: srcPath)
        if !copyOK {
            finishWithError(copyErr)
            return
        }
        setStatus("Plug-in copied to \(kPluginDir). Step 2 of 2: downloading the model pack…")
        let outcome = runModelFetch(at: fetchPath)
        if outcome.ok {
            finishWithSuccess(downloadedCount: outcome.downloaded)
        } else {
            finishWithError("The plug-in was installed, but the model download failed: "
                + outcome.message + " Retrying re-runs both steps; the copy is idempotent.")
        }
    }

    // MARK: Step 1 — privileged copy via osascript

    /// Escapes s for embedding inside an AppleScript double-quoted string
    /// literal (only backslash and double quote need escaping there).
    private func appleScriptStringLiteral(_ s: String) -> String {
        var out = "\""
        for ch in s {
            switch ch {
            case "\\": out += "\\\\"
            case "\"": out += "\\\""
            default:   out.append(ch)
            }
        }
        out += "\""
        return out
    }

    /// Builds the osascript source. The shell text is assembled from two
    /// AppleScript string literals with `quoted form of` spliced between
    /// them, so the source path is shell-escaped by AppleScript itself
    /// (single quotes, safe with spaces). `(xattr … || true)` mirrors the
    /// DMG's .command script: clear quarantine so the ad-hoc-signed dylibs
    /// load inside Resolve; never fail the copy over it.
    private func buildAppleScript(srcPath: String) -> String {
        return ""
            + "do shell script \"mkdir -p \(kPluginDir) "
            + "&& rm -rf \(kPluginDir)/\(kBundleName) "
            + "&& cp -R "
            + "& quoted form of " + appleScriptStringLiteral(srcPath) + " "
            + "& \" \(kPluginDir)/ "
            + "&& (xattr -rd com.apple.quarantine \(kPluginDir)/\(kBundleName) || true)\""
            + " with administrator privileges"
    }

    private func runPrivilegedCopy(from srcPath: String) -> (Bool, String) {
        return runPrivilegedScript(buildAppleScript(srcPath: srcPath),
            declined: "Administrator authentication was declined, so the plug-in was not installed.",
            failPrefix: "Plug-in copy failed:")
    }

    /// Runs one osascript 'do shell script … with administrator privileges'
    /// source; shared by install (copy in) and uninstall (rm).
    private func runPrivilegedScript(_ script: String, declined: String, failPrefix: String) -> (Bool, String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        let outPipe = Pipe()
        let errPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = errPipe

        do {
            try process.run()
        } catch {
            return (false, "Could not launch /usr/bin/osascript: \(error.localizedDescription)")
        }
        // Drain both pipes to EOF before waiting, so a chatty osascript can
        // never deadlock on a full pipe buffer.
        let outData = outPipe.fileHandleForReading.readDataToEndOfFile()
        let errData = errPipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        _ = outData

        let errText = String(data: errData, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if process.terminationStatus != 0 {
            if errText.contains("User canceled") || errText.contains("(-128)") {
                return (false, declined)
            }
            let detail = errText.isEmpty
                ? "osascript exited with status \(process.terminationStatus)."
                : errText
            return (false, "\(failPrefix) \(detail)")
        }
        return (true, "")
    }

    // MARK: Uninstall entry point (v0.3.1)

    @objc private func uninstallTapped() {
        guard !busy else { return }
        let alert = NSAlert()
        alert.messageText = "Uninstall CorridorKey 2.0?"
        alert.informativeText =
            "Removes the plug-in from \(kPluginDir) and the downloaded model pack "
            + "(up to ~4.3 GB) from your user Library. macOS will ask for an "
            + "administrator password for the plug-in folder."
        alert.addButton(withTitle: "Uninstall")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        busy = true
        installButton.isEnabled = false
        uninstallButton.isEnabled = false
        setStatus("Uninstalling: deleting the model pack from your user Library (no admin rights needed)…")

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            // Models live under the user's own Library — no privileges needed.
            let packDir = (NSHomeDirectory() as NSString)
                .appendingPathComponent("Library/Application Support/CorridorKey2.0-BMT")
            try? FileManager.default.removeItem(atPath: packDir)
            self.setStatus("Model pack removed. Removing the plug-in from \(kPluginDir)… approve the administrator prompt.")
            let script = "do shell script \"rm -rf "
                + "& quoted form of " + self.appleScriptStringLiteral("\(kPluginDir)/\(kBundleName)")
                + "\" with administrator privileges"
            let (ok, err) = self.runPrivilegedScript(script,
                declined: "Administrator authentication was declined, so the plug-in folder was not removed.",
                failPrefix: "Plug-in removal failed:")
            DispatchQueue.main.async {
                self.busy = false
                self.uninstallButton.isEnabled = true
                self.installButton.isEnabled = true
                self.installButton.title = "Install"
                self.progress.doubleValue = 0
                self.statusLabel.stringValue = ok
                    ? "CorridorKey removed: model pack deleted and plug-in gone from \(kPluginDir)."
                    : "Uninstall incomplete: \(err) (the model pack was already deleted.)"
            }
        }
    }

    // MARK: Step 2 — per-user model fetch, streamed stdout

    private struct FetchOutcome {
        let ok: Bool
        let downloaded: Int
        let message: String
    }

    /// Mutable stream state, boxed in a class so the readability handler,
    /// the serial queue blocks and the final flush all share one copy.
    private final class FetchState {
        var pending = Data()
        var sawDone = false
        var doneOK = false
        var downloaded = 0
    }

    private func runModelFetch(at path: String) -> FetchOutcome {
        let dest = (NSHomeDirectory() as NSString).appendingPathComponent(kModelSubpath)
        try? FileManager.default.createDirectory(atPath: dest,
                                                 withIntermediateDirectories: true)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = ["--dest", dest, "--worker",
                             "--python", kRuntimePython]
        let outPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = Pipe()   // helper's stderr goes to the NullDevice-ish Pipe and is dropped

        let state = FetchState()
        let queue = DispatchQueue(label: "corridorkey.installer.fetch.stdout")

        do {
            try process.run()
        } catch {
            return FetchOutcome(ok: false, downloaded: 0,
                message: "Could not launch \(kFetchBinary): \(error.localizedDescription)")
        }

        outPipe.fileHandleForReading.readabilityHandler = { [state] handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            // All mutation of `state` happens on one serial queue; split on
            // 0x0A bytes (not characters) so a chunk boundary can never cut
            // a multi-byte UTF-8 character mid-line.
            queue.async {
                state.pending.append(chunk)
                while let nl = state.pending.firstIndex(of: 0x0A) {
                    let lineData = state.pending[state.pending.startIndex..<nl]
                    state.pending.removeSubrange(state.pending.startIndex...nl)
                    self.ingest(line: String(decoding: lineData, as: UTF8.self), state: state)
                }
            }
        }

        process.waitUntilExit()
        outPipe.fileHandleForReading.readabilityHandler = nil
        // Flush a final line that arrived without a trailing newline. The
        // serial queue drains queued blocks before this sync block runs.
        queue.sync {
            if !state.pending.isEmpty {
                let line = String(decoding: state.pending, as: UTF8.self)
                state.pending.removeAll(keepingCapacity: false)
                self.ingest(line: line, state: state)
            }
        }

        if !state.sawDone {
            return FetchOutcome(ok: false, downloaded: 0,
                message: "\(kFetchBinary) exited with status \(process.terminationStatus) before printing its DONE line (download interrupted?).")
        }
        if !state.doneOK {
            return FetchOutcome(ok: false, downloaded: state.downloaded,
                message: "The downloader reported a failure after finishing its run.")
        }
        return FetchOutcome(ok: true, downloaded: state.downloaded, message: "")
    }

    /// Routes one protocol line: 'PROGRESS …' drives the bar, 'DONE …'
    /// records the verdict, anything else (banners) is ignored.
    private func ingest(line: String, state: FetchState) {
        let trimmed = line.trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
        if trimmed.isEmpty { return }
        if trimmed.hasPrefix("PROGRESS ") {
            showProgress(trimmed)
        } else if trimmed.hasPrefix("DONE") {
            state.sawDone = true
            for tok in trimmed.split(separator: " ") {
                if tok.hasPrefix("ok=") {
                    state.doneOK = String(tok.dropFirst(3)) == "1"
                } else if tok.hasPrefix("downloaded=") {
                    state.downloaded = Int(String(tok.dropFirst(11))) ?? 0
                }
            }
        }
    }

    /// 'PROGRESS file 2/5 name=models/foo.safetensors bytes 1048576/52428800'
    private func showProgress(_ line: String) {
        let parts = line.split(separator: " ")
        var index = ""
        var name = ""
        var bytes = ""
        var i = 1
        while i < parts.count {
            let tok = parts[i]
            if tok == "file" && i + 1 < parts.count {
                index = String(parts[i + 1])
                i += 1
            } else if tok.hasPrefix("name=") {
                name = String(tok.dropFirst(5))
            } else if tok == "bytes" && i + 1 < parts.count {
                bytes = String(parts[i + 1])
                i += 1
            }
            i += 1
        }
        let pair = bytes.split(separator: "/")
        guard pair.count == 2,
              let done = Int64(String(pair[0])),
              let total = Int64(String(pair[1])), total > 0 else {
            return // malformed line: leave the bar where it is
        }
        let pct = Double(done) / Double(total) * 100.0
        let text = "Downloading \(name) — \(mb(done)) / \(mb(total)) MB  (file \(index))"
        DispatchQueue.main.async {
            self.progress.doubleValue = pct
            self.statusLabel.stringValue = text
        }
    }

    private func mb(_ bytes: Int64) -> String {
        return String(format: "%.1f", Double(bytes) / 1_048_576.0)
    }

    // MARK: Status / completion

    /// Safe from any thread: hops to main before touching the label.
    private func setStatus(_ text: String) {
        if Thread.isMainThread {
            statusLabel.stringValue = text
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.statusLabel.stringValue = text
            }
        }
    }

    private func finishWithError(_ message: String) {
        DispatchQueue.main.async {
            self.progress.doubleValue = 0
            self.statusLabel.stringValue = message + "\nModel pack: " + kModelPackURL
            self.installButton.title = "Retry"
            self.installButton.isEnabled = true
            self.busy = false
        }
    }

    private func finishWithSuccess(downloadedCount: Int) {
        DispatchQueue.main.async {
            self.progress.doubleValue = 100
            self.statusLabel.stringValue =
                "Done: plug-in installed in \(kPluginDir), \(downloadedCount) model file(s) ready in your user Library. "
                + "Restart DaVinci Resolve; the effect is under Open FX > Keying."
            self.installButton.title = "Done"
            self.installButton.isEnabled = false
            self.busy = false
        }
    }
}

// MARK: - App bootstrap (no storyboard, no MainMenu.nib)

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: InstallerWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let c = InstallerWindowController()
        c.makeWindow()
        c.show()
        controller = c
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

let app = NSApplication.shared
let installerDelegate = AppDelegate()
app.delegate = installerDelegate
app.setActivationPolicy(.regular)
app.run()
