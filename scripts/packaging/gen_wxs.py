#!/usr/bin/env python3
"""Generate a WiX v4-schema .wxs that harvests the CorridorKey BMT OFX bundle.
Usage: python gen_wxs.py <bundle_dir> <out.wxs>
MSI installs to: [ProgramFiles64Folder]\\Common Files\\OFX\\Plugins\\<bundle>
"""
import sys, os, uuid

BUNDLE = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2])
BUNDLE_NAME = os.path.basename(BUNDLE)

UPGRADE_CODE = "B621DD00-3899-4543-894E-95466CC310D0"
PRODUCT_NAME = "CorridorKey 2.0 BMT Build"
VERSION = "0.1.0"
MANUFACTURER = "Bestmixtape"
# License page for the installer wizard; license.rtf is generated from
# LICENSE.txt in this folder (CC BY-NC-SA 4.0 summary).
LICENSE_RTF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "license.rtf")

esc = lambda s: (s.replace("&", "&amp;").replace("<", "&lt;")
                   .replace(">", "&gt;").replace('"', "&quot;"))

dir_ids = {}
dir_children = {}

def walk(d, did):
    dir_ids[d] = did
    dirs = sorted(e.path for e in os.scandir(d) if e.is_dir())
    dir_children[d] = dirs
    for i, sub in enumerate(dirs):
        walk(sub, f"{did}_{i}")

walk(BUNDLE, "ROOT")

total_files = sum(len([e for e in os.scandir(d) if e.is_file()]) for d in dir_ids)
print(f"harvest: {len(dir_ids)} dirs, {total_files} files")

lines = []
comp_ids = []
state = {"fid": 0}

def emit_dir(d, depth):
    ind = "  " * depth
    files = sorted(e.path for e in os.scandir(d) if e.is_file())
    if files:
        cid = f"c_{dir_ids[d]}"
        comp_ids.append(cid)
        lines.append(f'{ind}<Component Id="{cid}" Guid="{uuid.uuid5(uuid.NAMESPACE_URL, d)}">')
        for f in files:
            state["fid"] += 1
            lines.append(f'{ind}  <File Id="f{state["fid"]:05d}" Source="{esc(f)}" />')
        lines.append(f'{ind}</Component>')
    for sub in dir_children[d]:
        lines.append(f'{ind}<Directory Id="{dir_ids[sub]}" Name="{esc(os.path.basename(sub))}">')
        emit_dir(sub, depth + 1)
        lines.append(f'{ind}</Directory>')

emit_dir(BUNDLE, 5)
refs = "\n".join(f'      <ComponentRef Id="{c}" />' for c in comp_ids)

wxs = f"""<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs"
     xmlns:ui="http://wixtoolset.org/schemas/v4/wxs/ui">
  <Package Name="{esc(PRODUCT_NAME)}" Language="1033" Version="{VERSION}"
           Manufacturer="{esc(MANUFACTURER)}" UpgradeCode="{UPGRADE_CODE}"
           Scope="perMachine" InstallerVersion="500" Codepage="65001">

    <MajorUpgrade DowngradeErrorMessage="A newer version of {esc(PRODUCT_NAME)} is already installed."
                  AllowSameVersionUpgrades="yes" />
    <MediaTemplate EmbedCab="yes" />

    <!-- Real installer wizard (license agreement -> progress -> finish) via
         the globally installed WixToolset.UI.wixext extension
         (wix extension add -g WixToolset.UI.wixext). WixUI_Minimal by
         design: OFX plugins are only scanned by hosts from the standard
         ProgramFiles location, so no custom-directory page to shoot
         ourselves in the foot with. -->
    <WixVariable Id="WixUILicenseRtf" Value="{esc(LICENSE_RTF)}" />
    <ui:WixUI Id="WixUI_Minimal" />

    <StandardDirectory Id="ProgramFiles64Folder">
      <Directory Id="CommonFilesDir" Name="Common Files">
        <Directory Id="OfxDir" Name="OFX">
          <Directory Id="PluginsDir" Name="Plugins">
            <Directory Id="BundleRoot" Name="{esc(BUNDLE_NAME)}">
{chr(10).join(lines)}
            </Directory>
          </Directory>
        </Directory>
      </Directory>
    </StandardDirectory>

    <Feature Id="Complete" Title="{esc(PRODUCT_NAME)}" Level="1" Display="expand">
{refs}
    </Feature>
  </Package>
</Wix>
"""
open(OUT, "w", encoding="utf-8").write(wxs)
print(f"wrote {OUT} ({len(comp_ids)} components, {state['fid']} files)")
