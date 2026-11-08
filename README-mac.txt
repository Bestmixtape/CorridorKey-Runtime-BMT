CorridorKey 2.0 BMT Build — macOS (Apple Silicon) v0.1
=======================================================

Requires: **Apple Silicon Mac (M1/M2/M3/M4) — NOT Intel Macs**, macOS 14 or
newer, DaVinci Resolve 19/20/21. This is a Silicon-only build; the installer
detects an Intel Mac and stops.
Inference runs on Metal through Apple's MLX backend (corridorkey_mlx
weights + fixed-resolution bridges); hint models use ONNX Runtime's CoreML
EP — no CUDA.

INSTALL
1. First launch only: right-click this disk image's "Install CorridorKey BMT.command"
   and choose Open (the build is ad-hoc signed, so Gatekeeper will warn once).
2. The script copies CorridorKey-BMT.ofx.bundle into /Library/OFX/Plugins
   (it will ask for your admin password) and clears the download quarantine.
3. Restart DaVinci Resolve. The effect appears under
   Effects > Open FX > Keying as "CorridorKey 2.0 BMT Build".

FIRST RUN
Model weights (~715 MB) download automatically from Hugging Face on first use.
Or pre-fetch from Terminal:
  "/Library/OFX/Plugins/CorridorKey-BMT.ofx.bundle/Contents/MacOS/corridorkey" fetch-models

macOS NOTES
- Background colors: use Green, or Picker (eyedropper) for blue/chroma plates.
  The dedicated blue model is a Windows-only artifact upstream, so blue keying
  on Mac runs the green model behind the hue picker.
- Models live in ~/Library/Application Support/CorridorKey2.0-BMT
  (plus Caches/Logs under ~/Library with the same name).

UNINSTALL
- Run "Uninstall CorridorKey BMT.command" from this disk image, or
- Delete /Library/OFX/Plugins/CorridorKey-BMT.ofx.bundle, and sweep the
  ~/Library data with Mole ("mo clean") or by hand.

LICENSE
CorridorKey engine/runtime © CorridorKey Runtime Contributors, CC BY-NC-SA 4.0
(non-commercial share-alike). This BMT Build is free and not for sale.
