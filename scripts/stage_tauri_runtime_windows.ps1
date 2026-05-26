param(
    [string]$Version = "",
    [string]$BuildDir = "",
    [string]$OrtRoot = "",
    [string]$ReleaseSuffix = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$tauriRuntimeDir = Join-Path $repoRoot "src\gui\src-tauri\resources\runtime"
. (Join-Path $PSScriptRoot "windows_runtime_helpers.ps1")
$Version = Initialize-CorridorKeyVersion -RepoRoot $repoRoot -Version $Version

$portableArgs = @{}
if (-not [string]::IsNullOrWhiteSpace($Version)) {
    $portableArgs["Version"] = $Version
}
if (-not [string]::IsNullOrWhiteSpace($BuildDir)) {
    $portableArgs["BuildDir"] = $BuildDir
}
if (-not [string]::IsNullOrWhiteSpace($OrtRoot)) {
    $portableArgs["OrtRoot"] = $OrtRoot
}
if (-not [string]::IsNullOrWhiteSpace($ReleaseSuffix)) {
    $portableArgs["ReleaseSuffix"] = $ReleaseSuffix
}

Write-Host "[1/3] Building the portable Windows runtime bundle..." -ForegroundColor Cyan
& (Join-Path $repoRoot "scripts\package_windows.ps1") @portableArgs
if ($LASTEXITCODE -ne 0) {
    throw "Portable Windows runtime packaging failed."
}

$normalizedSuffix = ""
if (-not [string]::IsNullOrWhiteSpace($ReleaseSuffix)) {
    $normalizedSuffix = "_" + $ReleaseSuffix.Trim("_")
}
$portableBundleDir = Join-Path $repoRoot ("dist\CorridorKey_Runtime_v${Version}_Windows${normalizedSuffix}")
if (-not (Test-Path $portableBundleDir)) {
    throw "Expected portable runtime bundle at $portableBundleDir"
}

Write-Host "[2/3] Staging runtime payload for the Tauri installer..." -ForegroundColor Cyan
if (Test-Path $tauriRuntimeDir) {
    Remove-Item $tauriRuntimeDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tauriRuntimeDir -Force | Out-Null

$rootFiles = Get-ChildItem -Path $portableBundleDir -File -ErrorAction Stop |
    Where-Object { $_.Name -notin @("CorridorKey_Runtime.exe", "README.txt", "smoke_test.bat") }
foreach ($file in $rootFiles) {
    Copy-Item $file.FullName (Join-Path $tauriRuntimeDir $file.Name) -Force
}

$ffmpegCommand = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
if ($null -eq $ffmpegCommand) {
    throw "ffmpeg.exe was not found on PATH. It is required for Tauri result preview proxies."
}
$ffmpegItem = Get-Item -LiteralPath $ffmpegCommand.Source -ErrorAction Stop
$ffmpegSource = if ($ffmpegItem.LinkType -and $ffmpegItem.Target.Count -gt 0) {
    $ffmpegItem.Target[0]
} else {
    $ffmpegItem.FullName
}
Copy-Item -LiteralPath $ffmpegSource (Join-Path $tauriRuntimeDir "ffmpeg.exe") -Force

foreach ($directoryName in @("models", "torchtrt-runtime")) {
    $sourceDir = Join-Path $portableBundleDir $directoryName
    if (Test-Path $sourceDir) {
        Copy-Item $sourceDir (Join-Path $tauriRuntimeDir $directoryName) -Recurse -Force
    }
}

Write-Host "[3/3] Runtime payload staged for Tauri at: $tauriRuntimeDir" -ForegroundColor Green
