Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$windowsWrapperPath = Join-Path $repoRoot "scripts\windows.ps1"

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

if ($Rest.Count -eq 0 -or $Rest[-1] -ne "--json") {
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

if (-not (Test-Path -LiteralPath $windowsWrapperPath -PathType Leaf)) {
    throw "Expected Windows wrapper not found: $windowsWrapperPath"
}

$windowsWrapper = Get-Content -Path $windowsWrapperPath -Raw
Assert-Contains -Content $windowsWrapper -Needle '"validate-suite"' -Label "scripts/windows.ps1"
Assert-Contains -Content $windowsWrapper -Needle "validate_suite_install_windows.ps1" -Label "scripts/windows.ps1"
Assert-Contains -Content $windowsWrapper -Needle '$Task -ne "validate-suite" -and [string]::IsNullOrWhiteSpace($DisplayVersionLabel)' -Label "scripts/windows.ps1"
foreach ($parameterName in @(
        "SuiteRuntimeRoot",
        "SuiteDistributionManifestPath",
        "SuiteReadinessReportPath",
        "RunSuiteRuntimeCommands",
        "SuiteRuntimeCommandPath",
        "SuiteRuntimeCommandTimeoutSeconds",
        'Alias("RuntimeRoot")',
        'Alias("DistributionManifestPath")',
        'Alias("ReportPath")',
        'Alias("RunRuntimeCommands")',
        'Alias("RuntimeCommandPath")',
        'Alias("RuntimeCommandTimeoutSeconds")'
    )) {
    Assert-Contains -Content $windowsWrapper -Needle $parameterName -Label "scripts/windows.ps1"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("corridorkey_suite_readiness_wrapper_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $runtimeRoot = Join-Path $tempRoot "Runtime"
    $fakeRuntime = Join-Path $tempRoot "fake_corridorkey.ps1"
    $hangingRuntime = Join-Path $tempRoot "hanging_corridorkey.ps1"
    $reportPath = Join-Path $tempRoot "readiness_from_wrapper.json"
    $timeoutReportPath = Join-Path $tempRoot "timeout_from_wrapper.json"
    $timeoutStdoutPath = Join-Path $tempRoot "timeout_from_wrapper.stdout.txt"
    $timeoutStderrPath = Join-Path $tempRoot "timeout_from_wrapper.stderr.txt"
    $missingManifestPath = Join-Path $tempRoot "missing_distribution_manifest.json"

    New-RuntimeOnlyInventory -RuntimeRoot $runtimeRoot
    New-RuntimeCorePayload -RuntimeRoot $runtimeRoot
    New-FakeRuntimeCommand -Path $fakeRuntime
    New-FakeRuntimeCommand -Path $hangingRuntime -Mode "ChildHang"

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $windowsWrapperPath `
        -Task validate-suite `
        -RuntimeRoot $runtimeRoot `
        -DistributionManifestPath $missingManifestPath `
        -ReportPath $reportPath `
        -RunRuntimeCommands `
        -RuntimeCommandPath $fakeRuntime `
        -RuntimeCommandTimeoutSeconds 3
    if ($LASTEXITCODE -ne 0) {
        throw "Suite readiness validation through scripts/windows.ps1 should pass."
    }

    if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
        throw "Wrapper should write the configured readiness report path: $reportPath"
    }

    $report = Get-Content -Path $reportPath -Raw | ConvertFrom-Json
    if (-not [bool]$report.validation_passed) {
        throw "Wrapper readiness report should pass. Issues: $($report.issues -join ' | ')"
    }
    if ([System.IO.Path]::GetFullPath($report.distribution_manifest_path) -ne [System.IO.Path]::GetFullPath($missingManifestPath)) {
        throw "Wrapper should forward SuiteDistributionManifestPath."
    }
    if (-not [bool]$report.runtime_commands.attempted) {
        throw "Wrapper should forward RunSuiteRuntimeCommands."
    }
    foreach ($command in @("info", "doctor", "models", "presets")) {
        if (-not [bool]$report.runtime_commands.commands.$command.succeeded) {
            throw "Wrapper runtime command '$command' should succeed."
        }
    }

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $windowsWrapperPath `
            -Task validate-suite `
            -SuiteRuntimeRoot $runtimeRoot `
            -SuiteDistributionManifestPath $missingManifestPath `
            -SuiteReadinessReportPath $timeoutReportPath `
            -RunSuiteRuntimeCommands `
            -SuiteRuntimeCommandPath $hangingRuntime `
            -SuiteRuntimeCommandTimeoutSeconds 1 > $timeoutStdoutPath 2> $timeoutStderrPath
        $timeoutExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($timeoutExitCode -eq 0) {
        throw "Suite readiness validation through scripts/windows.ps1 should fail when wrapper-forwarded timeout is reached."
    }

    $timeoutReport = Get-Content -Path $timeoutReportPath -Raw | ConvertFrom-Json
    if (-not [bool]$timeoutReport.runtime_commands.commands.info.timed_out) {
        throw "Wrapper should forward SuiteRuntimeCommandTimeoutSeconds to the validator."
    }
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "[PASS] Windows suite readiness wrapper checks passed." -ForegroundColor Green
