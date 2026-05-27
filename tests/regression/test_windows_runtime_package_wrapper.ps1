Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$windowsWrapperPath = Join-Path $repoRoot "scripts\windows.ps1"
$runtimePackageScriptPath = Join-Path $repoRoot "scripts\package_runtime_installer_windows.ps1"
$prepareRtxScriptPath = Join-Path $repoRoot "scripts\prepare_windows_rtx_release.ps1"

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

if (-not (Test-Path -LiteralPath $windowsWrapperPath -PathType Leaf)) {
    throw "Expected Windows wrapper not found: $windowsWrapperPath"
}
if (-not (Test-Path -LiteralPath $runtimePackageScriptPath -PathType Leaf)) {
    throw "Expected runtime package script not found: $runtimePackageScriptPath"
}
if (-not (Test-Path -LiteralPath $prepareRtxScriptPath -PathType Leaf)) {
    throw "Expected prepare-rtx script not found: $prepareRtxScriptPath"
}

$windowsWrapper = Get-Content -LiteralPath $windowsWrapperPath -Raw
$runtimePackageScript = Get-Content -LiteralPath $runtimePackageScriptPath -Raw
$prepareRtxScript = Get-Content -LiteralPath $prepareRtxScriptPath -Raw

Assert-Contains `
    -Content $windowsWrapper `
    -Needle '$Task -in @("package-suite", "package-runtime", "release")' `
    -Label "scripts/windows.ps1 default track resolution"
Assert-Contains `
    -Content $windowsWrapper `
    -Needle '$resolvedTrack = "rtx"' `
    -Label "scripts/windows.ps1 default track resolution"
Assert-Contains `
    -Content $windowsWrapper `
    -Needle '"rtx" { @("RTX") }' `
    -Label "scripts/windows.ps1 runtime track mapping"
Assert-Contains `
    -Content $windowsWrapper `
    -Needle "Task 'package-runtime' currently supports only -Track rtx" `
    -Label "scripts/windows.ps1 runtime track guard"
Assert-NotContains `
    -Content $windowsWrapper `
    -Needle '"dml" { @("DirectML") }' `
    -Label "scripts/windows.ps1 package-runtime track mapping"
Assert-Contains `
    -Content $windowsWrapper `
    -Needle '-FfmpegPath' `
    -Label "scripts/windows.ps1 package-runtime FFmpeg argument"
Assert-Contains `
    -Content $windowsWrapper `
    -Needle '-ExpectedSourceRevision' `
    -Label "scripts/windows.ps1 package-runtime stale source guard"
Assert-NotContains `
    -Content $windowsWrapper `
    -Needle '"package-ofx", "package-adobe", "package-runtime", "package-suite", "smoke-adobe-host"' `
    -Label "scripts/windows.ps1 pre-package runtime CLI probe"
Assert-Contains `
    -Content $windowsWrapper `
    -Needle '-BuildDir", $runtimeBuildDir' `
    -Label "scripts/windows.ps1 package-runtime preset build dir"

Assert-Contains `
    -Content $runtimePackageScript `
    -Needle 'scripts\package_windows.ps1' `
    -Label "scripts/package_runtime_installer_windows.ps1"
Assert-Contains `
    -Content $runtimePackageScript `
    -Needle 'pnpm tauri build --no-bundle --ci' `
    -Label "scripts/package_runtime_installer_windows.ps1 GUI build"
Assert-Contains `
    -Content $runtimePackageScript `
    -Needle 'Test-Path Variable:LASTEXITCODE' `
    -Label "scripts/package_runtime_installer_windows.ps1 strict-mode exit-code handling"
Assert-Contains `
    -Content $runtimePackageScript `
    -Needle '$portableArgs["FfmpegPath"] = $FfmpegPath' `
    -Label "scripts/package_runtime_installer_windows.ps1 FFmpeg forwarding"
Assert-Contains `
    -Content $runtimePackageScript `
    -Needle '$portableArgs["ExpectedSourceRevision"] = $ExpectedSourceRevision' `
    -Label "scripts/package_runtime_installer_windows.ps1 source revision forwarding"
Assert-Contains `
    -Content $runtimePackageScript `
    -Needle 'Clear-StagedRuntimePayload -RuntimeResourceDir $runtimeResourceDir' `
    -Label "scripts/package_runtime_installer_windows.ps1 stale resource cleanup"
Assert-NotContains `
    -Content $runtimePackageScript `
    -Needle 'pnpm tauri build --bundles nsis' `
    -Label "scripts/package_runtime_installer_windows.ps1"
Assert-NotContains `
    -Content $runtimePackageScript `
    -Needle 'Resolve-NsisBinDirs' `
    -Label "scripts/package_runtime_installer_windows.ps1"

$portablePackageScriptPath = Join-Path $repoRoot "scripts\package_windows.ps1"
$portablePackageScript = Get-Content -LiteralPath $portablePackageScriptPath -Raw
Assert-Contains `
    -Content $portablePackageScript `
    -Needle '[string]$FfmpegPath = ""' `
    -Label "scripts/package_windows.ps1"
Assert-Contains `
    -Content $portablePackageScript `
    -Needle 'CORRIDORKEY_FFMPEG_PATH' `
    -Label "scripts/package_windows.ps1"
Assert-Contains `
    -Content $portablePackageScript `
    -Needle 'Copy-Item -LiteralPath $ffmpegSource -Destination (Join-Path $distDir "ffmpeg.exe")' `
    -Label "scripts/package_windows.ps1"
Assert-Contains `
    -Content $portablePackageScript `
    -Needle 'Assert-CorridorKeyPackagedEngineIdentity' `
    -Label "scripts/package_windows.ps1"
Assert-Contains `
    -Content $portablePackageScript `
    -Needle 'Copy-CudaNppRuntimeDlls -DestinationDir $distDir' `
    -Label "scripts/package_windows.ps1"
Assert-Contains `
    -Content $portablePackageScript `
    -Needle '"nppig64_12.dll"' `
    -Label "scripts/package_windows.ps1"
Assert-Contains `
    -Content $portablePackageScript `
    -Needle 'Packaged runtime source revision mismatch' `
    -Label "scripts/package_windows.ps1"
Assert-NotContains `
    -Content $portablePackageScript `
    -Needle 'Get-Command ffmpeg' `
    -Label "scripts/package_windows.ps1"

Assert-NotContains `
    -Content $prepareRtxScript `
    -Needle 'scripts\package_windows.ps1' `
    -Label "scripts/prepare_windows_rtx_release.ps1"
Assert-NotContains `
    -Content $prepareRtxScript `
    -Needle 'corridorkey-gui.exe' `
    -Label "scripts/prepare_windows_rtx_release.ps1"

Write-Host "[PASS] Windows runtime package wrapper checks passed." -ForegroundColor Green
