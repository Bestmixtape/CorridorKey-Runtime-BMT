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
            "[Setup]",
            "AppId={{7C93E726-017B-45ED-931B-78436F7612A8}",
            "ArchiveExtraction=full",
            "[Types]",
            "Name: `"greenonly`"; Description: `"Green only`"",
            "Name: `"blueonly`"; Description: `"Blue only`"",
            "Name: `"recommended`"; Description: `"Recommended Green plus Blue`"",
            "Name: `"custom`"; Description: `"Custom`"; Flags: iscustom",
            "[Components]",
            "Name: `"runtimecore`"; Description: `"CLI/runtime core`"",
            "Name: `"gui`"; Description: `"Tauri GUI`"",
            "Name: `"ofxresolvefusion`"; Description: `"OFX Resolve/Fusion`"",
            "Name: `"ofxnuke`"; Description: `"OFX Nuke`"",
            "Name: `"adobe`"; Description: `"Adobe plugins`"",
            "Name: `"green`"; Description: `"Green model pack`"",
            "Name: `"blue`"; Description: `"Blue model/runtime pack`"",
            "[Dirs]",
            "Name: `"{#SharedRuntimeRoot}\Contents\Win64`"",
            "Name: `"{#SharedRuntimeRoot}\Contents\Resources\models`"",
            "Name: `"{#SharedRuntimeRoot}\Contents\Resources\torchtrt-runtime\bin`"",
            "Name: `"{#SuiteGuiRoot}`"",
            "[Files]",
            "Source: `"{#SuitePayloadRoot}\runtime\win64\*`"; DestDir: `"{#SharedRuntimeRoot}\Contents\Win64`"; Components: runtimecore",
            "Source: `"{#SuitePayloadRoot}\runtime\resources\*`"; DestDir: `"{#SharedRuntimeRoot}\Contents\Resources`"; Components: runtimecore",
            "DestDir: `"{#SharedRuntimeRoot}\Contents\Win64`"; Components: runtimecore",
            "DestDir: `"{#SuiteGuiRoot}`"; Components: gui",
            "DestDir: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle`"; Components: ofxresolvefusion",
            "DestDir: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle`"; Components: ofxnuke",
            "DestDir: `"{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey`"; Components: adobe",
            "[INI]",
            "Filename: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle\Contents\Resources\corridorkey_runtime.ini`"; Section: `"runtime`"; Key: `"shared_root`"; String: `"{#SharedRuntimeRoot}`"; Components: ofxresolvefusion",
            "Filename: `"{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey\Contents\Resources\corridorkey_runtime.ini`"; Section: `"runtime`"; Key: `"shared_root`"; String: `"{#SharedRuntimeRoot}`"; Components: adobe",
            "corridorkey_fp16_512.onnx",
            "corridorkey_dynamic_blue_fp16.ts",
            "corridorkey_blue_torchtrt_runtime.7z"
        )) {
            Assert-Contains -Content $content -Needle $requiredToken -Label $issPath
        }

        Assert-NotContains -Content $content -Needle "corridorkey_fp16_768.onnx" -Label $issPath
        Assert-NotContains -Content $content -Needle "corridorkey_fp16_768_ctx.onnx" -Label $issPath
        Assert-NotContains -Content $content -Needle "corridorkey_fp32_" -Label $issPath
    }

    $onlineContent = Get-Content -Path $onlineIssPath -Raw
    Assert-Contains -Content $onlineContent -Needle "Flags: external ignoreversion" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "DownloadPage := CreateDownloadPage(" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "function NextButtonClick(CurPageID: Integer): Boolean;" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "if WizardIsComponentSelected('green') then begin" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "if WizardIsComponentSelected('blue') then begin" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("DownloadPage.Add('" + $green512.url + "', '" + $green512.filename + "', '" + $green512.sha256 + "');") -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("DownloadSize: " + $green512.size_bytes) -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("ExternalSize: " + $green512.size_bytes) -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("DownloadPage.Add('" + $blueRuntimeFile.url + "', '" + $blueRuntimeFile.filename + "', '" + $blueRuntimeFile.sha256 + "');") -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle ("ExternalSize: " + $blueRuntimeInstalledSize) -Label "online suite .iss"

    $offlineContent = Get-Content -Path $offlineIssPath -Raw
    Assert-Contains -Content $offlineContent -Needle "Source: `"{#OfflinePayloadRoot}\models\corridorkey_fp16_512.onnx`"" -Label "offline suite .iss"
    Assert-Contains -Content $offlineContent -Needle "Source: `"{#OfflinePayloadRoot}\torchtrt-runtime\bin\*`"" -Label "offline suite .iss"
    Assert-Contains -Content $offlineContent -Needle "Flags: recursesubdirs createallsubdirs ignoreversion" -Label "offline suite .iss"
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "[PASS] Windows suite Inno render checks passed." -ForegroundColor Green
