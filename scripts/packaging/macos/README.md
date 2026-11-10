# CorridorKey 2.0 BMT — macOS installer app (v0.3)

A minimal single-file AppKit installer (`main.swift`) that replaces the DMG's
`Install CorridorKey BMT.command` script with a native window: privileged
plug-in copy + per-user model download with a live `NSProgressIndicator`.

- Bundle id: `com.bestmixtape.corridorkey-installer`
- Min system: macOS 13.0, built arm64-only (matches the MLX/CoreML bundle).
- Admin step uses `osascript 'do shell script … with administrator privileges'`
  (GUI sudo prompt). No SMJobBless / XPC helper.
- Model step runs the bundled `corridorkey_model_fetch` as the current user
  with `--dest "$HOME/Library/Application Support/CorridorKey2.0-BMT/models"
  --track mlx` and parses the same unbuffered line protocol the Windows Inno
  wizard consumes:

  ```
  PROGRESS file i/n name=NAME bytes DONE/TOTAL
  DONE ok=1|0 downloaded=K
  ```

## .app bundle layout

Everything under `Contents/Resources/` is staged by CI at assembly time; only
`Info.plist` and `main.swift` live in this directory.

```
CorridorKey-2.0-BMT-Installer.app/
└── Contents/
    ├── Info.plist                          ← this file
    ├── MacOS/
    │   └── CorridorKeyInstaller            ← compiled from main.swift
    └── Resources/
        ├── CorridorKey-BMT.ofx.bundle/     ← build/macos artifact (whole dir)
        └── corridorkey_model_fetch         ← helper binary, chmod +x
```

## Build command (plain swiftc, no Xcode project)

From the repo root, on an arm64 Mac:

```bash
xcrun swiftc -O -swift-version 5 -target arm64-apple-macos13 \
  -framework AppKit \
  scripts/packaging/macos/main.swift \
  -o "CorridorKey-2.0-BMT-Installer.app/Contents/MacOS/CorridorKeyInstaller"
```

`-swift-version 5` pins the language mode (the app is written for Swift 5
semantics; the runner toolchain default could drift). Expect at most a
deprecation warning for `NSApp.activate(ignoringOtherApps:)` on newer SDKs —
harmless.

## How CI assembles the .app

The existing `macos.yml` job already builds and ad-hoc-signs
`build/macos/CorridorKey-BMT.ofx.bundle`. A DMG stage that ships the app
instead of the `.command` scripts would do:

```bash
set -euo pipefail
APP="CorridorKey-2.0-BMT-Installer.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp scripts/packaging/macos/Info.plist "$APP/Contents/Info.plist"

xcrun swiftc -O -swift-version 5 -target arm64-apple-macos13 -framework AppKit \
  scripts/packaging/macos/main.swift \
  -o "$APP/Contents/MacOS/CorridorKeyInstaller"

# Payloads from the same job's build tree (or downloaded artifacts):
cp -R build/macos/CorridorKey-BMT.ofx.bundle "$APP/Contents/Resources/"
cp build/macos/corridorkey_model_fetch      "$APP/Contents/Resources/"
chmod +x "$APP/Contents/Resources/corridorkey_model_fetch"

# Ad-hoc sign: --deep also (re)seals the nested OFX bundle parts, matching
# the job's existing ad-hoc signing convention.
codesign --force --deep -s - "$APP"

hdiutil create -volname CorridorKey-BMT -srcfolder "$APP" -ov -format UDZO \
  "CorridorKey2.0-BMT-macOS-Silicon-installer-v${BMT_VERSION}.dmg"
codesign --force -s - "CorridorKey2.0-BMT-macOS-Silicon-installer-v${BMT_VERSION}.dmg"
hdiutil verify "CorridorKey2.0-BMT-macOS-Silicon-installer-v${BMT_VERSION}.dmg"
```

Notes for whoever wires this into `macos.yml`:

- **`corridorkey_model_fetch` has no macOS build step yet.** On the
  `macos-bmt` branch it exists only as the plan in
  `installer_model_download_plan.json` (CMake target `corridorkey_model_fetch`
  from `src/app/model_fetch_cli.cpp`, the same helper the Windows runtime
  installer bundles as `corridorkey_model_fetch.exe`). The job needs a
  `cmake --build build/macos --target corridorkey_model_fetch` step; until
  that target exists for macOS, the app shows its
  "corridorkey_model_fetch is not inside this installer app" error.
- The helper must print the exact protocol lines above (`name=` included,
  unbuffered stdout); the app ignores any other line.
- Unsigned/ad-hoc DMG: first launch needs right-click → Open once (same as
  today's DMG). The app itself strips `com.apple.quarantine` from the
  installed copy in `/Library/OFX/Plugins` (same workaround as the current
  `.command` script), so Resolve loads the ad-hoc dylibs fine.
- Version strings: the app's `CFBundleShortVersionString` (0.3) tracks the
  installer itself, not `BMT_VERSION` (the plug-in version carried by the
  bundled OFX bundle). Keep them independent.
- Intel Macs: the binary is compiled arm64-only and won't even launch on an
  Intel Mac — equivalent to the `.command` script's `uname -m` guard, for free.

## Local smoke test (no DMG)

```bash
# after `cmake --build build/macos` produced the OFX bundle:
APP="CorridorKey-2.0-BMT-Installer.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp scripts/packaging/macos/Info.plist "$APP/Contents/Info.plist"
xcrun swiftc -O -swift-version 5 -target arm64-apple-macos13 -framework AppKit \
  scripts/packaging/macos/main.swift -o "$APP/Contents/MacOS/CorridorKeyInstaller"
cp -R build/macos/CorridorKey-BMT.ofx.bundle "$APP/Contents/Resources/"
# stage any corridorkey_model_fetch build, then:
open "$APP"
```
