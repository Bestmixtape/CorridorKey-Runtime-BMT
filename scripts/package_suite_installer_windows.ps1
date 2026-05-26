param(
    [ValidateSet("online", "offline")]
    [string]$Flavor = "online",
    [string]$Version = "",
    [string]$DisplayVersionLabel = "",
    [ValidateSet("rtx")]
    [string]$Track = "rtx",
    [switch]$RenderOnly,
    [string]$OutputManifestPath = "",
    [string]$OutputIssPath = "",
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
                url = [string]$file.url
                sha256 = [string]$file.sha256
                size_bytes = $file.size_bytes
            }
        }

        $packs += [ordered]@{
            id = [string]$pack.Name
            label = [string]$pack.Value.label
            component = [string]$pack.Value.component
            dest_subdir = [string]$pack.Value.dest_subdir
            installed_size_bytes = if ($pack.Value.PSObject.Properties.Match("installed_size_bytes").Count -gt 0) { $pack.Value.installed_size_bytes } else { $null }
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

function ConvertTo-CorridorKeyInnoComponentName {
    param([string]$Id)

    switch ($Id) {
        "runtime-core" { return "runtimecore" }
        "ofx-resolve-fusion" { return "ofxresolvefusion" }
        "ofx-nuke" { return "ofxnuke" }
        default { return ($Id -replace '[^A-Za-z0-9_]', '') }
    }
}

function ConvertTo-CorridorKeyInnoComponentList {
    param([object[]]$ComponentIds)

    return (@($ComponentIds | ForEach-Object {
        ConvertTo-CorridorKeyInnoComponentName -Id ([string]$_)
    }) -join " ")
}

function ConvertTo-CorridorKeyInnoPath {
    param([string]$Path)

    return $Path.Replace("%CommonProgramFiles%", "{commoncf64}").Replace("%ProgramFiles%", "{autopf}")
}

function Add-CorridorKeySuiteLine {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Value = ""
    )

    $Lines.Add($Value) | Out-Null
}

function New-CorridorKeySuiteIss {
    param(
        [object]$SuiteManifest,
        [ValidateSet("online", "offline")]
        [string]$Flavor
    )

    $lines = [System.Collections.Generic.List[string]]::new()
    Add-CorridorKeySuiteLine -Lines $lines -Value "; Generated by scripts/package_suite_installer_windows.ps1."
    Add-CorridorKeySuiteLine -Lines $lines -Value '#define InstallerSurface "suite"'
    Add-CorridorKeySuiteLine -Lines $lines -Value '#define SuitePayloadRoot "@@SUITE_PAYLOAD_ROOT@@"'
    Add-CorridorKeySuiteLine -Lines $lines -Value '#define OfflinePayloadRoot "@@OFFLINE_PAYLOAD_ROOT@@"'
    Add-CorridorKeySuiteLine -Lines $lines -Value ('#define SharedRuntimeRoot "' + $SuiteManifest.shared_runtime_root + '"')
    Add-CorridorKeySuiteLine -Lines $lines -Value ('#define SuiteGuiRoot "' + $SuiteManifest.gui_root + '"')
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Setup]"
    Add-CorridorKeySuiteLine -Lines $lines -Value "AppId={{7C93E726-017B-45ED-931B-78436F7612A8}"
    Add-CorridorKeySuiteLine -Lines $lines -Value "AppName=CorridorKey Suite"
    Add-CorridorKeySuiteLine -Lines $lines -Value ("AppVersion=" + $SuiteManifest.version)
    Add-CorridorKeySuiteLine -Lines $lines -Value ("VersionInfoTextVersion=" + $SuiteManifest.display_version_label)
    Add-CorridorKeySuiteLine -Lines $lines -Value "DefaultDirName={autopf}\CorridorKey"
    Add-CorridorKeySuiteLine -Lines $lines -Value "ArchitecturesAllowed=x64compatible"
    Add-CorridorKeySuiteLine -Lines $lines -Value "ArchitecturesInstallIn64BitMode=x64compatible"
    Add-CorridorKeySuiteLine -Lines $lines -Value "ArchiveExtraction=full"
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Types]"
    foreach ($setupType in $SuiteManifest.setup_types) {
        $line = 'Name: "' + $setupType.id + '"; Description: "' + $setupType.label + '"'
        if ($setupType.id -eq "custom") {
            $line += "; Flags: iscustom"
        }
        Add-CorridorKeySuiteLine -Lines $lines -Value $line
    }
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Components]"
    foreach ($component in $SuiteManifest.components) {
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$component.id)
        $types = @($component.types) -join " "
        $line = 'Name: "' + $componentName + '"; Description: "' + $component.label + '"; Types: ' + $types
        if ($component.fixed) {
            $line += "; Flags: fixed"
        }
        Add-CorridorKeySuiteLine -Lines $lines -Value $line
    }
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Dirs]"
    foreach ($dir in @(
        "{#SharedRuntimeRoot}\Contents\Win64",
        "{#SharedRuntimeRoot}\Contents\Resources\models",
        "{#SharedRuntimeRoot}\Contents\Resources\torchtrt-runtime\bin",
        "{#SuiteGuiRoot}",
        "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle",
        "{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey"
    )) {
        Add-CorridorKeySuiteLine -Lines $lines -Value ('Name: "' + $dir + '"')
    }
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Files]"
    $payloadEntries = @(
        @{ Source = "{#SuitePayloadRoot}\runtime\*"; Dest = "{#SharedRuntimeRoot}\Contents\Win64"; Component = "runtime-core" },
        @{ Source = "{#SuitePayloadRoot}\gui\*"; Dest = "{#SuiteGuiRoot}"; Component = "gui" },
        @{ Source = "{#SuitePayloadRoot}\ofx-resolve-fusion\*"; Dest = "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle"; Component = "ofx-resolve-fusion" },
        @{ Source = "{#SuitePayloadRoot}\ofx-nuke\*"; Dest = "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle"; Component = "ofx-nuke" },
        @{ Source = "{#SuitePayloadRoot}\adobe\*"; Dest = "{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey"; Component = "adobe" }
    )
    foreach ($entry in $payloadEntries) {
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$entry.Component)
        Add-CorridorKeySuiteLine -Lines $lines -Value ('Source: "' + $entry.Source + '"; DestDir: "' + $entry.Dest + '"; Components: ' + $componentName + '; Flags: recursesubdirs createallsubdirs ignoreversion')
    }

    foreach ($pack in $SuiteManifest.model_packs) {
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$pack.component)
        $destSubdir = ([string]$pack.dest_subdir).Replace("/", "\")
        $destDir = "{#SharedRuntimeRoot}\Contents\Resources\$destSubdir"
        $offlinePackRoot = "{#OfflinePayloadRoot}\$destSubdir"

        if ($Flavor -eq "offline" -and $pack.is_archive -and $pack.extract) {
            foreach ($file in $pack.files) {
                Add-CorridorKeySuiteLine -Lines $lines -Value ("; Offline archive source: " + $file.filename)
            }
            Add-CorridorKeySuiteLine -Lines $lines -Value ('Source: "' + $offlinePackRoot + '\*"; DestDir: "' + $destDir + '"; Components: ' + $componentName + '; Flags: recursesubdirs createallsubdirs ignoreversion')
            continue
        }

        foreach ($file in $pack.files) {
            if ($Flavor -eq "online") {
                $flags = "external ignoreversion"
                $externalSize = $file.size_bytes
                if ($pack.is_archive -and $pack.extract) {
                    $flags += " extractarchive recursesubdirs"
                    if ($null -ne $pack.installed_size_bytes) {
                        $externalSize = $pack.installed_size_bytes
                    }
                }
                Add-CorridorKeySuiteLine -Lines $lines -Value ('; Download: ' + $file.url + '; Sha256: ' + $file.sha256 + '; DownloadSize: ' + $file.size_bytes)
                Add-CorridorKeySuiteLine -Lines $lines -Value ('Source: "{tmp}\' + $file.filename + '"; DestDir: "' + $destDir + '"; DestName: "' + $file.filename + '"; Components: ' + $componentName + '; Flags: ' + $flags + '; ExternalSize: ' + $externalSize)
            } else {
                Add-CorridorKeySuiteLine -Lines $lines -Value ('Source: "' + $offlinePackRoot + '\' + $file.filename + '"; DestDir: "' + $destDir + '"; Components: ' + $componentName + '; Flags: ignoreversion')
            }
        }
    }

    if ($Flavor -eq "online") {
        Add-CorridorKeySuiteLine -Lines $lines
        Add-CorridorKeySuiteLine -Lines $lines -Value "[Code]"
        Add-CorridorKeySuiteLine -Lines $lines -Value "var"
        Add-CorridorKeySuiteLine -Lines $lines -Value "  DownloadPage: TDownloadWizardPage;"
        Add-CorridorKeySuiteLine -Lines $lines
        Add-CorridorKeySuiteLine -Lines $lines -Value "procedure InitializeWizard;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "begin"
        Add-CorridorKeySuiteLine -Lines $lines -Value "  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), 'Downloading selected CorridorKey model packs. SHA-256 is verified for every file.', nil);"
        Add-CorridorKeySuiteLine -Lines $lines -Value "  DownloadPage.ShowBaseNameInsteadOfUrl := True;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "end;"
        Add-CorridorKeySuiteLine -Lines $lines
        Add-CorridorKeySuiteLine -Lines $lines -Value "procedure CorridorKeyEnqueueSuiteDownloads(const DownloadPage: TDownloadWizardPage);"
        Add-CorridorKeySuiteLine -Lines $lines -Value "begin"
        foreach ($component in @("green", "blue")) {
            $componentPacks = @($SuiteManifest.model_packs | Where-Object { $_.component -eq $component })
            if ($componentPacks.Count -eq 0) {
                continue
            }
            $componentName = ConvertTo-CorridorKeyInnoComponentName -Id $component
            Add-CorridorKeySuiteLine -Lines $lines -Value ("  if WizardIsComponentSelected('" + $componentName + "') then begin")
            foreach ($pack in $componentPacks) {
                foreach ($file in $pack.files) {
                    Add-CorridorKeySuiteLine -Lines $lines -Value ("    DownloadPage.Add('" + $file.url + "', '" + $file.filename + "', '" + $file.sha256 + "');")
                }
            }
            Add-CorridorKeySuiteLine -Lines $lines -Value "  end;"
        }
        Add-CorridorKeySuiteLine -Lines $lines -Value "end;"
        Add-CorridorKeySuiteLine -Lines $lines
        Add-CorridorKeySuiteLine -Lines $lines -Value "function NextButtonClick(CurPageID: Integer): Boolean;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "begin"
        Add-CorridorKeySuiteLine -Lines $lines -Value "  Result := True;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "  if CurPageID = wpReady then begin"
        Add-CorridorKeySuiteLine -Lines $lines -Value "    DownloadPage.Clear;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "    CorridorKeyEnqueueSuiteDownloads(DownloadPage);"
        Add-CorridorKeySuiteLine -Lines $lines -Value "    DownloadPage.Show;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "    try"
        Add-CorridorKeySuiteLine -Lines $lines -Value "      try"
        Add-CorridorKeySuiteLine -Lines $lines -Value "        DownloadPage.Download;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "      except"
        Add-CorridorKeySuiteLine -Lines $lines -Value "        Result := False;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "      end;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "    finally"
        Add-CorridorKeySuiteLine -Lines $lines -Value "      DownloadPage.Hide;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "    end;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "  end;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "end;"
    }

    return ($lines -join [Environment]::NewLine) + [Environment]::NewLine
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
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

function Write-CorridorKeySuiteIss {
    param(
        [object]$SuiteManifest,
        [ValidateSet("online", "offline")]
        [string]$Flavor,
        [string]$Path
    )

    $iss = New-CorridorKeySuiteIss -SuiteManifest $SuiteManifest -Flavor $Flavor
    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Set-Content -LiteralPath $Path -Value $iss -Encoding UTF8
}

$suiteManifest = New-CorridorKeySuiteManifest `
    -Flavor $Flavor `
    -Version $Version `
    -DisplayVersionLabel $DisplayVersionLabel `
    -Track $Track

if ([string]::IsNullOrWhiteSpace($OutputManifestPath) -and [string]::IsNullOrWhiteSpace($OutputIssPath)) {
    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
        $OutputDir = Join-Path $repoRoot "dist"
    }
    $artifactTag = if ([string]::IsNullOrWhiteSpace($DisplayVersionLabel)) { $Version } else { $DisplayVersionLabel }
    if ([string]::IsNullOrWhiteSpace($artifactTag)) {
        $artifactTag = "local"
    }
    $OutputManifestPath = Join-Path $OutputDir "CorridorKey_Suite_v${artifactTag}_Windows_${Flavor}_manifest.json"
}

if (-not [string]::IsNullOrWhiteSpace($OutputManifestPath)) {
    Write-CorridorKeySuiteManifest -SuiteManifest $suiteManifest -Path $OutputManifestPath
}
if (-not [string]::IsNullOrWhiteSpace($OutputIssPath)) {
    Write-CorridorKeySuiteIss -SuiteManifest $suiteManifest -Flavor $Flavor -Path $OutputIssPath
}

if ($RenderOnly) {
    if (-not [string]::IsNullOrWhiteSpace($OutputManifestPath)) {
        Write-Host "[suite] Rendered suite installer manifest: $OutputManifestPath" -ForegroundColor Green
    }
    if (-not [string]::IsNullOrWhiteSpace($OutputIssPath)) {
        Write-Host "[suite] Rendered suite Inno script: $OutputIssPath" -ForegroundColor Green
    }
    exit 0
}

if (-not [string]::IsNullOrWhiteSpace($OutputManifestPath)) {
    Write-Host "[suite] Suite installer scaffold manifest ready: $OutputManifestPath" -ForegroundColor Green
}
if (-not [string]::IsNullOrWhiteSpace($OutputIssPath)) {
    Write-Host "[suite] Suite installer Inno script ready: $OutputIssPath" -ForegroundColor Green
}
throw "Suite installer compilation is not implemented yet. Use -RenderOnly for the scaffold manifest until the Inno suite builder is added."
