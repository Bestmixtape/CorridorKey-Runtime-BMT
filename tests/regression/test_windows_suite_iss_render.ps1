Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$suitePackageScriptPath = Join-Path $repoRoot "scripts\package_suite_installer_windows.ps1"
$manifestPath = Join-Path $repoRoot "scripts\installer\distribution_manifest.json"

function Assert-Contains {
    param(
        [string]$Content,
        [string]$Needle,
        [string]$Label
    )

    if ($Content -notmatch [regex]::Escape($Needle)) {
        throw "$Label must contain '$Needle'."
    }
}

function Assert-NotContains {
    param(
        [string]$Content,
        [string]$Needle,
        [string]$Label
    )

    if ($Content -match [regex]::Escape($Needle)) {
        throw "$Label must not contain '$Needle'."
    }
}

function Assert-TokenOrder {
    param(
        [string]$Content,
        [string]$First,
        [string]$Second,
        [string]$Label
    )

    $firstIndex = $Content.IndexOf($First, [System.StringComparison]::Ordinal)
    $secondIndex = $Content.IndexOf($Second, [System.StringComparison]::Ordinal)
    if ($firstIndex -lt 0 -or $secondIndex -lt 0 -or $firstIndex -ge $secondIndex) {
        throw "$Label must contain '$First' before '$Second'."
    }
}

if (-not (Test-Path -LiteralPath $suitePackageScriptPath)) {
    throw "Expected suite package script not found: $suitePackageScriptPath"
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Expected distribution manifest not found: $manifestPath"
}

$manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
$green512 = @($manifest.packs."green-models".files |
    Where-Object { $_.filename -eq "corridorkey_fp16_512.onnx" } |
    Select-Object -First 1)
$blueRuntimeFile = @($manifest.packs."blue-runtime".files | Select-Object -First 1)
$blueRuntimeInstalledSize = [string]$manifest.packs."blue-runtime".installed_size_bytes

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("corridorkey_suite_iss_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $onlineIssPath = Join-Path $tempRoot "suite_online.iss"
    $offlineIssPath = Join-Path $tempRoot "suite_offline.iss"

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $suitePackageScriptPath `
        -Flavor online `
        -Version "0.9.0" `
        -DisplayVersionLabel "0.9.0-win.0" `
        -RenderOnly `
        -OutputIssPath $onlineIssPath
    if ($LASTEXITCODE -ne 0) {
        throw "Rendering online suite .iss failed."
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $suitePackageScriptPath `
        -Flavor offline `
        -Version "0.9.0" `
        -DisplayVersionLabel "0.9.0-win.0" `
        -RenderOnly `
        -OutputIssPath $offlineIssPath
    if ($LASTEXITCODE -ne 0) {
        throw "Rendering offline suite .iss failed."
    }

    foreach ($issPath in @($onlineIssPath, $offlineIssPath)) {
        if (-not (Test-Path -LiteralPath $issPath)) {
            throw "Expected generated .iss not found: $issPath"
        }

        $content = Get-Content -Path $issPath -Raw
        foreach ($requiredToken in @(
            "#define InstallerSurface `"suite`"",
            "#define SharedRuntimeRoot `"{autopf}\CorridorKey\Runtime`"",
            "#define SuiteGuiRoot `"{autopf}\CorridorKey\GUI`"",
            "#define SuiteInventoryPath `"{autopf}\CorridorKey\Runtime\Contents\Resources\suite_inventory.ini`"",
            "[Setup]",
            "AppId={{7C93E726-017B-45ED-931B-78436F7612A8}",
            "ArchiveExtraction=full",
            "[Types]",
            "Name: `"runtimeonly`"; Description: `"Runtime and CLI only`"",
            "Name: `"greenonly`"; Description: `"Green only`"",
            "Name: `"blueonly`"; Description: `"Blue only`"",
            "Name: `"recommended`"; Description: `"Recommended Green plus Blue`"",
            "Name: `"custom`"; Description: `"Custom`"; Flags: iscustom",
            "[Components]",
            "Name: `"runtimecore`"; Description: `"CLI/runtime core`"",
            "Name: `"runtimecore`"; Description: `"CLI/runtime core`"; Types: runtimeonly greenonly blueonly recommended custom; Flags: fixed",
            "Name: `"gui`"; Description: `"Tauri GUI`"",
            "Name: `"ofxresolvefusion`"; Description: `"OFX Resolve/Fusion`"",
            "Name: `"ofxnuke`"; Description: `"OFX Nuke`"",
            "Name: `"adobe`"; Description: `"Adobe plugins`"",
            "Name: `"green`"; Description: `"Green model pack`"",
            "Name: `"blue`"; Description: `"Blue model/runtime pack`"",
            "[Tasks]",
            "Name: `"cleaninstall`"; Description: `"Clean install (remove selected CorridorKey payloads before installing)`"; Flags: unchecked",
            "[Dirs]",
            "Name: `"{#SharedRuntimeRoot}\Contents\Win64`"",
            "Name: `"{#SharedRuntimeRoot}\Contents\Resources\models`"",
            "Name: `"{#SharedRuntimeRoot}\Contents\Resources\torchtrt-runtime\bin`"",
            "Name: `"{#SuiteGuiRoot}`"",
            "[InstallDelete]",
            "Type: files; Name: `"{#SuiteInventoryPath}`"",
            "[Files]",
            "Source: `"{#SuitePayloadRoot}\runtime\win64\*`"; DestDir: `"{#SharedRuntimeRoot}\Contents\Win64`"; Components: runtimecore",
            "Source: `"{#SuitePayloadRoot}\runtime\resources\*`"; DestDir: `"{#SharedRuntimeRoot}\Contents\Resources`"; Components: runtimecore",
            "DestDir: `"{#SharedRuntimeRoot}\Contents\Win64`"; Components: runtimecore",
            "DestDir: `"{#SuiteGuiRoot}`"; Components: gui",
            "DestDir: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle`"; Components: ofxresolvefusion",
            "DestDir: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle`"; Components: ofxnuke",
            "DestDir: `"{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey`"; Components: adobe",
            "[INI]",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"suite`"; Key: `"installer_surface`"; String: `"suite`"",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"suite`"; Key: `"version`"; String: `"0.9.0`"",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"suite`"; Key: `"display_version_label`"; String: `"0.9.0-win.0`"",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"suite`"; Key: `"flavor`"; String: `"",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"paths`"; Key: `"shared_runtime_root`"; String: `"{#SharedRuntimeRoot}`"",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"paths`"; Key: `"gui_root`"; String: `"{#SuiteGuiRoot}`"",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"components`"; Key: `"runtime-core`"; String: `"installed`"; Components: runtimecore",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"components`"; Key: `"gui`"; String: `"installed`"; Components: gui",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"components`"; Key: `"ofx-resolve-fusion`"; String: `"installed`"; Components: ofxresolvefusion",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"components`"; Key: `"ofx-nuke`"; String: `"installed`"; Components: ofxnuke",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"components`"; Key: `"adobe`"; String: `"installed`"; Components: adobe",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"components`"; Key: `"green`"; String: `"installed`"; Components: green",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"components`"; Key: `"blue`"; String: `"installed`"; Components: blue",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"hosts`"; Key: `"cli-runtime`"; String: `"{#SharedRuntimeRoot}\Contents\Win64`"; Components: runtimecore",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"hosts`"; Key: `"gui`"; String: `"{#SuiteGuiRoot}`"; Components: gui",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"hosts`"; Key: `"resolve-fusion`"; String: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle`"; Components: ofxresolvefusion",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"hosts`"; Key: `"nuke`"; String: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle`"; Components: ofxnuke",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"hosts`"; Key: `"adobe`"; String: `"{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey`"; Components: adobe",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"model_packs`"; Key: `"green-models`"; String: `"green`"; Components: green",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"model_packs`"; Key: `"blue-models`"; String: `"blue`"; Components: blue",
            "Filename: `"{#SuiteInventoryPath}`"; Section: `"model_packs`"; Key: `"blue-runtime`"; String: `"blue`"; Components: blue",
            "Filename: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle\Contents\Resources\corridorkey_runtime.ini`"; Section: `"runtime`"; Key: `"shared_root`"; String: `"{#SharedRuntimeRoot}`"; Components: ofxresolvefusion",
            "Filename: `"{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey\Contents\Resources\corridorkey_runtime.ini`"; Section: `"runtime`"; Key: `"shared_root`"; String: `"{#SharedRuntimeRoot}`"; Components: adobe",
            "[Code]",
            "function CorridorKeyPreviousInventoryValue(const Section, Key: String): String;",
            "GetIniString(Section, Key, '', ExpandConstant('{#SuiteInventoryPath}'))",
            "function CorridorKeyWasPreviouslyInstalled(const Section, Key: String): Boolean;",
            "Result := CorridorKeyPreviousInventoryValue(Section, Key) <> '';",
            "procedure CorridorKeyDeleteTreeIfPresent(const Path: String);",
            "RaiseException('Unable to remove CorridorKey path: ' + Path);",
            "if not DelTree(Path, True, True, True) then begin",
            "procedure CorridorKeyDeleteFileIfPresent(const Path: String);",
            "RaiseException('Unable to remove CorridorKey file: ' + Path);",
            "if not DeleteFile(Path) then begin",
            "function CorridorKeySuitePackMarkerPath(const DestSubdir, PackName: String): String;",
            "procedure CorridorKeyWriteSuitePackMarker(const DestSubdir, PackName, MarkerValue: String);",
            "function CorridorKeySuitePackMarkerValid(const DestSubdir, PackName, MarkerValue: String): Boolean;",
            "procedure CorridorKeyWriteSelectedSuitePackMarkers;",
            "CorridorKeyWriteSuitePackMarker('models', 'green-models',",
            "CorridorKeyWriteSuitePackMarker('models', 'blue-models',",
            "CorridorKeyWriteSuitePackMarker('torchtrt-runtime\bin', 'blue-runtime',",
            "procedure CorridorKeyApplySuiteLifecycleCleanup;",
            "if WizardIsTaskSelected('cleaninstall') then begin",
            "CorridorKeyDeleteTreeIfPresent(ExpandConstant('{#SharedRuntimeRoot}\Contents\Win64'));",
            "CorridorKeyDeleteTreeIfPresent(ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources'));",
            "if WizardIsComponentSelected('gui') then begin",
            "CorridorKeyDeleteTreeIfPresent(ExpandConstant('{#SuiteGuiRoot}'));",
            "if WizardIsComponentSelected('ofxresolvefusion') or WizardIsComponentSelected('ofxnuke') then begin",
            "CorridorKeyDeleteTreeIfPresent(ExpandConstant('{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle'));",
            "if WizardIsComponentSelected('adobe') then begin",
            "CorridorKeyDeleteTreeIfPresent(ExpandConstant('{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey'));",
            "if not WizardIsComponentSelected('gui') then begin",
            "if CorridorKeyWasPreviouslyInstalled('components', 'gui') then begin",
            "if (not WizardIsComponentSelected('ofxresolvefusion')) and (not WizardIsComponentSelected('ofxnuke')) then begin",
            "if CorridorKeyWasPreviouslyInstalled('components', 'ofx-resolve-fusion') or CorridorKeyWasPreviouslyInstalled('components', 'ofx-nuke') then begin",
            "if not WizardIsComponentSelected('adobe') then begin",
            "if CorridorKeyWasPreviouslyInstalled('components', 'adobe') then begin",
            "if not WizardIsComponentSelected('green') then begin",
            "if CorridorKeyWasPreviouslyInstalled('components', 'green') then begin",
            "CorridorKeyDeleteFileIfPresent(ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources\models\corridorkey_fp16_512.onnx'));",
            "CorridorKeyDeleteFileIfPresent(ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources\models\.cache.green-models.sha256'));",
            "if not WizardIsComponentSelected('blue') then begin",
            "if CorridorKeyWasPreviouslyInstalled('components', 'blue') then begin",
            "CorridorKeyDeleteFileIfPresent(ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources\models\corridorkey_dynamic_blue_fp16.ts'));",
            "CorridorKeyDeleteFileIfPresent(ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources\models\.cache.blue-models.sha256'));",
            "CorridorKeyDeleteTreeIfPresent(ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources\torchtrt-runtime\bin'));",
            "CorridorKeyDeleteFileIfPresent(ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources\torchtrt-runtime\bin\.cache.blue-runtime.sha256'));",
            "procedure CorridorKeyApplySuiteDeselectionCleanup;",
            "procedure CorridorKeyApplySuiteCleanInstallCleanup;",
            "procedure CorridorKeyApplySuiteLifecycleCleanup;",
            "CorridorKeyApplySuiteDeselectionCleanup;",
            "CorridorKeyApplySuiteCleanInstallCleanup;",
            "procedure CurStepChanged(CurStep: TSetupStep);",
            "if CurStep = ssInstall then begin",
            "CorridorKeyApplySuiteLifecycleCleanup;",
            "if CurStep = ssPostInstall then begin",
            "CorridorKeyWriteSelectedSuitePackMarkers;",
            "corridorkey_fp16_512.onnx",
            "corridorkey_dynamic_blue_fp16.ts",
            "corridorkey_blue_torchtrt_runtime.7z"
        )) {
            Assert-Contains -Content $content -Needle $requiredToken -Label $issPath
        }

        Assert-NotContains -Content $content -Needle "corridorkey_fp16_768.onnx" -Label $issPath
        Assert-NotContains -Content $content -Needle "corridorkey_fp16_768_ctx.onnx" -Label $issPath
        Assert-NotContains -Content $content -Needle "corridorkey_fp32_" -Label $issPath
        Assert-TokenOrder `
            -Content $content `
            -First "  CorridorKeyApplySuiteDeselectionCleanup;" `
            -Second "  CorridorKeyApplySuiteCleanInstallCleanup;" `
            -Label $issPath
    }

    $onlineContent = Get-Content -Path $onlineIssPath -Raw
    Assert-Contains -Content $onlineContent -Needle "Flags: external ignoreversion" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "DownloadPage := CreateDownloadPage(" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "function NextButtonClick(CurPageID: Integer): Boolean;" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "if WizardIsComponentSelected('green') then begin" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "if WizardIsComponentSelected('blue') then begin" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "Check: WizardIsTaskSelected('cleaninstall') or not CorridorKeySuitePackMarkerValid('models', 'green-models'," -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "if WizardIsTaskSelected('cleaninstall') or not CorridorKeySuitePackMarkerValid('models', 'green-models'," -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("DownloadPage.Add('" + $green512.url + "', '" + $green512.filename + "', '" + $green512.sha256 + "');") -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("DownloadSize: " + $green512.size_bytes) -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("ExternalSize: " + $green512.size_bytes) -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("DownloadPage.Add('" + $blueRuntimeFile.url + "', '" + $blueRuntimeFile.filename + "', '" + $blueRuntimeFile.sha256 + "');") -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("ExternalSize: " + $blueRuntimeInstalledSize) -Label "online suite .iss"
    Assert-NotContains -Content $onlineContent -Needle 'DestName: "corridorkey_blue_torchtrt_runtime.7z"' -Label "online suite .iss"

    $offlineContent = Get-Content -Path $offlineIssPath -Raw
    Assert-Contains -Content $offlineContent -Needle "Source: `"{#OfflinePayloadRoot}\models\corridorkey_fp16_512.onnx`"" -Label "offline suite .iss"
    Assert-Contains -Content $offlineContent -Needle "Source: `"{#OfflinePayloadRoot}\torchtrt-runtime\bin\*`"" -Label "offline suite .iss"
    Assert-Contains -Content $offlineContent -Needle "Flags: recursesubdirs createallsubdirs ignoreversion" -Label "offline suite .iss"
    Assert-NotContains -Content $onlineContent -Needle "#define SuiteInventoryPath `"{#SharedRuntimeRoot}" -Label "online suite .iss"
    Assert-NotContains -Content $offlineContent -Needle "#define SuiteInventoryPath `"{#SharedRuntimeRoot}" -Label "offline suite .iss"
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "[PASS] Windows suite Inno render checks passed." -ForegroundColor Green
