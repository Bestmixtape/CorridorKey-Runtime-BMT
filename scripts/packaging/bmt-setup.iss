; CorridorKey 2.0 BMT Build — Windows installer (Inno Setup 6)
; Installs the OFX bundle into Common Files\OFX\Plugins (Resolve/standard OFX path).
; Uninstall entry appears in Settings > Apps > Add or remove programs.

#define MyAppName      "CorridorKey 2.0 BMT Build"
#define MyAppVersion   "0.1"
#define MyBundleName   "CorridorKey-BMT.ofx.bundle"

[Setup]
AppId={{9FB345CC-CA72-45D0-834A-C36A06838B93}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher=Bestmixtape
AppPublisherURL=https://github.com/Bestmixtape/CorridorKey2.0-OFX-BMT
DefaultDirName={commonpf}\Common Files\OFX\Plugins
DefaultGroupName=CorridorKey BMT
DisableProgramGroupPage=yes
DisableWelcomePage=no
LicenseFile=.\LICENSE.txt
OutputDir=..\..\..\dist-v0.1
OutputBaseFilename=CorridorKey2.0-BMT-Win64-v0.1-Setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayName={#MyAppName} (OFX plugin)

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; v0.3: no desktop icon — an OFX plugin is not an application.

[Files]
Source: "..\..\build\release\{#MyBundleName}\*"; DestDir: "{app}\{#MyBundleName}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\..\README.md"; DestDir: "{app}\{#MyBundleName}"; DestName: "README-BMT.txt"; Flags: ignoreversion
; v0.3: model pack fetcher, executed during installation (see CurStepChanged
; below); never installed into the OFX path itself.
Source: "..\..\build\release\src\app\corridorkey_model_fetch.exe"; Flags: dontcopy

[Dirs]
; Ensure the OFX Plugins parent exists even on hosts that never created it
Name: "{app}"

[Run]
Filename: "https://github.com/Bestmixtape/CorridorKey2.0-OFX-BMT"; Description: "Open the CorridorKey BMT page"; Flags: shellexec postinstall skipifsilent nowait

[Code]
// BMT v0.3: the model pack (~2.4 GB) downloads DURING installation, right
// after the plugin files land, instead of on the OFX plugin's first use. The
// helper process owns the live progress window (Inno's Exec blocks the
// wizard), and its PLAN/PROGRESS/DONE stdout protocol lands in the setup log.
procedure CurStepChanged(CurStep: TSetupStep);
var
  FetchExe: String;
  ModelsDir: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    ExtractTemporaryFile('corridorkey_model_fetch.exe');
    FetchExe := ExpandConstant('{tmp}\corridorkey_model_fetch.exe');
    ModelsDir := ExpandConstant('{localappdata}\CorridorKey2.0-BMT\models');
    Log('BMT v0.3: starting model pack fetch into ' + ModelsDir);
    ResultCode := -1;
    if Exec(FetchExe, '--dest "' + ModelsDir + '" --install-ui', '',
            SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      Log('BMT v0.3: model pack fetch finished rc=' + IntToStr(ResultCode))
    else
      Log('BMT v0.3: model pack fetch could not start');
    if ResultCode <> 0 then
      MsgBox('The model pack download did not complete (code ' + IntToStr(ResultCode) + ').' #13#10 +
             'The plugin files are installed, but the models are missing.' #13#10 +
             'Re-run this Setup to retry the download, or use the manual link on the CorridorKey BMT page.',
             mbInformation, MB_OK);
  end;
end;

// On uninstall, offer to delete the model pack + caches (~1.2 GB) too.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ModelsDir: String;
  ResultCode: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    ModelsDir := ExpandConstant('{localappdata}\CorridorKey2.0-BMT');
    if DirExists(ModelsDir) then
    begin
      if MsgBox('Also delete the downloaded model pack and caches?' #13#10 +
                '(about 1.2 GB in your Local AppData)?' #13#10 +
                'Choose No to keep them for a reinstall.',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      begin
        Exec(ExpandConstant('{cmd}'), '/c rmdir /s /q "' + ModelsDir + '"', '',
             SW_HIDE, ewWaitUntilTerminated, ResultCode);
      end;
    end;
  end;
end;
