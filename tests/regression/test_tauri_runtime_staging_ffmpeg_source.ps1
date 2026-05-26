Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $repoRoot "scripts\stage_tauri_runtime_windows.ps1"
$content = Get-Content -LiteralPath $scriptPath -Raw

if ($content -match "Get-Command\s+ffmpeg(\.exe)?") {
    throw "Tauri runtime staging must not copy the first ffmpeg.exe found on PATH."
}

if ($content -notmatch "CORRIDORKEY_FFMPEG_PATH") {
    throw "Tauri runtime staging should require an explicit FFmpeg source when the portable bundle does not provide one."
}

if ($content -notmatch 'Join-Path\s+\$PortableBundleDir\s+"ffmpeg\.exe"') {
    throw "Tauri runtime staging should prefer an ffmpeg.exe already present in the portable runtime bundle."
}

if ($content -notmatch '\.Name\s+-ne\s+"ffmpeg\.exe"') {
    throw "CORRIDORKEY_FFMPEG_PATH must be validated to point at ffmpeg.exe specifically."
}

if ($content -notmatch '&\s+\$CandidatePath\s+-version') {
    throw "Tauri runtime staging should probe the selected ffmpeg.exe before copying it."
}
