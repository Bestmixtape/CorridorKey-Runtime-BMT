Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

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

$agents = Get-Content -LiteralPath (Join-Path $repoRoot "AGENTS.md") -Raw
$claude = Get-Content -LiteralPath (Join-Path $repoRoot "CLAUDE.md") -Raw
$releaseGuidelines = Get-Content -LiteralPath (Join-Path $repoRoot "docs\RELEASE_GUIDELINES.md") -Raw
$selfHostedRunner = Get-Content -LiteralPath (Join-Path $repoRoot "docs\ci\SELF_HOSTED_RUNNER.md") -Raw
$readme = Get-Content -LiteralPath (Join-Path $repoRoot "README.md") -Raw
$supportMatrix = Get-Content -LiteralPath (Join-Path $repoRoot "help\SUPPORT_MATRIX.md") -Raw

foreach ($document in @(
        @{ Content = $agents; Label = "AGENTS.md" },
        @{ Content = $claude; Label = "CLAUDE.md" },
        @{ Content = $releaseGuidelines; Label = "docs/RELEASE_GUIDELINES.md" },
        @{ Content = $selfHostedRunner; Label = "docs/ci/SELF_HOSTED_RUNNER.md" }
    )) {
    Assert-Contains -Content $document.Content -Needle "CUDA Toolkit 12.9" -Label $document.Label
    Assert-NotContains -Content $document.Content -Needle "CUDA Toolkit 12.8" -Label $document.Label
}

Assert-Contains `
    -Content $readme `
    -Needle "-FfmpegPath" `
    -Label "README.md package-runtime command"
Assert-Contains `
    -Content $readme `
    -Needle "CORRIDORKEY_FFMPEG_PATH" `
    -Label "README.md package-runtime command"

Assert-Contains `
    -Content $supportMatrix `
    -Needle "Windows suite" `
    -Label "help/SUPPORT_MATRIX.md GUI scope"
Assert-Contains `
    -Content $supportMatrix `
    -Needle "shared CLI/runtime core" `
    -Label "help/SUPPORT_MATRIX.md GUI scope"
Assert-NotContains `
    -Content $supportMatrix `
    -Needle "independent installer that embeds" `
    -Label "help/SUPPORT_MATRIX.md GUI scope"

Write-Host "[PASS] Windows documentation contract checks passed." -ForegroundColor Green
