#!/usr/bin/env python3
"""Generate a WiX v4-schema .wxs that harvests the CorridorKey BMT OFX bundle.
Usage: python gen_wxs.py <bundle_dir> <out.wxs>
MSI installs to: [ProgramFiles64Folder]\\Common Files\\OFX\\Plugins\\<bundle>
"""
import sys, os, uuid

BUNDLE = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2])
BUNDLE_NAME = os.path.basename(BUNDLE)
# BMT v0.3: optional path to corridorkey_model_fetch(.exe). When given, the MSI
# installs it under <bundle>/tools and runs it after InstallFinalize so the
# model pack is downloaded during install (helper shows its own progress
# window), not on first use inside Resolve.
FETCH_EXE = os.path.abspath(sys.argv[4]) if len(sys.argv) > 4 else None

UPGRADE_CODE = "B621DD00-3899-4543-894E-95466CC310D0"
PRODUCT_NAME = "CorridorKey 2.0 BMT Build"
VERSION = sys.argv[3] if len(sys.argv) > 3 else "0.1.0"
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

fetch_dir = fetch_refs = fetch_ca = ""
if FETCH_EXE:
    fetch_cid = "c_fetch_tools"
    fetch_dir = (
        f'            <Directory Id="FetchToolsDir" Name="tools">\n'
        f'              <Component Id="{fetch_cid}" Guid="{uuid.uuid5(uuid.NAMESPACE_URL, "corridorkey-model-fetch-tools")}">\n'
        f'                <File Id="fetch_exe" Source="{esc(FETCH_EXE)}" />\n'
        f'              </Component>\n'
        f'            </Directory>\n'
    )
    fetch_refs = f'      <ComponentRef Id="{fetch_cid}" />\n'
    # Property CA sets the command line; Binary CA executes it under the
    # user's profile so LocalAppDataFolder is theirs and the helper's
    # progress window shows in their session. Return=ignore keeps a failed
    # fetch from rolling back the plugin install (re-run the tool or the
    # installer to retry).
    fetch_ca = f"""
    <Binary Id="FetchPackExe" SourceFile="{esc(FETCH_EXE)}" />
    <CustomAction Id="SetFetchCmd" Property="FetchPackExe"
                  Value="&quot;[FetchToolsDir]corridorkey_model_fetch.exe&quot; --dest &quot;[LocalAppDataFolder]CorridorKey2.0-BMT\\models&quot; --install-ui" />
    <CustomAction Id="FetchPackExe" BinaryRef="FetchPackExe" ExeCommand="fetch"
                  Execute="immediate" Return="ignore" />
    <InstallExecuteSequence>
      <Custom Action="SetFetchCmd" Before="FetchPackExe" Condition="NOT REMOVE" />
      <Custom Action="FetchPackExe" After="InstallFinalize" Condition="NOT REMOVE" />
    </InstallExecuteSequence>
"""

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
{fetch_dir}            </Directory>
          </Directory>
        </Directory>
      </Directory>
    </StandardDirectory>

    <Feature Id="Complete" Title="{esc(PRODUCT_NAME)}" Level="1" Display="expand">
{refs}
{fetch_refs}    </Feature>
{fetch_ca}  </Package>
</Wix>
"""
open(OUT, "w", encoding="utf-8").write(wxs)
print(f"wrote {OUT} ({len(comp_ids)} components, {state['fid']} files)")
