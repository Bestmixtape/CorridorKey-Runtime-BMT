param(
    [ValidateSet("online", "offline")]
    [string]$Flavor = "online",
    [string]$Version = "",
    [string]$DisplayVersionLabel = "",
    [ValidateSet("rtx")]
    [string]$Track = "rtx",
    [switch]$RenderOnly,
    [string]$OutputManifestPath = "",
    [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $PSScriptRoot "installer\distribution_manifest.json"

function Get-CorridorKeySuiteDistributionManifest {
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "Distribution manifest not found: $manifestPath"
    }

    return Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
}

function New-CorridorKeySuiteComponent {
    param(
        [string]$Id,
        [string]$Label,
        [string[]]$Types,
        [string]$Destination,
        [string[]]$Requires = @(),
        [bool]$Fixed = $false
    )

    return [ordered]@{
        id = $Id
        label = $Label
        types = @($Types)
        destination = $Destination
        requires = @($Requires)
        fixed = $Fixed
    }
}

function New-CorridorKeySuiteHost {
    param(
        [string]$Id,
        [string]$Label,
        [string]$Component,
        [string]$Detection,
        [string]$Destination,
        [string[]]$CacheDeletes = @()
    )

    return [ordered]@{
        id = $Id
        label = $Label
        component = $Component
        detection = $Detection
        destination = $Destination
        cache_deletes = @($CacheDeletes)
    }
}

function Get-CorridorKeySuiteModelPacks {
    param([object]$Manifest)

    $packs = @()
    foreach ($pack in $Manifest.packs.PSObject.Properties) {
        $files = @()
        foreach ($file in $pack.Value.files) {
            $filename = [string]$file.filename
            if ($filename -match '^corridorkey_fp\d+_768(_ctx)?\.onnx$' -or $filename -match '^corridorkey_fp32_') {
                throw "Distribution manifest exposes non-product model artifact: $filename"
            }
            $files += [ordered]@{
                filename = $filename
                component = [string]$pack.Value.component
                dest_subdir = [string]$pack.Value.dest_subdir
                sha256 = [string]$file.sha256
                size_bytes = $file.size_bytes
            }
        }

        $packs += [ordered]@{
            id = [string]$pack.Name
            label = [string]$pack.Value.label
            component = [string]$pack.Value.component
            dest_subdir = [string]$pack.Value.dest_subdir
            is_archive = [bool]($pack.Value.PSObject.Properties.Match("is_archive").Count -gt 0 -and $pack.Value.is_archive)
            extract = [bool]($pack.Value.PSObject.Properties.Match("extract").Count -gt 0 -and $pack.Value.extract)
            files = @($files)
        }
    }

    return @($packs)
}

function Get-CorridorKeySuiteModelChoices {
    param([object[]]$ModelPacks)

    $components = @($ModelPacks | ForEach-Object { [string]$_.component } | Sort-Object -Unique)
    $choices = @()

    if ($components -contains "green") {
        $choices += [ordered]@{
            id = "green"
            label = "Green"
            components = @("green")
        }
    }
    if ($components -contains "blue") {
        $choices += [ordered]@{
            id = "blue"
            label = "Blue"
            components = @("blue")
        }
    }
    if ($components -contains "green" -and $components -contains "blue") {
        $choices += [ordered]@{
            id = "green_plus_blue"
            label = "Green plus Blue"
            components = @("green", "blue")
        }
    }

    foreach ($expectedChoice in @("green", "blue", "green_plus_blue")) {
        if (@($choices | Where-Object { $_.id -eq $expectedChoice }).Count -eq 0) {
            throw "Distribution manifest does not support required suite model choice: $expectedChoice"
        }
    }

    return @($choices)
}

function New-CorridorKeySuiteManifest {
    param(
        [ValidateSet("online", "offline")]
        [string]$Flavor,
        [string]$Version,
        [string]$DisplayVersionLabel,
        [string]$Track
    )

    $distribution = Get-CorridorKeySuiteDistributionManifest
    $modelPacks = Get-CorridorKeySuiteModelPacks -Manifest $distribution
    $modelChoices = Get-CorridorKeySuiteModelChoices -ModelPacks $modelPacks
    $modelChoiceIds = @($modelChoices | ForEach-Object { [string]$_.id })
    $sharedRuntimeRoot = "{autopf}\CorridorKey\Runtime"
    $guiRoot = "{autopf}\CorridorKey\GUI"
    $recommendedComponents = @(
        "runtime-core",
        "gui",
        "ofx-resolve-fusion",
        "ofx-nuke",
        "adobe",
        "green",
        "blue"
    )

    return [ordered]@{
        schema_version = 1
        installer_surface = "suite"
        flavor = $Flavor
        version = $Version
        display_version_label = $DisplayVersionLabel
        track = $Track
        shared_runtime_root = $sharedRuntimeRoot
        gui_root = $guiRoot
        setup_types = @(
            [ordered]@{ id = "greenonly"; label = "Green only"; components = @("runtime-core", "green") },
            [ordered]@{ id = "blueonly"; label = "Blue only"; components = @("runtime-core", "blue") },
            [ordered]@{ id = "recommended"; label = "Recommended Green plus Blue"; components = @($recommendedComponents) },
            [ordered]@{ id = "custom"; label = "Custom"; components = @() }
        )
        components = @(
            (New-CorridorKeySuiteComponent -Id "runtime-core" -Label "CLI/runtime core" -Types @("greenonly", "blueonly", "recommended", "custom") -Destination "$sharedRuntimeRoot\Contents\Win64" -Fixed $true),
            (New-CorridorKeySuiteComponent -Id "gui" -Label "Tauri GUI" -Types @("recommended", "custom") -Destination $guiRoot -Requires @("runtime-core")),
            (New-CorridorKeySuiteComponent -Id "ofx-resolve-fusion" -Label "OFX Resolve/Fusion" -Types @("recommended", "custom") -Destination "%CommonProgramFiles%\OFX\Plugins\CorridorKey.ofx.bundle" -Requires @("runtime-core")),
            (New-CorridorKeySuiteComponent -Id "ofx-nuke" -Label "OFX Nuke" -Types @("recommended", "custom") -Destination "%CommonProgramFiles%\OFX\Plugins\CorridorKey.ofx.bundle" -Requires @("runtime-core")),
            (New-CorridorKeySuiteComponent -Id "adobe" -Label "Adobe plugins" -Types @("recommended", "custom") -Destination "%ProgramFiles%\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey" -Requires @("runtime-core")),
            (New-CorridorKeySuiteComponent -Id "green" -Label "Green model pack" -Types @("greenonly", "recommended", "custom") -Destination "$sharedRuntimeRoot\Contents\Resources\models" -Requires @("runtime-core")),
            (New-CorridorKeySuiteComponent -Id "blue" -Label "Blue model/runtime pack" -Types @("blueonly", "recommended", "custom") -Destination "$sharedRuntimeRoot\Contents\Resources" -Requires @("runtime-core"))
        )
        model_choices = @($modelChoices)
        model_packs = @($modelPacks)
        hosts = @(
            (New-CorridorKeySuiteHost -Id "resolve-fusion" -Label "Resolve/Fusion" -Component "ofx-resolve-fusion" -Detection "%ProgramFiles%\Blackmagic Design\DaVinci Resolve\Resolve.exe" -Destination "%CommonProgramFiles%\OFX\Plugins\CorridorKey.ofx.bundle" -CacheDeletes @("%AppData%\Blackmagic Design\DaVinci Resolve\Support\OFXPluginCacheV2.xml")),
            (New-CorridorKeySuiteHost -Id "nuke" -Label "Nuke" -Component "ofx-nuke" -Detection "%ProgramFiles%\Nuke*; Nuke*.exe" -Destination "%CommonProgramFiles%\OFX\Plugins\CorridorKey.ofx.bundle" -CacheDeletes @("%LocalAppData%\Temp\nuke\ofxplugincache\ofxplugincache_Nuke*-64.xml")),
            (New-CorridorKeySuiteHost -Id "adobe" -Label "Adobe" -Component "adobe" -Detection "HKLM:\SOFTWARE\Adobe\After Effects; HKLM:\SOFTWARE\WOW6432Node\Adobe\After Effects; CommonPluginInstallPath" -Destination "%ProgramFiles%\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey"),
            (New-CorridorKeySuiteHost -Id "cli-runtime" -Label "CLI/runtime core" -Component "runtime-core" -Detection "$sharedRuntimeRoot\Contents\Win64\corridorkey.exe" -Destination "$sharedRuntimeRoot\Contents\Win64"),
            (New-CorridorKeySuiteHost -Id "gui" -Label "Tauri GUI" -Component "gui" -Detection "$guiRoot\CorridorKey.exe" -Destination $guiRoot)
        )
        install_modes = [ordered]@{
            online = [ordered]@{
                embeds_model_packs = $false
                model_choices = @($modelChoiceIds)
                verifies_sha256 = $true
            }
            offline = [ordered]@{
                embeds_model_packs = $true
                model_choices = @($modelChoiceIds)
                verifies_sha256 = $true
            }
        }
    }
}

function Write-CorridorKeySuiteManifest {
    param(
        [object]$SuiteManifest,
        [string]$Path
    )

    $json = $SuiteManifest | ConvertTo-Json -Depth 18
    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Set-Content -Path $Path -Value $json -Encoding UTF8
}

$suiteManifest = New-CorridorKeySuiteManifest `
    -Flavor $Flavor `
    -Version $Version `
    -DisplayVersionLabel $DisplayVersionLabel `
    -Track $Track

if ([string]::IsNullOrWhiteSpace($OutputManifestPath)) {
    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
        $OutputDir = Join-Path $repoRoot "dist"
    }
    $artifactTag = if ([string]::IsNullOrWhiteSpace($DisplayVersionLabel)) { $Version } else { $DisplayVersionLabel }
    if ([string]::IsNullOrWhiteSpace($artifactTag)) {
        $artifactTag = "local"
    }
    $OutputManifestPath = Join-Path $OutputDir "CorridorKey_Suite_v${artifactTag}_Windows_${Flavor}_manifest.json"
}

Write-CorridorKeySuiteManifest -SuiteManifest $suiteManifest -Path $OutputManifestPath

if ($RenderOnly) {
    Write-Host "[suite] Rendered suite installer manifest: $OutputManifestPath" -ForegroundColor Green
    exit 0
}

Write-Host "[suite] Suite installer scaffold manifest ready: $OutputManifestPath" -ForegroundColor Green
throw "Suite installer compilation is not implemented yet. Use -RenderOnly for the scaffold manifest until the Inno suite builder is added."
