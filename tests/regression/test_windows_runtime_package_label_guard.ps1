Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repoRoot "scripts\windows_runtime_helpers.ps1")

$packageScript = Join-Path $repoRoot "scripts\package_windows.ps1"
if (-not (Test-Path -LiteralPath $packageScript -PathType Leaf)) {
    throw "Expected runtime package script not found: $packageScript"
}

function Find-CorridorKeyBuiltCliBuildDir {
    $candidateBuildDirs = @(
        (Join-Path $repoRoot "build\release"),
        (Join-Path $repoRoot "build\debug")
    )

    foreach ($candidateBuildDir in $candidateBuildDirs) {
        $candidateCli = Join-Path $candidateBuildDir "src\cli\corridorkey.exe"
        if (Test-Path -LiteralPath $candidateCli -PathType Leaf) {
            return $candidateBuildDir
        }
    }

    throw "No built corridorkey.exe found under build\debug or build\release. Run the Windows build before this regression."
}

$version = Get-CorridorKeyProjectVersion -RepoRoot $repoRoot
$buildDir = Find-CorridorKeyBuiltCliBuildDir
$releaseSuffix = "RTX_LabelGuard"
$distDir = Join-Path $repoRoot "dist\CorridorKey_Runtime_v${version}_Windows_$releaseSuffix"
$zipPath = "$distDir.zip"
$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$previousPath = $env:PATH

try {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $env:PATH = Join-Path $env:SystemRoot "System32"
    try {
        $output = & $powerShellPath `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File $packageScript `
            -Version $version `
            -BuildDir $buildDir `
            -ReleaseSuffix $releaseSuffix `
            -ExpectedSourceRevision "deadbeef" 2>&1
        $exitCode = if (Test-Path Variable:LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
        $env:PATH = $previousPath
    }
    $outputText = ($output | Out-String).Trim()

    if ($exitCode -eq 0) {
        throw "Runtime packaging should reject a packaged engine whose source revision does not match the expected revision."
    }
    if ($outputText -notmatch "Packaged runtime source revision mismatch") {
        throw "Expected packaged runtime source revision mismatch, got:`n$outputText"
    }
    if ($outputText -notmatch "Rebuild from the current commit before packaging") {
        throw "Expected stale-build recovery guidance, got:`n$outputText"
    }
} finally {
    Remove-Item -LiteralPath $distDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
}

Write-Host "[PASS] Windows runtime package label guard regression checks passed." -ForegroundColor Green
