; CorridorKey 2.0 BMT Build — Windows installer (Inno Setup 6)
; Installs the OFX bundle into Common Files\OFX\Plugins (Resolve/standard OFX path).
; Uninstall entry appears in Settings > Apps > Add or remove programs.

#define MyAppName      "CorridorKey 2.0 BMT Build"
#define MyAppVersion   "0.2.0"
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
OutputDir=C:\hermes-files\corridorkey\dist-v0.2
OutputBaseFilename=CorridorKey2.0-BMT-Win64-v0.2-Setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayName={#MyAppName} (OFX plugin)

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\build\release\{#MyBundleName}\*"; DestDir: "{app}\{#MyBundleName}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\..\README.md"; DestDir: "{app}\{#MyBundleName}"; DestName: "README-BMT.txt"; Flags: ignoreversion

[Dirs]
; Ensure the OFX Plugins parent exists even on hosts that never created it
Name: "{app}"

[Run]
Filename: "https://github.com/Bestmixtape/CorridorKey2.0-OFX-BMT"; Description: "Open the CorridorKey BMT page (models download on first use)"; Flags: shellexec postinstall skipifsilent nowait

[Code]
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
