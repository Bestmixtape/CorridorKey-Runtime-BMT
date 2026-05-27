param(
    [string]$Version = "",
    [string]$BuildDir = "",
    [string]$OrtRoot = "",
    [string]$ReleaseSuffix = "",
    [switch]$CompileContexts,
    [string]$FfmpegPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $repoRoot "src\gui\src-tauri"
$runtimeResourceDir = Join-Path $tauriRoot "resources\runtime"
. (Join-Path $PSScriptRoot "windows_runtime_helpers.ps1")

function Clear-StagedRuntimePayload {
    param([string]$RuntimeResourceDir)

    if (-not (Test-Path $RuntimeResourceDir)) {
        return
    }

    Get-ChildItem -Path $RuntimeResourceDir -Force |
        Where-Object { $_.Name -notin @(".gitignore", ".gitkeep") } |
        Remove-Item -Recurse -Force
}

function Invoke-TauriGuiBuild {
    $guiRoot = Join-Path $repoRoot "src\gui"
    Push-Location $guiRoot
    try {
        & pnpm tauri build --no-bundle --ci
        $exitCode = if (Test-Path Variable:LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
        if ($exitCode -ne 0) {
            throw "Tauri GUI build failed."
        }
    } finally {
        Pop-Location
    }
}

$Version = Initialize-CorridorKeyVersion -RepoRoot $repoRoot -Version $Version -SyncGuiMetadata
if ([string]::IsNullOrWhiteSpace($BuildDir)) {
    $BuildDir = Join-Path $repoRoot "build\release"
}
$preferredTrack = Get-CorridorKeyWindowsTrackFromReleaseSuffix -ReleaseSuffix $ReleaseSuffix -DefaultTrack "rtx"
$OrtRoot = Resolve-CorridorKeyWindowsOrtRoot -RepoRoot $repoRoot -ExplicitRoot $OrtRoot -PreferredTrack $preferredTrack

$normalizedSuffix = ""
if (-not [string]::IsNullOrWhiteSpace($ReleaseSuffix)) {
    $normalizedSuffix = "_" + $ReleaseSuffix.Trim("_")
}
$releaseBasename = "CorridorKey_Runtime_v${Version}_Windows${normalizedSuffix}"
$portableBundleDir = Join-Path $repoRoot ("dist\" + $releaseBasename)
$zipPath = Join-Path $repoRoot ("dist\" + $releaseBasename + ".zip")

Write-Host "[1/4] Clearing stale Tauri runtime resources..." -ForegroundColor Cyan
Clear-StagedRuntimePayload -RuntimeResourceDir $runtimeResourceDir

Write-Host "[2/4] Building the Tauri GUI executable..." -ForegroundColor Cyan
Invoke-TauriGuiBuild

Write-Host "[3/4] Building the supported portable Windows runtime package..." -ForegroundColor Cyan
$portableArgs = @{
    Version = $Version
    BuildDir = $BuildDir
    OrtRoot = $OrtRoot
}
if (-not [string]::IsNullOrWhiteSpace($ReleaseSuffix)) {
    $portableArgs["ReleaseSuffix"] = $ReleaseSuffix
}
if ($CompileContexts.IsPresent) {
    $portableArgs["CompileContexts"] = $true
}
if (-not [string]::IsNullOrWhiteSpace($FfmpegPath)) {
    $portableArgs["FfmpegPath"] = $FfmpegPath
}

& (Join-Path $repoRoot "scripts\package_windows.ps1") @portableArgs
$portableExitCode = if (Test-Path Variable:LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
if ($portableExitCode -ne 0) {
    throw "Portable Windows runtime packaging failed."
}

if (-not (Test-Path -LiteralPath $portableBundleDir -PathType Container)) {
    throw "Expected portable runtime bundle at $portableBundleDir"
}
if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    throw "Expected portable runtime archive at $zipPath"
}

$sha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "[4/4] Runtime package ready." -ForegroundColor Green
Write-Host "[runtime] Bundle: $portableBundleDir" -ForegroundColor Green
Write-Host "[runtime] Archive: $zipPath" -ForegroundColor Green
Write-Host "[runtime] SHA256:  $sha256" -ForegroundColor Green
