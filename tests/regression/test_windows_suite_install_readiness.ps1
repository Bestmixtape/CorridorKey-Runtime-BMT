Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$validatorPath = Join-Path $repoRoot "scripts\validate_suite_install_windows.ps1"

function New-TextFile {
    param(
        [string]$Path,
        [string]$Content = "fixture"
    )

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

function New-TestDistributionManifest {
    param(
        [string]$Path,
        [switch]$IncludeFutureGreenPack
    )

    $manifest = [ordered]@{
        manifest_version = 1
        packs = [ordered]@{
            "green-models" = [ordered]@{
                label = "Green fixture pack"
                component = "green"
                dest_subdir = "models"
                files = @(
                    [ordered]@{
                        filename = "green_fixture.onnx"
                        url = "https://example.invalid/green_fixture.onnx"
                        sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        size_bytes = 5
                    }
                )
            }
            "blue-models" = [ordered]@{
                label = "Blue fixture model pack"
                component = "blue"
                dest_subdir = "models"
                files = @(
                    [ordered]@{
                        filename = "blue_fixture.ts"
                        url = "https://example.invalid/blue_fixture.ts"
                        sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                        size_bytes = 5
                    }
                )
            }
            "blue-runtime" = [ordered]@{
                label = "Blue fixture runtime pack"
                component = "blue"
                dest_subdir = "torchtrt-runtime/bin"
                is_archive = $true
                extract = $true
                installed_file_count = 2
                files = @(
                    [ordered]@{
                        filename = "blue_runtime.7z"
                        url = "https://example.invalid/blue_runtime.7z"
                        sha256 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
                        size_bytes = 5
                    }
                )
            }
        }
    }
    if ($IncludeFutureGreenPack) {
        $manifest.packs["green-future-models"] = [ordered]@{
            label = "Future Green fixture pack"
            component = "green"
            dest_subdir = "models"
            files = @(
                [ordered]@{
                    filename = "green_future_fixture.onnx"
                    url = "https://example.invalid/green_future_fixture.onnx"
                    sha256 = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                    size_bytes = 5
                }
            )
        }
    }
    New-TextFile -Path $Path -Content ($manifest | ConvertTo-Json -Depth 12)
}

function New-SuiteInventory {
    param(
        [string]$RuntimeRoot,
        [string]$GuiRoot,
        [string]$OfxRoot,
        [string]$AdobeRoot
    )

    $content = @"
[suite]
installer_surface=suite
version=0.9.0
display_version_label=0.9.0-win.0
flavor=online

[paths]
shared_runtime_root=$RuntimeRoot
gui_root=$GuiRoot

[components]
runtime-core=installed
gui=installed
ofx-resolve-fusion=installed
ofx-nuke=installed
adobe=installed
green=installed
blue=installed

[hosts]
cli-runtime=$RuntimeRoot\Contents\Win64
gui=$GuiRoot
resolve-fusion=$OfxRoot
nuke=$OfxRoot
adobe=$AdobeRoot

[model_packs]
green-models=green
blue-models=blue
blue-runtime=blue
"@
    New-TextFile -Path (Join-Path $RuntimeRoot "Contents\Resources\suite_inventory.ini") -Content $content
}

function New-RuntimeOnlyInventory {
    param([string]$RuntimeRoot)

    $content = @"
[suite]
installer_surface=suite
version=0.9.0
display_version_label=0.9.0-win.0
flavor=online

[paths]
shared_runtime_root=$RuntimeRoot

[components]
runtime-core=installed

[hosts]
cli-runtime=$RuntimeRoot\Contents\Win64
"@
    New-TextFile -Path (Join-Path $RuntimeRoot "Contents\Resources\suite_inventory.ini") -Content $content
}

function New-RuntimeSidecar {
    param(
        [string]$Path,
        [string]$RuntimeRoot
    )

    $content = @"
[runtime]
shared_root=$RuntimeRoot
"@
    New-TextFile -Path $Path -Content $content
}

function New-RuntimeCorePayload {
    param([string]$RuntimeRoot)

    New-TextFile -Path (Join-Path $RuntimeRoot "Contents\Win64\corridorkey.exe")
    New-TextFile -Path (Join-Path $RuntimeRoot "Contents\Win64\ck-engine.exe")
    New-TextFile -Path (Join-Path $RuntimeRoot "Contents\Win64\onnxruntime.dll")
    New-TextFile -Path (Join-Path $RuntimeRoot "Contents\Win64\corridorkey_host_plugin_runtime_server.exe")
    New-TextFile -Path (Join-Path $RuntimeRoot "Contents\Resources\model_inventory.json") -Content "{}"
    New-TextFile -Path (Join-Path $RuntimeRoot "Contents\Resources\torchtrt-runtime\bin\corridorkey_torchtrt.dll")
}

function New-FakeRuntimeCommand {
    param(
        [string]$Path,
        [string]$Mode = "Healthy"
    )

    if ($Mode -eq "ChildHang") {
        $content = @'
param(
    [string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$childArguments = "-NoProfile -ExecutionPolicy Bypass -Command `"Start-Sleep -Seconds 30`""
Start-Process -FilePath "powershell.exe" -ArgumentList $childArguments -NoNewWindow | Out-Null
Start-Sleep -Seconds 30
'@
        New-TextFile -Path $Path -Content $content
        return
    }

    $content = @'
param(
    [string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$JsonSwitch = if ($Rest.Count -gt 0) { $Rest[-1] } else { "" }
if ($JsonSwitch -ne "--json") {
    Write-Error "Expected --json."
    exit 2
}

switch ($Command) {
    "info" { '{"command":"info","ok":true}' }
    "doctor" { '{"summary":{"healthy":true}}' }
    "models" { '{"models":[]}' }
    "presets" { '{"presets":[]}' }
    default {
        Write-Error "Unknown command: $Command"
        exit 3
    }
}
'@
    New-TextFile -Path $Path -Content $content
}

function Assert-ReportHealthy {
    param([object]$Report)

    if (-not [bool]$Report.validation_passed) {
        throw "Readiness report should pass. Issues: $($Report.issues -join ' | ')"
    }
    foreach ($component in @("runtime-core", "gui", "ofx-resolve-fusion", "ofx-nuke", "adobe", "green", "blue")) {
        if (-not [bool]$Report.components.$component.healthy) {
            throw "Component '$component' should be healthy."
        }
    }
    foreach ($command in @("info", "doctor", "models", "presets")) {
        $result = $Report.runtime_commands.commands.$command
        if ($null -eq $result -or -not [bool]$result.succeeded) {
            throw "Runtime command '$command' should succeed."
        }
    }
}

if (-not (Test-Path -LiteralPath $validatorPath)) {
    throw "Expected suite install validator not found: $validatorPath"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("corridorkey_suite_readiness_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $runtimeRoot = Join-Path $tempRoot "Runtime"
    $guiRoot = Join-Path $tempRoot "GUI"
    $ofxRoot = Join-Path $tempRoot "OFX\CorridorKey.ofx.bundle"
    $adobeRoot = Join-Path $tempRoot "Adobe\CorridorKey"
    $manifestPath = Join-Path $tempRoot "distribution_manifest.json"
    $fakeRuntime = Join-Path $tempRoot "fake_corridorkey.ps1"
    $reportPath = Join-Path $tempRoot "readiness.json"

    New-TestDistributionManifest -Path $manifestPath
    New-SuiteInventory -RuntimeRoot $runtimeRoot -GuiRoot $guiRoot -OfxRoot $ofxRoot -AdobeRoot $adobeRoot
    New-FakeRuntimeCommand -Path $fakeRuntime

    New-RuntimeCorePayload -RuntimeRoot $runtimeRoot
    New-TextFile -Path (Join-Path $runtimeRoot "Contents\Resources\models\green_fixture.onnx")
    New-TextFile -Path (Join-Path $runtimeRoot "Contents\Resources\models\blue_fixture.ts")
    New-TextFile -Path (Join-Path $runtimeRoot "Contents\Resources\models\.cache.green-models.sha256")
    New-TextFile -Path (Join-Path $runtimeRoot "Contents\Resources\models\.cache.blue-models.sha256")
    New-TextFile -Path (Join-Path $runtimeRoot "Contents\Resources\torchtrt-runtime\bin\runtime_a.dll")
    New-TextFile -Path (Join-Path $runtimeRoot "Contents\Resources\torchtrt-runtime\bin\runtime_b.dll")
    New-TextFile -Path (Join-Path $runtimeRoot "Contents\Resources\torchtrt-runtime\bin\.cache.blue-runtime.sha256")
    New-TextFile -Path (Join-Path $guiRoot "CorridorKey.exe")
    New-RuntimeSidecar -Path (Join-Path $guiRoot "corridorkey_runtime.ini") -RuntimeRoot $runtimeRoot
    New-TextFile -Path (Join-Path $ofxRoot "Contents\Win64\CorridorKey.ofx")
    New-RuntimeSidecar -Path (Join-Path $ofxRoot "Contents\Resources\corridorkey_runtime.ini") -RuntimeRoot $runtimeRoot
    New-TextFile -Path (Join-Path $adobeRoot "Contents\Win64\corridorkey_adobe_green.aex")
    New-RuntimeSidecar -Path (Join-Path $adobeRoot "Contents\Resources\corridorkey_runtime.ini") -RuntimeRoot $runtimeRoot
    New-TextFile -Path (Join-Path $adobeRoot "Contents\Win64\corridorkey_adobe_blue.aex")

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $manifestPath `
        -ReportPath $reportPath `
        -RunRuntimeCommands `
        -RuntimeCommandPath $fakeRuntime `
        -RuntimeCommandTimeoutSeconds 5
    if ($LASTEXITCODE -ne 0) {
        throw "Suite install readiness validation should pass."
    }
    if (-not (Test-Path -LiteralPath $reportPath)) {
        throw "Readiness report was not written: $reportPath"
    }

    $report = Get-Content -Path $reportPath -Raw | ConvertFrom-Json
    Assert-ReportHealthy -Report $report

    Remove-Item -LiteralPath (Join-Path $runtimeRoot "Contents\Resources\models\green_fixture.onnx") -Force
    $missingModelReportPath = Join-Path $tempRoot "readiness_missing_model.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $manifestPath `
        -ReportPath $missingModelReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when an installed model is missing."
    }
    $missingModelReport = Get-Content -Path $missingModelReportPath -Raw | ConvertFrom-Json
    if ([bool]$missingModelReport.validation_passed) {
        throw "Missing-model readiness report should not pass."
    }
    if ([bool]$missingModelReport.components.green.healthy) {
        throw "Green component should be unhealthy when its installed model is missing."
    }
    if ((@($missingModelReport.issues) -join " | ") -notmatch [regex]::Escape("green_fixture.onnx")) {
        throw "Missing-model readiness issue should name the missing model."
    }

    New-TextFile -Path (Join-Path $runtimeRoot "Contents\Resources\models\green_fixture.onnx")
    Remove-Item -LiteralPath (Join-Path $ofxRoot "Contents\Resources\corridorkey_runtime.ini") -Force
    $missingSidecarReportPath = Join-Path $tempRoot "readiness_missing_sidecar.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $manifestPath `
        -ReportPath $missingSidecarReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when a selected host sidecar is missing."
    }
    $missingSidecarReport = Get-Content -Path $missingSidecarReportPath -Raw | ConvertFrom-Json
    if ([bool]$missingSidecarReport.components."ofx-resolve-fusion".healthy) {
        throw "OFX Resolve/Fusion should be unhealthy when its runtime sidecar is missing."
    }
    if ((@($missingSidecarReport.issues) -join " | ") -notmatch [regex]::Escape("corridorkey_runtime.ini")) {
        throw "Missing-sidecar readiness issue should name corridorkey_runtime.ini."
    }
    New-RuntimeSidecar -Path (Join-Path $ofxRoot "Contents\Resources\corridorkey_runtime.ini") -RuntimeRoot $runtimeRoot

    Remove-Item -LiteralPath (Join-Path $adobeRoot "Contents\Win64\corridorkey_adobe_blue.aex") -Force
    $missingAdobePluginReportPath = Join-Path $tempRoot "readiness_missing_adobe_blue.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $manifestPath `
        -ReportPath $missingAdobePluginReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when an expected Adobe plugin binary is missing."
    }
    $missingAdobePluginReport = Get-Content -Path $missingAdobePluginReportPath -Raw | ConvertFrom-Json
    if ([bool]$missingAdobePluginReport.components.adobe.healthy) {
        throw "Adobe component should be unhealthy when corridorkey_adobe_blue.aex is missing."
    }
    New-TextFile -Path (Join-Path $adobeRoot "Contents\Win64\corridorkey_adobe_blue.aex")

    New-TestDistributionManifest -Path $manifestPath -IncludeFutureGreenPack
    $futurePackReportPath = Join-Path $tempRoot "readiness_future_pack.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $manifestPath `
        -ReportPath $futurePackReportPath
    if ($LASTEXITCODE -ne 0) {
        $futurePackReport = Get-Content -Path $futurePackReportPath -Raw | ConvertFrom-Json
        throw "Readiness should validate inventory-recorded packs, not fail on future manifest packs. Issues: $($futurePackReport.issues -join ' | ')"
    }

    $missingManifestReportPath = Join-Path $tempRoot "readiness_missing_manifest.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath (Join-Path $tempRoot "missing_distribution_manifest.json") `
        -ReportPath $missingManifestReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when selected model packs cannot be checked against a manifest."
    }
    $missingManifestReport = Get-Content -Path $missingManifestReportPath -Raw | ConvertFrom-Json
    if ([bool]$missingManifestReport.components.green.healthy -or [bool]$missingManifestReport.components.blue.healthy) {
        throw "Green and Blue components should be unhealthy when the distribution manifest is unavailable."
    }

    $malformedManifestPath = Join-Path $tempRoot "malformed_distribution_manifest.json"
    New-TextFile -Path $malformedManifestPath -Content "{"
    $malformedManifestReportPath = Join-Path $tempRoot "readiness_malformed_manifest.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $malformedManifestPath `
        -ReportPath $malformedManifestReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail but still report malformed manifests."
    }
    if (-not (Test-Path -LiteralPath $malformedManifestReportPath -PathType Leaf)) {
        throw "Malformed-manifest readiness report should still be written."
    }

    $escapeManifestPath = Join-Path $tempRoot "escape_distribution_manifest.json"
    New-TestDistributionManifest -Path $escapeManifestPath
    $escapeManifest = Get-Content -Path $escapeManifestPath -Raw | ConvertFrom-Json
    $escapeManifest.packs."green-models".files[0].filename = "..\escaped_model.onnx"
    New-TextFile -Path $escapeManifestPath -Content ($escapeManifest | ConvertTo-Json -Depth 12)
    $escapeReportPath = Join-Path $tempRoot "readiness_escape_manifest.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $escapeManifestPath `
        -ReportPath $escapeReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when a manifest path escapes the resources root."
    }
    $escapeReport = Get-Content -Path $escapeReportPath -Raw | ConvertFrom-Json
    if ((@($escapeReport.issues) -join " | ") -notmatch "escapes") {
        throw "Escaping manifest path should be reported as an actionable issue."
    }

    $runtimeOnlyRoot = Join-Path $tempRoot "RuntimeOnly"
    New-RuntimeOnlyInventory -RuntimeRoot $runtimeOnlyRoot
    New-RuntimeCorePayload -RuntimeRoot $runtimeOnlyRoot
    $runtimeOnlyReportPath = Join-Path $tempRoot "readiness_runtime_only.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeOnlyRoot `
        -DistributionManifestPath (Join-Path $tempRoot "missing_distribution_manifest_for_runtime_only.json") `
        -ReportPath $runtimeOnlyReportPath
    if ($LASTEXITCODE -ne 0) {
        $runtimeOnlyReport = Get-Content -Path $runtimeOnlyReportPath -Raw | ConvertFrom-Json
        throw "Runtime-only readiness should not require a model distribution manifest. Issues: $($runtimeOnlyReport.issues -join ' | ')"
    }
    $runtimeOnlyReport = Get-Content -Path $runtimeOnlyReportPath -Raw | ConvertFrom-Json
    foreach ($optionalComponent in @("gui", "ofx-resolve-fusion", "ofx-nuke", "adobe", "green", "blue")) {
        if ([bool]$runtimeOnlyReport.components.$optionalComponent.selected) {
            throw "Runtime-only readiness should record optional component '$optionalComponent' as unselected."
        }
    }

    $extraArchiveFile = Join-Path $runtimeRoot "Contents\Resources\torchtrt-runtime\bin\stale_extra.dll"
    New-TextFile -Path $extraArchiveFile
    $extraArchiveReportPath = Join-Path $tempRoot "readiness_extra_archive_file.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $manifestPath `
        -ReportPath $extraArchiveReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when an extracted archive pack has extra files."
    }
    $extraArchiveReport = Get-Content -Path $extraArchiveReportPath -Raw | ConvertFrom-Json
    if ((@($extraArchiveReport.issues) -join " | ") -notmatch "expected exactly") {
        throw "Extra archive file should be reported as an exact file count issue."
    }
    Remove-Item -LiteralPath $extraArchiveFile -Force

    $missingArchiveFilesManifestPath = Join-Path $tempRoot "missing_archive_files_distribution_manifest.json"
    New-TestDistributionManifest -Path $missingArchiveFilesManifestPath
    $missingArchiveFilesManifest = Get-Content -Path $missingArchiveFilesManifestPath -Raw | ConvertFrom-Json
    $missingArchiveFilesManifest.packs."blue-runtime".PSObject.Properties.Remove("files")
    New-TextFile -Path $missingArchiveFilesManifestPath -Content ($missingArchiveFilesManifest | ConvertTo-Json -Depth 12)
    $missingArchiveFilesReportPath = Join-Path $tempRoot "readiness_missing_archive_manifest_files.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $missingArchiveFilesManifestPath `
        -ReportPath $missingArchiveFilesReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when an archive model pack manifest has no files list."
    }
    $missingArchiveFilesReport = Get-Content -Path $missingArchiveFilesReportPath -Raw | ConvertFrom-Json
    if ((@($missingArchiveFilesReport.issues) -join " | ") -notmatch "blue-runtime.*does not define files") {
        throw "Missing archive files list should be reported as an actionable issue."
    }

    $missingFilesManifestPath = Join-Path $tempRoot "missing_files_distribution_manifest.json"
    New-TestDistributionManifest -Path $missingFilesManifestPath
    $missingFilesManifest = Get-Content -Path $missingFilesManifestPath -Raw | ConvertFrom-Json
    $missingFilesManifest.packs."green-models".PSObject.Properties.Remove("files")
    New-TextFile -Path $missingFilesManifestPath -Content ($missingFilesManifest | ConvertTo-Json -Depth 12)
    $missingFilesReportPath = Join-Path $tempRoot "readiness_missing_manifest_files.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $missingFilesManifestPath `
        -ReportPath $missingFilesReportPath
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when a model pack manifest has no files list."
    }
    if (-not (Test-Path -LiteralPath $missingFilesReportPath -PathType Leaf)) {
        throw "Missing-files manifest report should still be written."
    }
    $missingFilesReport = Get-Content -Path $missingFilesReportPath -Raw | ConvertFrom-Json
    if ((@($missingFilesReport.issues) -join " | ") -notmatch "does not define files") {
        throw "Missing files list should be reported as an actionable issue."
    }

    $hangingRuntime = Join-Path $tempRoot "hanging_corridorkey.ps1"
    New-FakeRuntimeCommand -Path $hangingRuntime -Mode "ChildHang"
    $timeoutReportPath = Join-Path $tempRoot "readiness_timeout.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $manifestPath `
        -ReportPath $timeoutReportPath `
        -RunRuntimeCommands `
        -RuntimeCommandPath $hangingRuntime `
        -RuntimeCommandTimeoutSeconds 1
    if ($LASTEXITCODE -eq 0) {
        throw "Suite install readiness validation should fail when runtime command smoke times out."
    }
    $timeoutReport = Get-Content -Path $timeoutReportPath -Raw | ConvertFrom-Json
    if (-not [bool]$timeoutReport.runtime_commands.commands.info.timed_out) {
        throw "Timed-out runtime command should be recorded in the readiness report."
    }

    $originalLocalAppData = $env:LOCALAPPDATA
    try {
        $env:LOCALAPPDATA = Join-Path $tempRoot "LocalAppData"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
            -RuntimeRoot $runtimeRoot `
            -DistributionManifestPath $manifestPath
        if ($LASTEXITCODE -ne 0) {
            throw "Suite install readiness validation should pass with the default report path."
        }
        $defaultReportPath = Join-Path $env:LOCALAPPDATA "CorridorKey\Reports\suite_readiness.json"
        if (-not (Test-Path -LiteralPath $defaultReportPath -PathType Leaf)) {
            throw "Default readiness report should be written under LOCALAPPDATA: $defaultReportPath"
        }
        if ([System.IO.Path]::GetFullPath($defaultReportPath).StartsWith([System.IO.Path]::GetFullPath($runtimeRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Default readiness report should not be written inside the installed runtime root."
        }
    } finally {
        $env:LOCALAPPDATA = $originalLocalAppData
    }
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "[PASS] Windows suite install readiness checks passed." -ForegroundColor Green
