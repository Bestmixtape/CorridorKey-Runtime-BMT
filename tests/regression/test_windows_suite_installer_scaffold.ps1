Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$windowsWrapperPath = Join-Path $repoRoot "scripts\windows.ps1"
$suitePackageScriptPath = Join-Path $repoRoot "scripts\package_suite_installer_windows.ps1"
$manifestPath = Join-Path $repoRoot "scripts\installer\distribution_manifest.json"
$agentsPath = Join-Path $repoRoot "AGENTS.md"
$claudePath = Join-Path $repoRoot "CLAUDE.md"

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

function Read-NormalizedText {
    param([string]$Path)

    return (Get-Content -Path $Path -Raw) -replace "`r`n", "`n"
}

$windowsWrapper = Get-Content -Path $windowsWrapperPath -Raw
$agentsDoc = Read-NormalizedText -Path $agentsPath
$claudeDoc = Read-NormalizedText -Path $claudePath

Assert-Contains -Content $windowsWrapper -Needle '"package-suite"' -Label "scripts/windows.ps1"
Assert-Contains -Content $windowsWrapper -Needle "package_suite_installer_windows.ps1" -Label "scripts/windows.ps1"
Assert-Contains -Content $windowsWrapper -Needle '$arguments += @("-Flavor", $Flavor)' -Label "scripts/windows.ps1"
Assert-Contains -Content $windowsWrapper -Needle '$arguments += @("-RenderOnly")' -Label "scripts/windows.ps1"
foreach ($suitePackageArgument in @(
    "SuitePayloadRoot",
    "SuitePayloadOutputRoot",
    "RuntimePackageRoot",
    "OfxPackageRoot",
    "AdobePackageRoot",
    "ModelPayloadDir",
    "ISCCPath",
    "SuitePackageDistributionManifestPath",
    "SuitePackageOutputDir",
    "SuitePackageOutputBaseFilename",
    "SuitePackageOutputIssPath"
)) {
    Assert-Contains -Content $windowsWrapper -Needle $suitePackageArgument -Label "scripts/windows.ps1 package-suite payload arguments"
}

foreach ($standaloneTask in @("package-ofx", "package-adobe", "package-runtime")) {
    Assert-Contains -Content $windowsWrapper -Needle "`"$standaloneTask`"" -Label "scripts/windows.ps1"
}
foreach ($standaloneDelegate in @(
    "package_ofx_installer_windows.ps1",
    "package_adobe_plugins_windows.ps1",
    "package_runtime_installer_windows.ps1"
)) {
    Assert-Contains -Content $windowsWrapper -Needle $standaloneDelegate -Label "scripts/windows.ps1 standalone delegates"
}

if ($agentsDoc -ne $claudeDoc) {
    throw "AGENTS.md and CLAUDE.md must remain identical after newline normalization."
}
Assert-Contains -Content $agentsDoc -Needle "package-suite" -Label "AGENTS.md"
Assert-Contains -Content $claudeDoc -Needle "package-suite" -Label "CLAUDE.md"

if (-not (Test-Path -LiteralPath $suitePackageScriptPath)) {
    throw "Expected suite package script not found: $suitePackageScriptPath"
}

$manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
$manifestFilenames = @()
foreach ($pack in $manifest.packs.PSObject.Properties) {
    foreach ($file in $pack.Value.files) {
        $manifestFilenames += $file.filename
    }
}
foreach ($filename in $manifestFilenames) {
    if ($filename -match '^corridorkey_fp32_' -or $filename -match '^corridorkey_fp\d+_768(_ctx)?\.onnx$') {
        throw "Distribution manifest must not expose user-facing reference artifact '$filename'."
    }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("corridorkey_suite_scaffold_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $onlineManifestPath = Join-Path $tempRoot "suite_online.json"
    $offlineManifestPath = Join-Path $tempRoot "suite_offline.json"

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $suitePackageScriptPath `
        -Flavor online `
        -Version "0.9.0" `
        -DisplayVersionLabel "0.9.0-win.0" `
        -RenderOnly `
        -OutputManifestPath $onlineManifestPath
    if ($LASTEXITCODE -ne 0) {
        throw "Rendering online suite manifest failed."
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $suitePackageScriptPath `
        -Flavor offline `
        -Version "0.9.0" `
        -DisplayVersionLabel "0.9.0-win.0" `
        -RenderOnly `
        -OutputManifestPath $offlineManifestPath
    if ($LASTEXITCODE -ne 0) {
        throw "Rendering offline suite manifest failed."
    }

    $wrapperManifestPath = Join-Path $tempRoot "suite_wrapper.json"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $windowsWrapperPath `
        -Task package-suite `
        -Version "0.9.0" `
        -DisplayVersionLabel "0.9.0-win.0" `
        -RenderOnly `
        -OutputManifestPath $wrapperManifestPath
    if ($LASTEXITCODE -ne 0) {
        throw "Rendering suite manifest through scripts/windows.ps1 failed."
    }
    if (-not (Test-Path -LiteralPath $wrapperManifestPath)) {
        throw "scripts/windows.ps1 package-suite must delegate render-only output to the suite package script."
    }

    $onlineSuite = Get-Content -Path $onlineManifestPath -Raw | ConvertFrom-Json
    $offlineSuite = Get-Content -Path $offlineManifestPath -Raw | ConvertFrom-Json

    foreach ($suite in @($onlineSuite, $offlineSuite)) {
        if ($suite.installer_surface -ne "suite") {
            throw "Suite manifest must identify installer_surface as suite."
        }
        if ($suite.shared_runtime_root -ne "{autopf}\CorridorKey\Runtime") {
            throw "Suite manifest must use the accepted shared runtime root."
        }
        if ($suite.gui_root -ne "{autopf}\CorridorKey\GUI") {
            throw "Suite manifest must use the accepted GUI root."
        }

        $componentIds = @($suite.components | ForEach-Object { $_.id })
        foreach ($expectedComponent in @(
            "runtime-core",
            "gui",
            "ofx-resolve-fusion",
            "ofx-nuke",
            "adobe",
            "green",
            "blue"
        )) {
            Assert-ArrayContains -Values $componentIds -Expected $expectedComponent -Label "suite components"
        }

        $setupTypeIds = @($suite.setup_types | ForEach-Object { $_.id })
        foreach ($expectedType in @("runtimeonly", "greenonly", "blueonly", "recommended", "custom")) {
            Assert-ArrayContains -Values $setupTypeIds -Expected $expectedType -Label "suite setup types"
        }

        $runtimeOnly = @($suite.setup_types | Where-Object { $_.id -eq "runtimeonly" } | Select-Object -First 1)
        $runtimeOnlyComponents = @($runtimeOnly[0].components)
        if ($runtimeOnlyComponents.Count -ne 1 -or $runtimeOnlyComponents[0] -ne "runtime-core") {
            throw "Runtime-only setup type must include only the fixed CLI/runtime core."
        }

        $recommended = @($suite.setup_types | Where-Object { $_.id -eq "recommended" } | Select-Object -First 1)
        $recommendedComponents = @($recommended[0].components)
        foreach ($expectedRecommendedComponent in @(
            "runtime-core",
            "gui",
            "ofx-resolve-fusion",
            "ofx-nuke",
            "adobe",
            "green",
            "blue"
        )) {
            Assert-ArrayContains -Values $recommendedComponents -Expected $expectedRecommendedComponent -Label "recommended setup type components"
        }

        $custom = @($suite.setup_types | Where-Object { $_.id -eq "custom" } | Select-Object -First 1)
        if (@($custom[0].components).Count -ne 0) {
            throw "Custom setup type must not preselect optional components."
        }

        $runtimeCore = @($suite.components | Where-Object { $_.id -eq "runtime-core" } | Select-Object -First 1)
        if (-not [bool]$runtimeCore[0].fixed) {
            throw "Runtime core component must be fixed."
        }
        foreach ($expectedRuntimeType in @("runtimeonly", "greenonly", "blueonly", "recommended", "custom")) {
            Assert-ArrayContains -Values @($runtimeCore[0].types) -Expected $expectedRuntimeType -Label "runtime core setup type membership"
        }
        foreach ($optionalComponentId in @("gui", "ofx-resolve-fusion", "ofx-nuke", "adobe", "green", "blue")) {
            $optionalComponent = @($suite.components | Where-Object { $_.id -eq $optionalComponentId } | Select-Object -First 1)
            if ([bool]$optionalComponent[0].fixed) {
                throw "Optional suite component must not be fixed: $optionalComponentId"
            }
            Assert-ArrayContains -Values @($optionalComponent[0].types) -Expected "custom" -Label "$optionalComponentId setup type membership"
        }

        $modelChoiceIds = @($suite.model_choices | ForEach-Object { $_.id })
        foreach ($expectedChoice in @("green", "blue", "green_plus_blue")) {
            Assert-ArrayContains -Values $modelChoiceIds -Expected $expectedChoice -Label "suite model choices"
        }

        $manifestComponents = @($manifest.packs.PSObject.Properties | ForEach-Object { [string]$_.Value.component } | Sort-Object -Unique)
        foreach ($choice in $suite.model_choices) {
            foreach ($component in @($choice.components)) {
                Assert-ArrayContains -Values $manifestComponents -Expected $component -Label "model choices derived from distribution manifest"
            }
        }
        $derivedChoiceIds = @($suite.model_choices | ForEach-Object { $_.id })
        foreach ($modeName in @("online", "offline")) {
            $modeChoiceIds = @($suite.install_modes.$modeName.model_choices)
            foreach ($choiceId in $modeChoiceIds) {
                Assert-ArrayContains -Values $derivedChoiceIds -Expected $choiceId -Label "$modeName install-mode choices derived from suite model choices"
            }
            foreach ($choiceId in $derivedChoiceIds) {
                Assert-ArrayContains -Values $modeChoiceIds -Expected $choiceId -Label "$modeName install-mode choices include every suite model choice"
            }
        }

        $hostIds = @($suite.hosts | ForEach-Object { $_.id })
        foreach ($expectedHost in @("resolve-fusion", "nuke", "adobe", "cli-runtime", "gui")) {
            Assert-ArrayContains -Values $hostIds -Expected $expectedHost -Label "suite host metadata"
        }

        $serialized = ($suite | ConvertTo-Json -Depth 16).Replace("\\", "\")
        foreach ($requiredToken in @(
            "%ProgramFiles%\Blackmagic Design\DaVinci Resolve\Resolve.exe",
            "%ProgramFiles%\Nuke*",
            "Nuke*.exe",
            "HKLM:\SOFTWARE\Adobe\After Effects",
            "HKLM:\SOFTWARE\WOW6432Node\Adobe\After Effects",
            "%ProgramFiles%\Adobe\Common\Plug-ins\7.0\MediaCore",
            "%CommonProgramFiles%\OFX\Plugins\CorridorKey.ofx.bundle",
            "%AppData%\Blackmagic Design\DaVinci Resolve\Support\OFXPluginCacheV2.xml",
            "%LocalAppData%\Temp\nuke\ofxplugincache\ofxplugincache_Nuke*-64.xml"
        )) {
            Assert-Contains -Content $serialized -Needle $requiredToken -Label "suite host metadata"
        }
        Assert-NotContains -Content $serialized -Needle "corridorkey_fp16_768.onnx" -Label "suite manifest"
        Assert-NotContains -Content $serialized -Needle "corridorkey_fp16_768_ctx.onnx" -Label "suite manifest"
        Assert-NotContains -Content $serialized -Needle "corridorkey_fp32_" -Label "suite manifest"
    }

    $onlineChoices = ($onlineSuite.model_choices | ForEach-Object { $_.id }) -join ","
    $offlineChoices = ($offlineSuite.model_choices | ForEach-Object { $_.id }) -join ","
    if ($onlineChoices -ne $offlineChoices) {
        throw "Online and offline suite manifests must expose the same model choices."
    }
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "[PASS] Windows suite installer scaffold checks passed." -ForegroundColor Green
