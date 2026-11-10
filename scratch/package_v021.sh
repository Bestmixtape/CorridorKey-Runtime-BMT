#!/usr/bin/env bash
# BMT v0.2.1 local Windows trio packaging (mirrors CI rewrites exactly)
set -euo pipefail
cd /c/hermes-files/corridorkey/CorridorKey-Runtime
DIST=/c/hermes-files/corridorkey/dist-v0.2.1
V=0.2.1
mkdir -p "$DIST"

# 1) Inno Setup
sed -e "s|^OutputDir=.*|OutputDir=C:\\\\hermes-files\\\\corridorkey\\\\dist-v${V}\\\\|" \
    -e "s|#define MyAppVersion   \"[^\"]*\"|#define MyAppVersion   \"${V}\"|" \
    -e "s|OutputBaseFilename=.*|OutputBaseFilename=CorridorKey2.0-BMT-Win64-v${V}-Setup|" \
    scripts/packaging/bmt-setup.iss > scripts/packaging/bmt-setup.local021.iss
grep -E "^(OutputDir|OutputBaseFilename)|MyAppVersion" scripts/packaging/bmt-setup.local021.iss | head -4
"/c/Users/raju/AppData/Local/Programs/Inno Setup 6/ISCC.exe" /Qp scripts/packaging/bmt-setup.local021.iss > "$TMPDIR/iscc021.log" 2>&1 && echo "INNO_OK" || { echo INNO_FAIL; tail -5 "$TMPDIR/iscc021.log"; exit 1; }

# 2) MSI via WiX 5
PY="/c/Users/raju/AppData/Local/Python/pythoncore-3.15-64/python.exe"
mkdir -p scratch/wxs021
"$PY" scripts/packaging/gen_wxs.py "C:/hermes-files/corridorkey/CorridorKey-Runtime/build/release/CorridorKey-BMT.ofx.bundle" scratch/wxs021/bmt-package.wxs "${V}"
"$HOME/.dotnet/tools/wix.exe" build scratch/wxs021/bmt-package.wxs -ext WixToolset.UI.wixext/5.0.2 -o "C:/hermes-files/corridorkey/dist-v0.2.1/CorridorKey2.0-BMT-Win64-v${V}.msi" && echo "MSI_OK"

# 3) ZIP (true deflate, arcnames under bundle root)
"$PY" - "$DIST" <<'PYEOF'
import os, sys, zipfile
dist = sys.argv[1]
root = "C:/hermes-files/corridorkey/CorridorKey-Runtime/build/release"
bundle = "CorridorKey-BMT.ofx.bundle"
out = os.path.join(dist, "CorridorKey2.0-BMT-Win64-v0.2.1.zip")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for dirpath, _, files in os.walk(os.path.join(root, bundle)):
        for f in files:
            full = os.path.join(dirpath, f)
            arc = os.path.relpath(full, root).replace("\\", "/")
            z.write(full, arc)
print("ZIP_OK", os.path.getsize(out))
PYEOF

ls -la "$DIST"
