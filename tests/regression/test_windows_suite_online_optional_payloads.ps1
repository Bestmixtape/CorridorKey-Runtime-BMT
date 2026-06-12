Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$suitePackageScriptPath = Join-Path $repoRoot "scripts\package_suite_installer_windows.ps1"

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

function Assert-ArrayContains {
    param(
        [object[]]$Values,
        [string]$Expected,
        [string]$Label
    )

    if ($Values -notcontains $Expected) {
        throw "$Label must contain '$Expected'. Found: $($Values -join ', ')"
    }
}

if (-not (Test-Path -LiteralPath $suitePackageScriptPath)) {
    throw "Expected suite package script not found: $suitePackageScriptPath"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("corridorkey_suite_online_payloads_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $distributionManifestPath = Join-Path $tempRoot "distribution_manifest.json"
    $onlineManifestPath = Join-Path $tempRoot "suite_online.json"
    $onlineIssPath = Join-Path $tempRoot "suite_online.iss"
    $guiSha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

    $distributionManifest = [ordered]@{
        manifest_version = 1
        repo = "example/CorridorKey"
        revision = "test"
        generated_by = "test_windows_suite_online_optional_payloads.ps1"
        packs = [ordered]@{
            "green-models" = [ordered]@{
                label = "Green pack"
                component = "green"
                dest_subdir = "model's"
                files = @(
                    [ordered]@{
                        filename = "corridorkey_fp16_512.onnx"
                        url = "https://downloads.example.invalid/corridorkey_fp16_512.onnx"
                        sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                        size_bytes = 512
                        status = "ready"
                    }
                )
            }
            "blue-models" = [ordered]@{
                label = "Blue model pack"
                component = "blue"
                dest_subdir = "models"
                files = @(
                    [ordered]@{
                        filename = "corridorkey_dynamic_blue_fp16.ts"
                        url = "https://downloads.example.invalid/corridorkey_dynamic_blue_fp16.ts"
                        sha256 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
                        size_bytes = 1024
                        status = "ready"
                    }
                )
            }
            "blue-runtime" = [ordered]@{
                label = "Blue runtime pack"
                component = "blue"
                dest_subdir = "torchtrt-runtime/bin"
                is_archive = $true
                extract = $true
                installed_size_bytes = 4096
                installed_file_count = 2
                files = @(
                    [ordered]@{
                        filename = "corridorkey_blue_torchtrt_runtime.7z"
                        url = "https://downloads.example.invalid/corridorkey_blue_torchtrt_runtime.7z"
                        sha256 = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                        size_bytes = 2048
                        status = "ready"
                    }
                )
            }
        }
        component_payloads = [ordered]@{
            "gui-app" = [ordered]@{
                label = "Tauri GUI payload"
                component = "gui"
                dest_subdir = "Contents/Resources"
                is_archive = $true
                extract = $true
                installed_size_bytes = 123456
                files = @(
                    [ordered]@{
                        filename = "corridorkey_gui_payload's.zip"
                        url = "https://downloads.example.invalid/corridorkey_gui_payload's.zip"
                        sha256 = $guiSha256
                        size_bytes = 34567
                        status = "ready"
                    }
                )
            }
        }
    }
    $distributionManifest | ConvertTo-Json -Depth 24 | Set-Content -LiteralPath $distributionManifestPath -Encoding UTF8

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $suitePackageScriptPath `
        -Flavor online `
        -Version "0.9.0" `
        -DisplayVersionLabel "0.9.0-win.0" `
        -DistributionManifestPath $distributionManifestPath `
        -RenderOnly `
        -OutputManifestPath $onlineManifestPath `
        -OutputIssPath $onlineIssPath
    if ($LASTEXITCODE -ne 0) {
        throw "Rendering online suite with optional component payloads failed."
    }

    $suite = Get-Content -Path $onlineManifestPath -Raw | ConvertFrom-Json
    $externalizedComponentPayloads = @($suite.install_modes.online.externalized_component_payloads)
    Assert-ArrayContains -Values $externalizedComponentPayloads -Expected "gui" -Label "online externalized component payloads"
    Assert-NotContains -Content ($externalizedComponentPayloads -join ",") -Needle "adobe" -Label "online externalized component payloads"

    $embeddedComponentPayloads = @($suite.install_modes.online.embedded_component_payloads)
    Assert-ArrayContains -Values $embeddedComponentPayloads -Expected "adobe" -Label "online embedded component payloads"
    Assert-NotContains -Content ($embeddedComponentPayloads -join ",") -Needle "gui" -Label "online embedded component payloads"

    $componentPayloadIds = @($suite.component_payloads | ForEach-Object { $_.id })
    Assert-ArrayContains -Values $componentPayloadIds -Expected "gui-app" -Label "suite component payloads"

    $onlineContent = Get-Content -Path $onlineIssPath -Raw
    Assert-Contains -Content $onlineContent -Needle "if WizardIsComponentSelected('gui') then begin" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "DownloadPage.Add('https://downloads.example.invalid/corridorkey_gui_payload''s.zip', 'corridorkey_gui_payload''s.zip', '$guiSha256');" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "CorridorKeyWriteSuitePackMarker('model''s', 'green-models'" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "CorridorKeySuitePackMarkerValid('model''s', 'green-models'" -Label "online suite .iss"
    Assert-NotContains -Content $onlineContent -Needle "CorridorKeyWriteSuitePackMarker('model's', 'green-models'" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "Source: `"{tmp}\corridorkey_gui_payload's.zip`"; DestDir: `"{#SuiteGuiRoot}\Contents\Resources`"; Components: gui; Flags: external ignoreversion extractarchive recursesubdirs createallsubdirs; ExternalSize: 123456" -Label "online suite .iss"
    Assert-Contains -Content $onlineContent -Needle "Source: `"{#SuitePayloadRoot}\runtime\win64\*`"; DestDir: `"{#SharedRuntimeRoot}\Contents\Win64`"; Components: runtimecore" -Label "online suite .iss"
    Assert-NotContains -Content $onlineContent -Needle "Source: `"{#SuitePayloadRoot}\gui\*`"; DestDir: `"{#SuiteGuiRoot}`"; Components: gui" -Label "online suite .iss"
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "[PASS] Windows suite online optional payload checks passed." -ForegroundColor Green
