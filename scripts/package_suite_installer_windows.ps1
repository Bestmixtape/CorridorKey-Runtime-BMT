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
    [string]$OutputDir = "",
    [string]$OutputBaseFilename = "",
    [string]$SuitePayloadRoot = "",
    [string]$SuitePayloadOutputRoot = "",
    [string]$RuntimePackageRoot = "",
    [string]$OfxPackageRoot = "",
    [string]$AdobePackageRoot = "",
    [string]$ModelPayloadDir = "",
    [string]$ISCCPath = "",
    [string]$DistributionManifestPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $PSScriptRoot "installer\distribution_manifest.json"
if (-not [string]::IsNullOrWhiteSpace($DistributionManifestPath)) {
    $manifestPath = $DistributionManifestPath
}

function Get-CorridorKeySuiteDistributionManifest {
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "Distribution manifest not found: $manifestPath"
    }

    return Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
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

function Assert-CorridorKeyDownloadBaseName {
    param(
        [string]$Filename,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Filename)) {
        throw "$Label is missing filename."
    }
    if ($Filename -match '[\\/:*?"<>|\r\n]') {
        throw "$Label must be a filename only, not a path: $Filename"
    }

    return $Filename
}

function Assert-CorridorKeyDownloadUrl {
    param(
        [string]$Url,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Url)) {
        throw "$Label is missing URL."
    }
    if ($Url -match '[\r\n]') {
        throw "$Label URL must not contain line breaks."
    }

    return $Url
}

function Assert-CorridorKeyPayloadSizeBytes {
    param(
        [object]$SizeBytes,
        [string]$Label
    )

    if ($null -eq $SizeBytes) {
        throw "$Label is missing size_bytes."
    }

    [Int64]$parsedSize = 0
    if (-not [Int64]::TryParse(([string]$SizeBytes), [ref]$parsedSize) -or $parsedSize -le 0) {
        throw "$Label size_bytes must be a positive integer."
    }

    return $parsedSize
}

function Assert-CorridorKeyInventoryKey {
    param(
        [string]$Value,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^[A-Za-z0-9._-]+$') {
        throw "$Label must be a safe inventory key: $Value"
    }

    return $Value
}

function Assert-CorridorKeyOptionalInstalledSizeBytes {
    param(
        [object]$SizeBytes,
        [string]$Label
    )

    if ($null -eq $SizeBytes) {
        return $null
    }

    [Int64]$parsedSize = 0
    if (-not [Int64]::TryParse(([string]$SizeBytes), [ref]$parsedSize) -or $parsedSize -le 0) {
        throw "$Label installed_size_bytes must be a positive integer when present."
    }

    return $parsedSize
}

function ConvertTo-CorridorKeyPayloadSubdir {
    param(
        [string]$Subdir,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Subdir)) {
        return ""
    }

    $normalized = $Subdir.Replace("/", "\").Trim("\")
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return ""
    }
    if ($normalized -match '[\r\n]' -or
        $normalized -match '[:*?"<>|]' -or
        $normalized -match '(^|\\)\.\.($|\\)' -or
        $normalized -match '^[\\/]') {
        throw "$Label must be a safe relative subdirectory: $Subdir"
    }

    return $normalized
}

function ConvertTo-CorridorKeyInnoPascalString {
    param([string]$Value)

    return $Value -replace "'", "''"
}

function Get-CorridorKeySuiteModelPacks {
    param([object]$Manifest)

    $packs = @()
    foreach ($pack in $Manifest.packs.PSObject.Properties) {
        $packId = Assert-CorridorKeyInventoryKey `
            -Value ([string]$pack.Name) `
            -Label "Distribution manifest pack id"
        $files = @()
        foreach ($file in $pack.Value.files) {
            $filename = Assert-CorridorKeyDownloadBaseName `
                -Filename ([string]$file.filename) `
                -Label "Distribution manifest file"
            $url = Assert-CorridorKeyDownloadUrl `
                -Url ([string]$file.url) `
                -Label "Distribution manifest file '$filename'"
            if ($filename -match '^corridorkey_fp\d+_768(_ctx)?\.onnx$' -or $filename -match '^corridorkey_fp32_') {
                throw "Distribution manifest exposes non-product model artifact: $filename"
            }
            $sha256 = ""
            if ($file.PSObject.Properties.Match("sha256").Count -gt 0) {
                $sha256 = [string]$file.sha256
            }
            if ([string]::IsNullOrWhiteSpace($sha256)) {
                throw "Distribution manifest file is missing SHA-256: $filename"
            }
            if ($sha256 -notmatch '^[A-Fa-f0-9]{64}$') {
                throw "Distribution manifest file has invalid SHA-256 for ${filename}: $sha256"
            }
            $sizeBytes = $null
            if ($file.PSObject.Properties.Match("size_bytes").Count -gt 0) {
                $sizeBytes = $file.size_bytes
            }

            $files += [ordered]@{
                filename = $filename
                component = [string]$pack.Value.component
                dest_subdir = [string]$pack.Value.dest_subdir
                url = $url
                sha256 = $sha256
                size_bytes = Assert-CorridorKeyPayloadSizeBytes `
                    -SizeBytes $sizeBytes `
                    -Label "Distribution manifest file '$filename'"
            }
        }

        $packs += [ordered]@{
            id = $packId
            label = [string]$pack.Value.label
            component = [string]$pack.Value.component
            dest_subdir = ConvertTo-CorridorKeyPayloadSubdir `
                -Subdir ([string]$pack.Value.dest_subdir) `
                -Label "Distribution manifest pack '$packId' dest_subdir"
            installed_size_bytes = if ($pack.Value.PSObject.Properties.Match("installed_size_bytes").Count -gt 0) { $pack.Value.installed_size_bytes } else { $null }
            installed_file_count = if ($pack.Value.PSObject.Properties.Match("installed_file_count").Count -gt 0) { $pack.Value.installed_file_count } else { $null }
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

function Get-CorridorKeySuiteOptionalComponentPayloads {
    param(
        [object]$Manifest,
        [string[]]$AllowedComponents
    )

    if ($Manifest.PSObject.Properties.Match("component_payloads").Count -eq 0 -or $null -eq $Manifest.component_payloads) {
        return @()
    }

    $payloads = @()
    foreach ($payloadProperty in $Manifest.component_payloads.PSObject.Properties) {
        $payload = $payloadProperty.Value
        $component = [string]$payload.component
        if ($AllowedComponents -notcontains $component) {
            throw "Optional component payload '$($payloadProperty.Name)' targets unsupported component: $component"
        }

        $files = @()
        foreach ($file in $payload.files) {
            $filename = Assert-CorridorKeyDownloadBaseName `
                -Filename ([string]$file.filename) `
                -Label "Optional component payload '$($payloadProperty.Name)' file"
            $url = Assert-CorridorKeyDownloadUrl `
                -Url ([string]$file.url) `
                -Label "Optional component payload file '$filename'"
            $sha256 = ""
            if ($file.PSObject.Properties.Match("sha256").Count -gt 0) {
                $sha256 = [string]$file.sha256
            }
            if ([string]::IsNullOrWhiteSpace($sha256)) {
                throw "Optional component payload file is missing SHA-256: $filename"
            }
            if ($sha256 -notmatch '^[A-Fa-f0-9]{64}$') {
                throw "Optional component payload file has invalid SHA-256 for ${filename}: $sha256"
            }

            $sizeBytes = $null
            if ($file.PSObject.Properties.Match("size_bytes").Count -gt 0) {
                $sizeBytes = $file.size_bytes
            }

            $files += [ordered]@{
                filename = $filename
                url = $url
                sha256 = $sha256
                size_bytes = Assert-CorridorKeyPayloadSizeBytes `
                    -SizeBytes $sizeBytes `
                    -Label "Optional component payload file '$filename'"
                status = if ($file.PSObject.Properties.Match("status").Count -gt 0) { [string]$file.status } else { "" }
            }
        }
        if ($files.Count -eq 0) {
            throw "Optional component payload '$($payloadProperty.Name)' must contain at least one file."
        }

        $payloads += [ordered]@{
            id = [string]$payloadProperty.Name
            label = [string]$payload.label
            component = $component
            dest_subdir = if ($payload.PSObject.Properties.Match("dest_subdir").Count -gt 0) {
                ConvertTo-CorridorKeyPayloadSubdir -Subdir ([string]$payload.dest_subdir) -Label "Optional component payload '$($payloadProperty.Name)' dest_subdir"
            } else { "" }
            installed_size_bytes = if ($payload.PSObject.Properties.Match("installed_size_bytes").Count -gt 0) {
                Assert-CorridorKeyOptionalInstalledSizeBytes `
                    -SizeBytes $payload.installed_size_bytes `
                    -Label "Optional component payload '$($payloadProperty.Name)'"
            } else { $null }
            is_archive = [bool]($payload.PSObject.Properties.Match("is_archive").Count -gt 0 -and $payload.is_archive)
            extract = [bool]($payload.PSObject.Properties.Match("extract").Count -gt 0 -and $payload.extract)
            files = @($files)
        }
    }

    return @($payloads)
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
    $setupTypes = @(
        [ordered]@{ id = "recommended"; label = "Recommended Green plus Blue"; components = @($recommendedComponents) },
        [ordered]@{ id = "runtimeonly"; label = "Runtime and CLI only"; components = @("runtime-core") },
        [ordered]@{ id = "greenonly"; label = "Green only"; components = @("runtime-core", "green") },
        [ordered]@{ id = "blueonly"; label = "Blue only"; components = @("runtime-core", "blue") },
        [ordered]@{ id = "custom"; label = "Custom"; components = @() }
    )
    $components = @(
        (New-CorridorKeySuiteComponent -Id "runtime-core" -Label "CLI/runtime core" -Types @("runtimeonly", "greenonly", "blueonly", "recommended", "custom") -Destination "$sharedRuntimeRoot\Contents\Win64" -Fixed $true),
        (New-CorridorKeySuiteComponent -Id "gui" -Label "Tauri GUI" -Types @("recommended", "custom") -Destination $guiRoot -Requires @("runtime-core")),
        (New-CorridorKeySuiteComponent -Id "ofx-resolve-fusion" -Label "OFX Resolve/Fusion" -Types @("recommended", "custom") -Destination "%CommonProgramFiles%\OFX\Plugins\CorridorKey.ofx.bundle" -Requires @("runtime-core")),
        (New-CorridorKeySuiteComponent -Id "ofx-nuke" -Label "OFX Nuke" -Types @("recommended", "custom") -Destination "%CommonProgramFiles%\OFX\Plugins\CorridorKey.ofx.bundle" -Requires @("runtime-core")),
        (New-CorridorKeySuiteComponent -Id "adobe" -Label "Adobe plugins" -Types @("recommended", "custom") -Destination "%ProgramFiles%\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey" -Requires @("runtime-core")),
        (New-CorridorKeySuiteComponent -Id "green" -Label "Green model pack" -Types @("greenonly", "recommended", "custom") -Destination "$sharedRuntimeRoot\Contents\Resources\models" -Requires @("runtime-core")),
        (New-CorridorKeySuiteComponent -Id "blue" -Label "Blue model/runtime pack" -Types @("blueonly", "recommended", "custom") -Destination "$sharedRuntimeRoot\Contents\Resources" -Requires @("runtime-core"))
    )
    $optionalComponentPayloadIds = @("gui", "ofx-resolve-fusion", "ofx-nuke", "adobe")
    $componentPayloads = Get-CorridorKeySuiteOptionalComponentPayloads `
        -Manifest $distribution `
        -AllowedComponents $optionalComponentPayloadIds
    $externalizedComponentPayloadIds = @($componentPayloads | ForEach-Object { [string]$_.component } | Sort-Object -Unique)
    $embeddedOnlineComponentPayloadIds = @($optionalComponentPayloadIds | Where-Object {
            $externalizedComponentPayloadIds -notcontains $_
        })

    return [ordered]@{
        schema_version = 1
        installer_surface = "suite"
        flavor = $Flavor
        version = $Version
        display_version_label = $DisplayVersionLabel
        track = $Track
        shared_runtime_root = $sharedRuntimeRoot
        gui_root = $guiRoot
        setup_types = @($setupTypes)
        components = @($components)
        model_choices = @($modelChoices)
        model_packs = @($modelPacks)
        component_payloads = @($componentPayloads)
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
                externalized_component_payloads = @($externalizedComponentPayloadIds)
                embedded_component_payloads = @($embeddedOnlineComponentPayloadIds)
                verifies_sha256 = $true
            }
            offline = [ordered]@{
                embeds_model_packs = $true
                model_choices = @($modelChoiceIds)
                embeds_component_payloads = $true
                embedded_component_payloads = @($optionalComponentPayloadIds)
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

    return $Path.
        Replace("%CommonProgramFiles%", "{commoncf64}").
        Replace("%ProgramFiles%", "{autopf}").
        Replace("%AppData%", "{userappdata}").
        Replace("%LocalAppData%", "{localappdata}")
}

function Get-CorridorKeySuiteComponentDestDir {
    param(
        [object]$SuiteManifest,
        [string]$ComponentId,
        [string]$DestSubdir = ""
    )

    if ($ComponentId -eq "gui") {
        $destDir = "{#SuiteGuiRoot}"
    } else {
        $component = @($SuiteManifest.components | Where-Object { $_.id -eq $ComponentId } | Select-Object -First 1)
        if ($component.Count -eq 0) {
            throw "Suite component not found for payload destination: $ComponentId"
        }
        $destDir = ConvertTo-CorridorKeyInnoPath -Path ([string]$component[0].destination)
    }

    $normalizedSubdir = ConvertTo-CorridorKeyPayloadSubdir `
        -Subdir $DestSubdir `
        -Label "Optional component payload dest_subdir"
    if ([string]::IsNullOrWhiteSpace($normalizedSubdir)) {
        return $destDir
    }

    return "$destDir\$normalizedSubdir"
}

function ConvertTo-CorridorKeySuiteInventoryPath {
    param(
        [object]$SuiteManifest,
        [string]$Path
    )

    return (ConvertTo-CorridorKeyInnoPath -Path $Path).
        Replace([string]$SuiteManifest.shared_runtime_root, "{#SharedRuntimeRoot}").
        Replace([string]$SuiteManifest.gui_root, "{#SuiteGuiRoot}")
}

function ConvertTo-CorridorKeyInnoDoubleQuotedString {
    param([string]$Value)

    return $Value -replace '"', '""'
}

function New-CorridorKeySuiteIniLine {
    param(
        [string]$Filename,
        [string]$Section,
        [string]$Key,
        [string]$String,
        [string]$ComponentName = ""
    )

    $line = 'Filename: "' + $Filename +
        '"; Section: "' + (ConvertTo-CorridorKeyInnoDoubleQuotedString -Value $Section) +
        '"; Key: "' + (ConvertTo-CorridorKeyInnoDoubleQuotedString -Value $Key) +
        '"; String: "' + (ConvertTo-CorridorKeyInnoDoubleQuotedString -Value $String) + '"'
    if (-not [string]::IsNullOrWhiteSpace($ComponentName)) {
        $line += "; Components: $ComponentName"
    }
    $line += "; Flags: uninsdeleteentry uninsdeletesectionifempty"
    return $line
}

function Add-CorridorKeySuitePascalLine {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Value = ""
    )

    $Lines.Add($Value) | Out-Null
}

function Add-CorridorKeySuiteDeleteTreeCall {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Path,
        [string]$Indent = "  "
    )

    $escapedPath = ConvertTo-CorridorKeyInnoPascalString -Value $Path
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value ($Indent + "CorridorKeyDeleteTreeIfPresent(ExpandConstant('" + $escapedPath + "'));")
}

function Add-CorridorKeySuiteDeleteFileCall {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Path,
        [string]$Indent = "  "
    )

    $escapedPath = ConvertTo-CorridorKeyInnoPascalString -Value $Path
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value ($Indent + "CorridorKeyDeleteFileIfPresent(ExpandConstant('" + $escapedPath + "'));")
}

function Add-CorridorKeySuitePathRegistrationSections {
    param([System.Collections.Generic.List[string]]$Lines)

    $helperPath = '{#SharedRuntimeRoot}\Contents\Win64\update_path.ps1'
    $installParameters = '-NoProfile -ExecutionPolicy Bypass -File ""' + $helperPath + '"" -Mode Install'
    $uninstallParameters = '-NoProfile -ExecutionPolicy Bypass -File ""' + $helperPath + '"" -Mode Uninstall'

    Add-CorridorKeySuiteLine -Lines $Lines
    Add-CorridorKeySuiteLine -Lines $Lines -Value "[Run]"
    Add-CorridorKeySuiteLine -Lines $Lines -Value ('Filename: "powershell.exe"; Parameters: "' + $installParameters + '"; Components: runtimecore; Flags: runhidden waituntilterminated')
    Add-CorridorKeySuiteLine -Lines $Lines
    Add-CorridorKeySuiteLine -Lines $Lines -Value "[UninstallRun]"
    Add-CorridorKeySuiteLine -Lines $Lines -Value ('Filename: "powershell.exe"; Parameters: "' + $uninstallParameters + '"; Flags: runhidden waituntilterminated')
}

function Get-CorridorKeySuitePackMarkerValue {
    param([object]$Pack)

    $files = @($Pack.files | Sort-Object filename)
    if ($files.Count -eq 0) {
        return ""
    }

    $builder = [System.Text.StringBuilder]::new()
    foreach ($file in $files) {
        [void]$builder.AppendLine(([string]$file.sha256).ToLowerInvariant())
    }

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($builder.ToString())
        return -join ($sha256.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") })
    } finally {
        $sha256.Dispose()
    }
}

function Add-CorridorKeySuitePackMarkerCode {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [object]$SuiteManifest
    )

    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "function CorridorKeySuitePackMarkerPath(const DestSubdir, PackName: String): String;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if DestSubdir = '' then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    Result := ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources\.cache.' + PackName + '.sha256');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end else begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    Result := ExpandConstant('{#SharedRuntimeRoot}\Contents\Resources\' + DestSubdir + '\.cache.' + PackName + '.sha256');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyWriteSuitePackMarker(const DestSubdir, PackName, MarkerValue: String);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "var"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  MarkerPath: String;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  MarkerPath := CorridorKeySuitePackMarkerPath(DestSubdir, PackName);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if not ForceDirectories(ExtractFileDir(MarkerPath)) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    RaiseException('Unable to create CorridorKey pack marker directory: ' + ExtractFileDir(MarkerPath));"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  SaveStringToFile(MarkerPath, MarkerValue, False);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "function CorridorKeySuiteDirectoryFileCount(const Path: String): Integer;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "var"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  FindRec: TFindRec;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  ChildPath: String;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  Result := 0;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if FindFirst(Path + '\*', FindRec) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    try"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "      repeat"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "        if (FindRec.Name <> '.') and (FindRec.Name <> '..') and (Copy(FindRec.Name, 1, 7) <> '.cache.') then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "          ChildPath := Path + '\' + FindRec.Name;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "          if DirExists(ChildPath) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "            Result := Result + CorridorKeySuiteDirectoryFileCount(ChildPath);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "          end else begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "            Result := Result + 1;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "          end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "        end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "      until not FindNext(FindRec);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    finally"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "      FindClose(FindRec);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "function CorridorKeySuitePackPayloadPresent(const DestSubdir, PackName: String): Boolean;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  Result := False;"
    foreach ($pack in $SuiteManifest.model_packs) {
        $destSubdir = ([string]$pack.dest_subdir).Replace("/", "\")
        $escapedDestSubdir = ConvertTo-CorridorKeyInnoPascalString -Value $destSubdir
        $escapedPackId = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$pack.id)
        $destRoot = "{#SharedRuntimeRoot}\Contents\Resources\$destSubdir"
        $escapedDestRoot = ConvertTo-CorridorKeyInnoPascalString -Value $destRoot
        Add-CorridorKeySuitePascalLine -Lines $Lines -Value ("  if (DestSubdir = '" + $escapedDestSubdir + "') and (PackName = '" + $escapedPackId + "') then begin")
        if ($pack.is_archive -and $pack.extract) {
            $count = if ($null -ne $pack.installed_file_count) { [int]$pack.installed_file_count } else { 1 }
            Add-CorridorKeySuitePascalLine -Lines $Lines -Value ("    Result := DirExists(ExpandConstant('" + $escapedDestRoot + "')) and (CorridorKeySuiteDirectoryFileCount(ExpandConstant('" + $escapedDestRoot + "')) >= " + $count + ");")
        } else {
            $files = @($pack.files)
            if ($files.Count -eq 0) {
                Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    Result := False;"
            } else {
                Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    Result :="
                for ($index = 0; $index -lt $files.Count; $index++) {
                    $filename = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$files[$index].filename)
                    $suffix = if ($index -eq ($files.Count - 1)) { ";" } else { " and" }
                    Add-CorridorKeySuitePascalLine -Lines $Lines -Value ("      FileExists(ExpandConstant('" + $escapedDestRoot + "\" + $filename + "'))" + $suffix)
                }
            }
        }
        Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    }
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "function CorridorKeySuitePackMarkerValid(const DestSubdir, PackName, MarkerValue: String): Boolean;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "var"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  MarkerPath: String;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  ExistingValue: AnsiString;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  MarkerPath := CorridorKeySuitePackMarkerPath(DestSubdir, PackName);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  Result := LoadStringFromFile(MarkerPath, ExistingValue) and (ExistingValue = MarkerValue) and CorridorKeySuitePackPayloadPresent(DestSubdir, PackName);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyWriteSelectedSuitePackMarkers;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    foreach ($component in @("green", "blue")) {
        $packs = @($SuiteManifest.model_packs | Where-Object { $_.component -eq $component })
        if ($packs.Count -eq 0) {
            continue
        }
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id $component
        Add-CorridorKeySuitePascalLine -Lines $Lines -Value ("  if WizardIsComponentSelected('" + $componentName + "') then begin")
        foreach ($pack in $packs) {
            $destSubdir = ([string]$pack.dest_subdir).Replace("/", "\")
            $markerValue = Get-CorridorKeySuitePackMarkerValue -Pack $pack
            $escapedDestSubdir = ConvertTo-CorridorKeyInnoPascalString -Value $destSubdir
            $escapedPackId = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$pack.id)
            $escapedMarkerValue = ConvertTo-CorridorKeyInnoPascalString -Value $markerValue
            Add-CorridorKeySuitePascalLine -Lines $Lines -Value ("    CorridorKeyWriteSuitePackMarker('" + $escapedDestSubdir + "', '" + $escapedPackId + "', '" + $escapedMarkerValue + "');")
        }
        Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    }
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
}

function Add-CorridorKeySuiteModelCleanupCalls {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [object]$SuiteManifest,
        [string]$Component,
        [string]$Indent = "    "
    )

    foreach ($pack in @($SuiteManifest.model_packs | Where-Object { $_.component -eq $Component })) {
        $destSubdir = ([string]$pack.dest_subdir).Replace("/", "\")
        $destRoot = "{#SharedRuntimeRoot}\Contents\Resources\$destSubdir"
        Add-CorridorKeySuiteDeleteFileCall `
            -Lines $Lines `
            -Path ($destRoot + "\.cache." + [string]$pack.id + ".sha256") `
            -Indent $Indent
        if ($pack.is_archive -and $pack.extract) {
            Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path $destRoot -Indent $Indent
            continue
        }
        foreach ($file in $pack.files) {
            Add-CorridorKeySuiteDeleteFileCall `
                -Lines $Lines `
                -Path ($destRoot + "\" + [string]$file.filename) `
                -Indent $Indent
        }
    }
}

function Get-CorridorKeySuiteHostCleanupPath {
    param(
        [object]$SuiteManifest,
        [string]$HostId
    )

    $hostEntry = @($SuiteManifest.hosts | Where-Object { $_.id -eq $HostId } | Select-Object -First 1)
    if ($hostEntry.Count -eq 0) {
        throw "Suite host not found for cleanup path: $HostId"
    }

    return ConvertTo-CorridorKeySuiteInventoryPath -SuiteManifest $SuiteManifest -Path ([string]$hostEntry[0].destination)
}

function Add-CorridorKeySuiteLifecycleCode {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [object]$SuiteManifest
    )

    $ofxRoot = Get-CorridorKeySuiteHostCleanupPath -SuiteManifest $SuiteManifest -HostId "resolve-fusion"
    $adobeRoot = Get-CorridorKeySuiteHostCleanupPath -SuiteManifest $SuiteManifest -HostId "adobe"

    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "function CorridorKeyPreviousInventoryValue(const Section, Key: String): String;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  Result := GetIniString(Section, Key, '', ExpandConstant('{#SuiteInventoryPath}'));"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "function CorridorKeyWasPreviouslyInstalled(const Section, Key: String): Boolean;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  Result := CorridorKeyPreviousInventoryValue(Section, Key) <> '';"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyDeleteTreeIfPresent(const Path: String);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if DirExists(Path) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if not DelTree(Path, True, True, True) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "      RaiseException('Unable to remove CorridorKey path: ' + Path);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyDeleteFileIfPresent(const Path: String);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if FileExists(Path) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if not DeleteFile(Path) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "      RaiseException('Unable to remove CorridorKey file: ' + Path);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyDeleteMatchingFiles(const Pattern: String);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "var"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  FindRec: TFindRec;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  Directory: String;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  MatchedPath: String;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  Directory := ExtractFileDir(Pattern);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if FindFirst(Pattern, FindRec) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    try"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "      repeat"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "        MatchedPath := Directory + '\' + FindRec.Name;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "        if FileExists(MatchedPath) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "          if not DeleteFile(MatchedPath) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "            RaiseException('Unable to remove CorridorKey cache file: ' + MatchedPath);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "          end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "        end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "      until not FindNext(FindRec);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    finally"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "      FindClose(FindRec);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyStopProcessIfRunning(const ImageName: String);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "var"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  ResultCode: Integer;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM ""' + ImageName + '""', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyStopSuiteProcesses;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if WizardIsComponentSelected('ofxresolvefusion') then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    CorridorKeyStopProcessIfRunning('Resolve.exe');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if WizardIsComponentSelected('ofxnuke') then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    CorridorKeyStopProcessIfRunning('Nuke*.exe');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if WizardIsComponentSelected('adobe') then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    CorridorKeyStopProcessIfRunning('AfterFX.exe');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    CorridorKeyStopProcessIfRunning('Adobe Premiere Pro.exe');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  CorridorKeyStopProcessIfRunning('corridorkey_host_plugin_runtime_server.exe');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  CorridorKeyStopProcessIfRunning('corridorkey_ofx_runtime_server.exe');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  CorridorKeyStopProcessIfRunning('corridorkey.exe');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  CorridorKeyStopProcessIfRunning('ck-engine.exe');"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyDeleteHostCaches;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    foreach ($hostEntry in $SuiteManifest.hosts) {
        $cacheDeletes = @($hostEntry.cache_deletes)
        if ($cacheDeletes.Count -eq 0) {
            continue
        }
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$hostEntry.component)
        $componentId = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$hostEntry.component)
        Add-CorridorKeySuitePascalLine -Lines $Lines -Value ("  if WizardIsComponentSelected('" + $componentName + "') or CorridorKeyWasPreviouslyInstalled('components', '" + $componentId + "') then begin")
        foreach ($cacheDelete in $cacheDeletes) {
            $cachePath = ConvertTo-CorridorKeyInnoPath -Path ([string]$cacheDelete)
            $escapedCachePath = ConvertTo-CorridorKeyInnoPascalString -Value $cachePath
            Add-CorridorKeySuitePascalLine -Lines $Lines -Value ("    CorridorKeyDeleteMatchingFiles(ExpandConstant('" + $escapedCachePath + "'));")
        }
        Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    }
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyApplySuiteDeselectionCleanup;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if not WizardIsComponentSelected('gui') then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if CorridorKeyWasPreviouslyInstalled('components', 'gui') then begin"
    Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path "{#SuiteGuiRoot}" -Indent "      "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if (not WizardIsComponentSelected('ofxresolvefusion')) and (not WizardIsComponentSelected('ofxnuke')) then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if CorridorKeyWasPreviouslyInstalled('components', 'ofx-resolve-fusion') or CorridorKeyWasPreviouslyInstalled('components', 'ofx-nuke') then begin"
    Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path $ofxRoot -Indent "      "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if not WizardIsComponentSelected('adobe') then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if CorridorKeyWasPreviouslyInstalled('components', 'adobe') then begin"
    Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path $adobeRoot -Indent "      "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if not WizardIsComponentSelected('green') then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if CorridorKeyWasPreviouslyInstalled('components', 'green') then begin"
    Add-CorridorKeySuiteModelCleanupCalls -Lines $Lines -SuiteManifest $SuiteManifest -Component "green" -Indent "      "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if not WizardIsComponentSelected('blue') then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if CorridorKeyWasPreviouslyInstalled('components', 'blue') then begin"
    Add-CorridorKeySuiteModelCleanupCalls -Lines $Lines -SuiteManifest $SuiteManifest -Component "blue" -Indent "      "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyApplySuiteCleanInstallCleanup;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if WizardIsTaskSelected('cleaninstall') then begin"
    Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path "{#SharedRuntimeRoot}\Contents\Win64" -Indent "    "
    Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path "{#SharedRuntimeRoot}\Contents\Resources" -Indent "    "
    Add-CorridorKeySuiteDeleteFileCall -Lines $Lines -Path "{#SuiteInventoryPath}" -Indent "    "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if WizardIsComponentSelected('gui') then begin"
    Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path "{#SuiteGuiRoot}" -Indent "      "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if WizardIsComponentSelected('ofxresolvefusion') or WizardIsComponentSelected('ofxnuke') then begin"
    Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path $ofxRoot -Indent "      "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    if WizardIsComponentSelected('adobe') then begin"
    Add-CorridorKeySuiteDeleteTreeCall -Lines $Lines -Path $adobeRoot -Indent "      "
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CorridorKeyApplySuiteLifecycleCleanup;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  CorridorKeyStopSuiteProcesses;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  CorridorKeyDeleteHostCaches;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  CorridorKeyApplySuiteDeselectionCleanup;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  CorridorKeyApplySuiteCleanInstallCleanup;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "procedure CurStepChanged(CurStep: TSetupStep);"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if CurStep = ssInstall then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    CorridorKeyApplySuiteLifecycleCleanup;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  if CurStep = ssPostInstall then begin"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "    CorridorKeyWriteSelectedSuitePackMarkers;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "  end;"
    Add-CorridorKeySuitePascalLine -Lines $Lines -Value "end;"
}

function Add-CorridorKeySuiteLine {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Value = ""
    )

    $Lines.Add($Value) | Out-Null
}

function Resolve-CorridorKeySuiteAssetPath {
    param(
        [string]$RelativePath,
        [string]$Label
    )

    $path = Join-Path $repoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "$Label not found: $path"
    }

    return (Resolve-Path -LiteralPath $path).ProviderPath
}

function New-CorridorKeySuiteIconDibFrameBytes {
    param(
        [object]$SourceImage,
        [int]$Size
    )

    $bitmap = [System.Drawing.Bitmap]::new(
        $Size,
        $Size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $bitmap.SetResolution(96, 96)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

            $scale = [Math]::Min(
                [double]$Size / [double]$SourceImage.Width,
                [double]$Size / [double]$SourceImage.Height)
            $drawWidth = [int][Math]::Round([double]$SourceImage.Width * $scale)
            $drawHeight = [int][Math]::Round([double]$SourceImage.Height * $scale)
            $x = [int][Math]::Round(([double]$Size - [double]$drawWidth) / 2.0)
            $y = [int][Math]::Round(([double]$Size - [double]$drawHeight) / 2.0)

            $graphics.DrawImage($SourceImage, $x, $y, $drawWidth, $drawHeight)
        } finally {
            $graphics.Dispose()
        }

        $memory = [System.IO.MemoryStream]::new()
        try {
            $writer = [System.IO.BinaryWriter]::new($memory)
            try {
                $xorStride = $Size * 4
                $andStride = [int]([Math]::Ceiling($Size / 32.0) * 4)
                $xorBytes = $xorStride * $Size
                $andBytes = $andStride * $Size

                $writer.Write([UInt32]40)
                $writer.Write([Int32]$Size)
                $writer.Write([Int32]($Size * 2))
                $writer.Write([UInt16]1)
                $writer.Write([UInt16]32)
                $writer.Write([UInt32]0)
                $writer.Write([UInt32]$xorBytes)
                $writer.Write([Int32]0)
                $writer.Write([Int32]0)
                $writer.Write([UInt32]0)
                $writer.Write([UInt32]0)

                for ($y = $Size - 1; $y -ge 0; $y--) {
                    for ($x = 0; $x -lt $Size; $x++) {
                        $pixel = $bitmap.GetPixel($x, $y)
                        $writer.Write([byte]$pixel.B)
                        $writer.Write([byte]$pixel.G)
                        $writer.Write([byte]$pixel.R)
                        $writer.Write([byte]$pixel.A)
                    }
                }

                $writer.Write([byte[]]::new($andBytes))
                return $memory.ToArray()
            } finally {
                $writer.Dispose()
            }
        } finally {
            $memory.Dispose()
        }
    } finally {
        $bitmap.Dispose()
    }
}

function New-CorridorKeySuiteSetupIcon {
    param(
        [string]$SourcePath,
        [string]$OutputDir
    )

    $resolvedSource = (Resolve-Path -LiteralPath $SourcePath).ProviderPath
    if ([System.IO.Path]::GetExtension($resolvedSource).ToLowerInvariant() -eq ".ico") {
        return [ordered]@{
            source = $resolvedSource
            path = $resolvedSource
        }
    }

    Add-Type -AssemblyName System.Drawing

    $sourceImage = [System.Drawing.Image]::FromFile($resolvedSource)
    try {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
        $iconPath = Join-Path $OutputDir "ck_microchip_suite_setup.ico"
        $frames = @()
        foreach ($size in @(16, 32, 48, 64, 256)) {
            $frames += , [ordered]@{
                size = $size
                bytes = New-CorridorKeySuiteIconDibFrameBytes -SourceImage $sourceImage -Size $size
            }
        }

        $fileStream = [System.IO.File]::Open(
            $iconPath,
            [System.IO.FileMode]::Create,
            [System.IO.FileAccess]::Write)
        try {
            $writer = [System.IO.BinaryWriter]::new($fileStream)
            try {
                $writer.Write([UInt16]0)
                $writer.Write([UInt16]1)
                $writer.Write([UInt16]$frames.Count)

                $offset = 6 + (16 * $frames.Count)
                foreach ($frame in $frames) {
                    $dimension = if ($frame.size -eq 256) { 0 } else { $frame.size }
                    $writer.Write([byte]$dimension)
                    $writer.Write([byte]$dimension)
                    $writer.Write([byte]0)
                    $writer.Write([byte]0)
                    $writer.Write([UInt16]1)
                    $writer.Write([UInt16]32)
                    $writer.Write([UInt32]$frame.bytes.Length)
                    $writer.Write([UInt32]$offset)
                    $offset += $frame.bytes.Length
                }

                foreach ($frame in $frames) {
                    $writer.Write([byte[]]$frame.bytes)
                }
            } finally {
                $writer.Dispose()
            }
        } finally {
            $fileStream.Dispose()
        }

        return [ordered]@{
            source = $resolvedSource
            path = $iconPath
        }
    } finally {
        $sourceImage.Dispose()
    }
}

function Resolve-CorridorKeySuiteInstallerArtwork {
    param([string]$OutputIssPath)

    $issParent = Split-Path -Parent $OutputIssPath
    if ([string]::IsNullOrWhiteSpace($issParent)) {
        $issParent = Join-Path $env:TEMP ("corridorkey_suite_iss_" + [System.Guid]::NewGuid().ToString("N"))
    }

    $setupIcon = New-CorridorKeySuiteSetupIcon `
        -SourcePath (Resolve-CorridorKeySuiteAssetPath -RelativePath "assets\ck-microchip.png" -Label "Suite installer icon") `
        -OutputDir $issParent
    $wizardImage = Resolve-CorridorKeySuiteAssetPath `
        -RelativePath "assets\ck-install-banner.png" `
        -Label "Suite installer wizard image"

    return [ordered]@{
        setup_icon_source = $setupIcon.source
        setup_icon_path = $setupIcon.path
        wizard_image_path = $wizardImage
        wizard_small_image_path = $setupIcon.source
    }
}

function New-CorridorKeySuiteIss {
    param(
        [object]$SuiteManifest,
        [ValidateSet("online", "offline")]
        [string]$Flavor,
        [string]$InstallerIconPath,
        [string]$InstallerWizardImagePath,
        [string]$InstallerWizardSmallImagePath
    )

    $escapedInstallerIconPath = ConvertTo-CorridorKeyInnoDoubleQuotedString -Value ($InstallerIconPath -replace '/', '\')
    $escapedInstallerWizardImagePath = ConvertTo-CorridorKeyInnoDoubleQuotedString -Value ($InstallerWizardImagePath -replace '/', '\')
    $escapedInstallerWizardSmallImagePath = ConvertTo-CorridorKeyInnoDoubleQuotedString -Value ($InstallerWizardSmallImagePath -replace '/', '\')
    $lines = [System.Collections.Generic.List[string]]::new()
    Add-CorridorKeySuiteLine -Lines $lines -Value "; Generated by scripts/package_suite_installer_windows.ps1."
    Add-CorridorKeySuiteLine -Lines $lines -Value '#define InstallerSurface "suite"'
    Add-CorridorKeySuiteLine -Lines $lines -Value '#define SuitePayloadRoot "@@SUITE_PAYLOAD_ROOT@@"'
    Add-CorridorKeySuiteLine -Lines $lines -Value '#define OfflinePayloadRoot "@@OFFLINE_PAYLOAD_ROOT@@"'
    Add-CorridorKeySuiteLine -Lines $lines -Value ('#define InstallerIcon "' + $escapedInstallerIconPath + '"')
    Add-CorridorKeySuiteLine -Lines $lines -Value ('#define InstallerWizardImage "' + $escapedInstallerWizardImagePath + '"')
    Add-CorridorKeySuiteLine -Lines $lines -Value ('#define InstallerWizardSmallImage "' + $escapedInstallerWizardSmallImagePath + '"')
    Add-CorridorKeySuiteLine -Lines $lines -Value ('#define SharedRuntimeRoot "' + $SuiteManifest.shared_runtime_root + '"')
    Add-CorridorKeySuiteLine -Lines $lines -Value ('#define SuiteGuiRoot "' + $SuiteManifest.gui_root + '"')
    Add-CorridorKeySuiteLine -Lines $lines -Value ('#define SuiteInventoryPath "' + $SuiteManifest.shared_runtime_root + '\Contents\Resources\suite_inventory.ini"')
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Setup]"
    Add-CorridorKeySuiteLine -Lines $lines -Value "AppId={{7C93E726-017B-45ED-931B-78436F7612A8}"
    Add-CorridorKeySuiteLine -Lines $lines -Value "AppName=CorridorKey Suite"
    Add-CorridorKeySuiteLine -Lines $lines -Value ("AppVersion=" + $SuiteManifest.version)
    Add-CorridorKeySuiteLine -Lines $lines -Value ("AppVerName=CorridorKey Suite " + $SuiteManifest.display_version_label)
    Add-CorridorKeySuiteLine -Lines $lines -Value "AppPublisher=CorridorKey"
    Add-CorridorKeySuiteLine -Lines $lines -Value "AppPublisherURL=https://corridorkey.com"
    Add-CorridorKeySuiteLine -Lines $lines -Value "AppSupportURL=https://corridorkey.com"
    Add-CorridorKeySuiteLine -Lines $lines -Value "AppUpdatesURL=https://corridorkey.com"
    Add-CorridorKeySuiteLine -Lines $lines -Value ("VersionInfoVersion=" + $SuiteManifest.version)
    Add-CorridorKeySuiteLine -Lines $lines -Value "VersionInfoCompany=CorridorKey"
    Add-CorridorKeySuiteLine -Lines $lines -Value "VersionInfoDescription=CorridorKey Suite Installer"
    Add-CorridorKeySuiteLine -Lines $lines -Value "VersionInfoProductName=CorridorKey Suite"
    Add-CorridorKeySuiteLine -Lines $lines -Value ("VersionInfoProductVersion=" + $SuiteManifest.version)
    Add-CorridorKeySuiteLine -Lines $lines -Value ("VersionInfoProductTextVersion=" + $SuiteManifest.display_version_label)
    Add-CorridorKeySuiteLine -Lines $lines -Value ("VersionInfoTextVersion=" + $SuiteManifest.display_version_label)
    Add-CorridorKeySuiteLine -Lines $lines -Value "DefaultDirName={autopf}\CorridorKey"
    Add-CorridorKeySuiteLine -Lines $lines -Value "DisableWelcomePage=no"
    Add-CorridorKeySuiteLine -Lines $lines -Value "DisableDirPage=auto"
    Add-CorridorKeySuiteLine -Lines $lines -Value "DisableProgramGroupPage=yes"
    Add-CorridorKeySuiteLine -Lines $lines -Value "DisableReadyPage=no"
    Add-CorridorKeySuiteLine -Lines $lines -Value ("UninstallDisplayName=CorridorKey Suite " + $SuiteManifest.display_version_label)
    Add-CorridorKeySuiteLine -Lines $lines -Value "UninstallDisplayIcon={#SharedRuntimeRoot}\Contents\Win64\corridorkey.exe"
    Add-CorridorKeySuiteLine -Lines $lines -Value "WizardStyle=modern dynamic windows11"
    Add-CorridorKeySuiteLine -Lines $lines -Value "WizardSizePercent=110"
    Add-CorridorKeySuiteLine -Lines $lines -Value "WizardImageFile={#InstallerWizardImage}"
    Add-CorridorKeySuiteLine -Lines $lines -Value "WizardImageFileDynamicDark={#InstallerWizardImage}"
    Add-CorridorKeySuiteLine -Lines $lines -Value "WizardSmallImageFile={#InstallerWizardSmallImage}"
    Add-CorridorKeySuiteLine -Lines $lines -Value "WizardSmallImageFileDynamicDark={#InstallerWizardSmallImage}"
    Add-CorridorKeySuiteLine -Lines $lines -Value "WizardImageBackColor=black"
    Add-CorridorKeySuiteLine -Lines $lines -Value "ArchitecturesAllowed=x64compatible"
    Add-CorridorKeySuiteLine -Lines $lines -Value "ArchitecturesInstallIn64BitMode=x64compatible"
    Add-CorridorKeySuiteLine -Lines $lines -Value "ArchiveExtraction=full"
    Add-CorridorKeySuiteLine -Lines $lines -Value "OutputDir=@@OUTPUT_DIR@@"
    Add-CorridorKeySuiteLine -Lines $lines -Value "OutputBaseFilename=@@OUTPUT_BASE_FILENAME@@"
    Add-CorridorKeySuiteLine -Lines $lines -Value "SetupIconFile={#InstallerIcon}"
    Add-CorridorKeySuiteLine -Lines $lines -Value "PrivilegesRequired=admin"
    Add-CorridorKeySuiteLine -Lines $lines -Value "PrivilegesRequiredOverridesAllowed=dialog"
    Add-CorridorKeySuiteLine -Lines $lines -Value "ShowLanguageDialog=no"
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

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Tasks]"
    Add-CorridorKeySuiteLine -Lines $lines -Value 'Name: "cleaninstall"; Description: "Clean install (remove selected CorridorKey payloads before installing)"; Flags: unchecked'
    Add-CorridorKeySuiteLine -Lines $lines -Value 'Name: "desktopicon"; Description: "Create a CorridorKey GUI desktop shortcut"; GroupDescription: "Shortcuts:"; Components: gui; Flags: unchecked'
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Icons]"
    Add-CorridorKeySuiteLine -Lines $lines -Value 'Name: "{autoprograms}\CorridorKey\CorridorKey GUI"; Filename: "{#SuiteGuiRoot}\CorridorKey.exe"; WorkingDir: "{#SuiteGuiRoot}"; Components: gui'
    Add-CorridorKeySuiteLine -Lines $lines -Value 'Name: "{autodesktop}\CorridorKey GUI"; Filename: "{#SuiteGuiRoot}\CorridorKey.exe"; WorkingDir: "{#SuiteGuiRoot}"; Components: gui; Tasks: desktopicon'
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Dirs]"
    foreach ($dir in @(
        "{#SharedRuntimeRoot}\Contents\Win64",
        "{#SharedRuntimeRoot}\Contents\Resources\models",
        "{#SharedRuntimeRoot}\Contents\Resources\torchtrt-runtime\bin",
        "{#SuiteGuiRoot}",
        "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle",
        "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle\Contents\Resources",
        "{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey\Contents\Resources",
        "{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey"
    )) {
        Add-CorridorKeySuiteLine -Lines $lines -Value ('Name: "' + $dir + '"')
    }
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[InstallDelete]"
    Add-CorridorKeySuiteLine -Lines $lines -Value 'Type: files; Name: "{#SuiteInventoryPath}"'
    Add-CorridorKeySuiteLine -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines -Value "[Files]"
    $externalizedComponentIds = @()
    if ($Flavor -eq "online") {
        $externalizedComponentIds = @($SuiteManifest.component_payloads | ForEach-Object { [string]$_.component } | Sort-Object -Unique)
    }
    $payloadEntries = @(
        @{ Source = "{#SuitePayloadRoot}\runtime\win64\*"; Dest = "{#SharedRuntimeRoot}\Contents\Win64"; Component = "runtime-core" },
        @{ Source = "{#SuitePayloadRoot}\runtime\resources\*"; Dest = "{#SharedRuntimeRoot}\Contents\Resources"; Component = "runtime-core" },
        @{ Source = "{#SuitePayloadRoot}\gui\*"; Dest = "{#SuiteGuiRoot}"; Component = "gui" },
        @{ Source = "{#SuitePayloadRoot}\ofx-resolve-fusion\*"; Dest = "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle"; Component = "ofx-resolve-fusion" },
        @{ Source = "{#SuitePayloadRoot}\ofx-nuke\*"; Dest = "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle"; Component = "ofx-nuke" },
        @{ Source = "{#SuitePayloadRoot}\adobe\*"; Dest = "{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey"; Component = "adobe" }
    )
    foreach ($entry in $payloadEntries) {
        if ($Flavor -eq "online" -and $externalizedComponentIds -contains [string]$entry.Component) {
            continue
        }
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$entry.Component)
        Add-CorridorKeySuiteLine -Lines $lines -Value ('Source: "' + $entry.Source + '"; DestDir: "' + $entry.Dest + '"; Components: ' + $componentName + '; Flags: recursesubdirs createallsubdirs ignoreversion')
    }

    if ($Flavor -eq "online") {
        foreach ($payload in $SuiteManifest.component_payloads) {
            $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$payload.component)
            $destDir = Get-CorridorKeySuiteComponentDestDir `
                -SuiteManifest $SuiteManifest `
                -ComponentId ([string]$payload.component) `
                -DestSubdir ([string]$payload.dest_subdir)
            foreach ($file in $payload.files) {
                $flags = "external ignoreversion"
                $externalSize = $file.size_bytes
                if ($payload.is_archive -and $payload.extract) {
                    $flags += " extractarchive recursesubdirs createallsubdirs"
                    if ($null -ne $payload.installed_size_bytes) {
                        $externalSize = $payload.installed_size_bytes
                    }
                }
                Add-CorridorKeySuiteLine -Lines $lines -Value ('; Download: ' + $file.url + '; Sha256: ' + $file.sha256 + '; DownloadSize: ' + $file.size_bytes)
                Add-CorridorKeySuiteLine -Lines $lines -Value ('Source: "{tmp}\' + $file.filename + '"; DestDir: "' + $destDir + '"; Components: ' + $componentName + '; Flags: ' + $flags + '; ExternalSize: ' + $externalSize)
            }
        }
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
                $markerValue = Get-CorridorKeySuitePackMarkerValue -Pack $pack
                $escapedDestSubdir = ConvertTo-CorridorKeyInnoPascalString -Value $destSubdir
                $escapedPackId = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$pack.id)
                $escapedMarkerValue = ConvertTo-CorridorKeyInnoPascalString -Value $markerValue
                $cacheCheck = "WizardIsTaskSelected('cleaninstall') or not CorridorKeySuitePackMarkerValid('$escapedDestSubdir', '$escapedPackId', '$escapedMarkerValue')"
                Add-CorridorKeySuiteLine -Lines $lines -Value ('; Download: ' + $file.url + '; Sha256: ' + $file.sha256 + '; DownloadSize: ' + $file.size_bytes)
                Add-CorridorKeySuiteLine -Lines $lines -Value ('Source: "{tmp}\' + $file.filename + '"; DestDir: "' + $destDir + '"; Components: ' + $componentName + '; Flags: ' + $flags + '; ExternalSize: ' + $externalSize + '; Check: ' + $cacheCheck)
            } else {
                Add-CorridorKeySuiteLine -Lines $lines -Value ('Source: "' + $offlinePackRoot + '\' + $file.filename + '"; DestDir: "' + $destDir + '"; Components: ' + $componentName + '; Flags: ignoreversion')
            }
        }
    }

    Add-CorridorKeySuiteLine -Lines $lines
    Add-CorridorKeySuiteLine -Lines $lines -Value "[INI]"
    foreach ($inventoryEntry in @(
        @{ Section = "suite"; Key = "installer_surface"; String = "suite"; Component = "" },
        @{ Section = "suite"; Key = "version"; String = [string]$SuiteManifest.version; Component = "" },
        @{ Section = "suite"; Key = "display_version_label"; String = [string]$SuiteManifest.display_version_label; Component = "" },
        @{ Section = "suite"; Key = "flavor"; String = [string]$SuiteManifest.flavor; Component = "" },
        @{ Section = "paths"; Key = "shared_runtime_root"; String = "{#SharedRuntimeRoot}"; Component = "" },
        @{ Section = "paths"; Key = "gui_root"; String = "{#SuiteGuiRoot}"; Component = "" }
    )) {
        Add-CorridorKeySuiteLine -Lines $lines -Value (New-CorridorKeySuiteIniLine `
                -Filename "{#SuiteInventoryPath}" `
                -Section ([string]$inventoryEntry.Section) `
                -Key ([string]$inventoryEntry.Key) `
                -String ([string]$inventoryEntry.String))
    }

    foreach ($component in $SuiteManifest.components) {
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$component.id)
        Add-CorridorKeySuiteLine -Lines $lines -Value (New-CorridorKeySuiteIniLine `
                -Filename "{#SuiteInventoryPath}" `
                -Section "components" `
                -Key ([string]$component.id) `
                -String "installed" `
                -ComponentName $componentName)
    }

    foreach ($hostEntry in $SuiteManifest.hosts) {
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$hostEntry.component)
        $destination = ConvertTo-CorridorKeySuiteInventoryPath -SuiteManifest $SuiteManifest -Path ([string]$hostEntry.destination)
        Add-CorridorKeySuiteLine -Lines $lines -Value (New-CorridorKeySuiteIniLine `
                -Filename "{#SuiteInventoryPath}" `
                -Section "hosts" `
                -Key ([string]$hostEntry.id) `
                -String $destination `
                -ComponentName $componentName)
    }

    foreach ($pack in $SuiteManifest.model_packs) {
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$pack.component)
        Add-CorridorKeySuiteLine -Lines $lines -Value (New-CorridorKeySuiteIniLine `
                -Filename "{#SuiteInventoryPath}" `
                -Section "model_packs" `
                -Key ([string]$pack.id) `
                -String ([string]$pack.component) `
                -ComponentName $componentName)
    }

    foreach ($pack in $SuiteManifest.model_packs) {
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$pack.component)
        $destSubdir = ([string]$pack.dest_subdir).Replace("/", "\")
        if ($destSubdir -ne "models") {
            continue
        }
        foreach ($file in @($pack.files)) {
            $filename = [string]$file.filename
            $section = if ($filename -match '_ctx\.onnx$') { "compiled_context_models" } else { "model_files" }
            Add-CorridorKeySuiteLine -Lines $lines -Value (New-CorridorKeySuiteIniLine `
                    -Filename "{#SuiteInventoryPath}" `
                    -Section $section `
                    -Key $filename `
                    -String ([string]$pack.id) `
                    -ComponentName $componentName)
        }
    }

    foreach ($iniEntry in @(
        @{ Filename = "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle\Contents\Resources\corridorkey_runtime.ini"; Component = "ofx-resolve-fusion" },
        @{ Filename = "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle\Contents\Resources\corridorkey_runtime.ini"; Component = "ofx-nuke" },
        @{ Filename = "{autopf}\Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey\Contents\Resources\corridorkey_runtime.ini"; Component = "adobe" },
        @{ Filename = "{#SuiteGuiRoot}\corridorkey_runtime.ini"; Component = "gui" }
    )) {
        $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$iniEntry.Component)
        Add-CorridorKeySuiteLine -Lines $lines -Value ('Filename: "' + $iniEntry.Filename + '"; Section: "runtime"; Key: "shared_root"; String: "{#SharedRuntimeRoot}"; Components: ' + $componentName)
    }

    Add-CorridorKeySuitePathRegistrationSections -Lines $lines

    Add-CorridorKeySuiteLine -Lines $lines
    Add-CorridorKeySuiteLine -Lines $lines -Value "[Code]"
    if ($Flavor -eq "online") {
        Add-CorridorKeySuiteLine -Lines $lines -Value "var"
        Add-CorridorKeySuiteLine -Lines $lines -Value "  DownloadPage: TDownloadWizardPage;"
        Add-CorridorKeySuiteLine -Lines $lines
    }
    Add-CorridorKeySuitePackMarkerCode -Lines $lines -SuiteManifest $SuiteManifest
    Add-CorridorKeySuiteLifecycleCode -Lines $lines -SuiteManifest $SuiteManifest

    if ($Flavor -eq "online") {
        Add-CorridorKeySuiteLine -Lines $lines
        Add-CorridorKeySuiteLine -Lines $lines -Value "procedure InitializeWizard;"
        Add-CorridorKeySuiteLine -Lines $lines -Value "begin"
        Add-CorridorKeySuiteLine -Lines $lines -Value "  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), 'Downloading selected CorridorKey payloads. SHA-256 is verified for every file.', nil);"
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
                $destSubdir = ([string]$pack.dest_subdir).Replace("/", "\")
                $markerValue = Get-CorridorKeySuitePackMarkerValue -Pack $pack
                $escapedDestSubdir = ConvertTo-CorridorKeyInnoPascalString -Value $destSubdir
                $escapedPackId = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$pack.id)
                $escapedMarkerValue = ConvertTo-CorridorKeyInnoPascalString -Value $markerValue
                Add-CorridorKeySuiteLine -Lines $lines -Value ("    if WizardIsTaskSelected('cleaninstall') or not CorridorKeySuitePackMarkerValid('" + $escapedDestSubdir + "', '" + $escapedPackId + "', '" + $escapedMarkerValue + "') then begin")
                foreach ($file in $pack.files) {
                    $escapedUrl = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$file.url)
                    $escapedFilename = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$file.filename)
                    Add-CorridorKeySuiteLine -Lines $lines -Value ("      DownloadPage.Add('" + $escapedUrl + "', '" + $escapedFilename + "', '" + $file.sha256 + "');")
                }
                Add-CorridorKeySuiteLine -Lines $lines -Value "    end;"
            }
            Add-CorridorKeySuiteLine -Lines $lines -Value "  end;"
        }
        foreach ($payload in $SuiteManifest.component_payloads) {
            $componentName = ConvertTo-CorridorKeyInnoComponentName -Id ([string]$payload.component)
            Add-CorridorKeySuiteLine -Lines $lines -Value ("  if WizardIsComponentSelected('" + $componentName + "') then begin")
            foreach ($file in $payload.files) {
                $escapedUrl = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$file.url)
                $escapedFilename = ConvertTo-CorridorKeyInnoPascalString -Value ([string]$file.filename)
                Add-CorridorKeySuiteLine -Lines $lines -Value ("    DownloadPage.Add('" + $escapedUrl + "', '" + $escapedFilename + "', '" + $file.sha256 + "');")
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
        [string]$Path,
        [object]$InstallerArtwork
    )

    $iss = New-CorridorKeySuiteIss `
        -SuiteManifest $SuiteManifest `
        -Flavor $Flavor `
        -InstallerIconPath ([string]$InstallerArtwork.setup_icon_path) `
        -InstallerWizardImagePath ([string]$InstallerArtwork.wizard_image_path) `
        -InstallerWizardSmallImagePath ([string]$InstallerArtwork.wizard_small_image_path)
    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Set-Content -LiteralPath $Path -Value $iss -Encoding UTF8
}

function Resolve-CorridorKeySuiteIsccPath {
    param([string]$Override)

    if (-not [string]::IsNullOrWhiteSpace($Override)) {
        if (-not (Test-Path -LiteralPath $Override)) {
            throw "ISCC override path does not exist: $Override"
        }
        return (Resolve-Path -LiteralPath $Override).ProviderPath
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 7\ISCC.exe"),
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe",
        "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
        "C:\Program Files\Inno Setup 7\ISCC.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    $cmd = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
    if ($null -ne $cmd) {
        return $cmd.Source
    }

    throw "ISCC.exe was not found. Install Inno Setup 6 or pass -ISCCPath."
}

function Test-CorridorKeyDirectoryHasFiles {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return $false
    }
    return @(Get-ChildItem -LiteralPath $Path -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).Count -gt 0
}

function ConvertTo-CorridorKeyFullPath {
    param([string]$Path)

    return [System.IO.Path]::GetFullPath($Path)
}

function Test-CorridorKeySamePath {
    param(
        [string]$Left,
        [string]$Right
    )

    $leftFull = (ConvertTo-CorridorKeyFullPath -Path $Left).TrimEnd('\', '/')
    $rightFull = (ConvertTo-CorridorKeyFullPath -Path $Right).TrimEnd('\', '/')
    return [StringComparer]::OrdinalIgnoreCase.Equals($leftFull, $rightFull)
}

function Test-CorridorKeyPathContains {
    param(
        [string]$Parent,
        [string]$Child
    )

    $parentFull = (ConvertTo-CorridorKeyFullPath -Path $Parent).TrimEnd('\', '/')
    $childFull = (ConvertTo-CorridorKeyFullPath -Path $Child).TrimEnd('\', '/')
    if (Test-CorridorKeySamePath -Left $parentFull -Right $childFull) {
        return $true
    }

    return $childFull.StartsWith($parentFull + "\", [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-CorridorKeyPathOverlaps {
    param(
        [string]$Left,
        [string]$Right
    )

    return (Test-CorridorKeyPathContains -Parent $Left -Child $Right) -or
        (Test-CorridorKeyPathContains -Parent $Right -Child $Left)
}

function Assert-CorridorKeyExistingDirectory {
    param(
        [string]$Path,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Label is required when staging a suite payload."
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Label not found or not a directory: $Path"
    }

    return (Resolve-Path -LiteralPath $Path).ProviderPath
}

function Assert-CorridorKeySafeSuitePayloadOutputRoot {
    param(
        [string]$Root,
        [string[]]$SourceRoots
    )

    if ([string]::IsNullOrWhiteSpace($Root)) {
        throw "Suite payload output root is required when staging a suite payload."
    }

    $resolvedRoot = ConvertTo-CorridorKeyFullPath -Path $Root
    $trimmedRoot = $resolvedRoot.TrimEnd('\', '/')
    $driveRoot = ([System.IO.Path]::GetPathRoot($resolvedRoot)).TrimEnd('\', '/')
    if ([StringComparer]::OrdinalIgnoreCase.Equals($trimmedRoot, $driveRoot)) {
        throw "Suite payload output root must not be a filesystem root: $resolvedRoot"
    }

    $allowedParents = @(
        (Join-Path $repoRoot "dist"),
        $env:TEMP,
        $env:TMP
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique

    $isAllowedChild = $false
    foreach ($allowedParent in $allowedParents) {
        if ((Test-CorridorKeyPathContains -Parent $allowedParent -Child $resolvedRoot) -and
            -not (Test-CorridorKeySamePath -Left $resolvedRoot -Right $allowedParent)) {
            $isAllowedChild = $true
            break
        }
    }
    if (-not $isAllowedChild) {
        throw "Suite payload output root must be a child of dist or TEMP: $resolvedRoot"
    }

    foreach ($sourceRoot in $SourceRoots) {
        if ([string]::IsNullOrWhiteSpace($sourceRoot)) {
            continue
        }
        $resolvedSourceRoot = ConvertTo-CorridorKeyFullPath -Path $sourceRoot
        if (Test-CorridorKeyPathOverlaps -Left $resolvedRoot -Right $resolvedSourceRoot) {
            throw "Suite payload output root must not overlap component package roots: $resolvedRoot overlaps $resolvedSourceRoot"
        }
    }

    return $resolvedRoot
}

function Copy-CorridorKeyDirectoryContents {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$ExcludeNames = @()
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        if ($ExcludeNames -contains $item.Name) {
            continue
        }
        Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse -Force
    }
}

function Get-CorridorKeySuiteRuntimeCoreExcludedNames {
    return @(
        "CorridorKey_Runtime.exe",
        "README.txt",
        "smoke_test.bat",
        "models",
        "outputs",
        "torchtrt-runtime",
        "model_inventory.json",
        "c10.dll",
        "c10_cuda.dll",
        "torch.dll",
        "torch_cpu.dll",
        "torch_cuda.dll",
        "torch_global_deps.dll",
        "torchtrt.dll",
        "corridorkey_torchtrt.dll"
    )
}

function Write-CorridorKeySuitePathUpdateScript {
    param([string]$Win64Destination)

    if (-not (Test-Path -LiteralPath $Win64Destination -PathType Container)) {
        throw "Suite runtime Win64 directory not found at $Win64Destination. Runtime staging must run before writing update_path.ps1."
    }

    $targetPath = Join-Path $Win64Destination "update_path.ps1"
    $content = @'
param(
    [ValidateSet("Install", "Uninstall")]
    [string]$Mode = "Install"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$binDir = $PSScriptRoot
$current = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($null -eq $current) { $current = "" }

$normalizedBinDir = $binDir.TrimEnd('\')
$entries = @(
    $current -split ';' | Where-Object {
        $_ -and ($_.Trim().TrimEnd('\') -ine $normalizedBinDir)
    }
)

if ($Mode -eq "Install") {
    $entries += $binDir
}

$newPath = ($entries -join ';').Trim(';')
[Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")

$source = @"
using System;
using System.Runtime.InteropServices;
public static class CorridorKeyEnvironmentBroadcast {
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        UInt32 Msg,
        UIntPtr wParam,
        String lParam,
        UInt32 fuFlags,
        UInt32 uTimeout,
        out UIntPtr lpdwResult);
}
"@
Add-Type -TypeDefinition $source -ErrorAction SilentlyContinue

$result = [UIntPtr]::Zero
[void][CorridorKeyEnvironmentBroadcast]::SendMessageTimeout(
    [IntPtr]65535,
    0x001A,
    [UIntPtr]::Zero,
    "Environment",
    0x0002,
    5000,
    [ref]$result)

Write-Host "CorridorKey CLI PATH $Mode complete: $binDir"
'@

    Set-Content -LiteralPath $targetPath -Value $content -Encoding ASCII
}

function Copy-CorridorKeySuiteRuntimePayload {
    param(
        [string]$RuntimeRoot,
        [string]$Destination,
        [string[]]$RuntimeSidecarRoots = @()
    )

    $resolvedRuntimeRoot = Assert-CorridorKeyExistingDirectory -Path $RuntimeRoot -Label "Runtime package root"
    $enginePath = Join-Path $resolvedRuntimeRoot "ck-engine.exe"
    $cliPath = Join-Path $resolvedRuntimeRoot "corridorkey.exe"
    if (-not (Test-Path -LiteralPath $enginePath -PathType Leaf) -and
        -not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
        throw "Runtime package root is missing ck-engine.exe or corridorkey.exe: $resolvedRuntimeRoot"
    }

    $guiExecutablePath = Join-Path $resolvedRuntimeRoot "CorridorKey_Runtime.exe"
    if (-not (Test-Path -LiteralPath $guiExecutablePath -PathType Leaf)) {
        throw "Runtime package root is missing CorridorKey_Runtime.exe for suite GUI staging: $resolvedRuntimeRoot"
    }

    $win64Destination = Join-Path $Destination "win64"
    $resourcesDestination = Join-Path $Destination "resources"
    Copy-CorridorKeyDirectoryContents `
        -Source $resolvedRuntimeRoot `
        -Destination $win64Destination `
        -ExcludeNames @(Get-CorridorKeySuiteRuntimeCoreExcludedNames)

    $sourceCliPath = if (Test-Path -LiteralPath $cliPath -PathType Leaf) { $cliPath } else { $enginePath }
    $cliAliasPath = Join-Path $win64Destination "corridorkey.exe"
    if (-not (Test-Path -LiteralPath $cliAliasPath -PathType Leaf)) {
        Copy-Item -LiteralPath $sourceCliPath -Destination $cliAliasPath -Force
    }
    Write-CorridorKeySuitePathUpdateScript -Win64Destination $win64Destination

    $runtimeServerCandidates = @(
        (Join-Path $resolvedRuntimeRoot "corridorkey_host_plugin_runtime_server.exe")
    )
    foreach ($sidecarRoot in $RuntimeSidecarRoots) {
        if ([string]::IsNullOrWhiteSpace($sidecarRoot)) {
            continue
        }
        $runtimeServerCandidates += Join-Path $sidecarRoot "Contents\Win64\corridorkey_host_plugin_runtime_server.exe"
        $runtimeServerCandidates += Join-Path $sidecarRoot "corridorkey_host_plugin_runtime_server.exe"
    }
    $runtimeServerSource = @($runtimeServerCandidates | Where-Object {
            Test-Path -LiteralPath $_ -PathType Leaf
        } | Select-Object -First 1)
    if ($runtimeServerSource.Count -eq 0) {
        throw "Suite runtime staging requires corridorkey_host_plugin_runtime_server.exe from the runtime, OFX, or Adobe package root."
    }
    Copy-Item `
        -LiteralPath $runtimeServerSource[0] `
        -Destination (Join-Path $win64Destination "corridorkey_host_plugin_runtime_server.exe") `
        -Force

    $torchTrtRuntimeRoot = Join-Path $resolvedRuntimeRoot "torchtrt-runtime"
    if (Test-Path -LiteralPath $torchTrtRuntimeRoot -PathType Container) {
        New-Item -ItemType Directory -Path $resourcesDestination -Force | Out-Null
        Copy-Item -LiteralPath $torchTrtRuntimeRoot -Destination $resourcesDestination -Recurse -Force
    }

    $torchTrtWrapperCandidates = @(
        (Join-Path $resolvedRuntimeRoot "torchtrt-runtime\bin\corridorkey_torchtrt.dll")
    )
    foreach ($sidecarRoot in $RuntimeSidecarRoots) {
        if ([string]::IsNullOrWhiteSpace($sidecarRoot)) {
            continue
        }
        $torchTrtWrapperCandidates += Join-Path $sidecarRoot "Contents\Resources\torchtrt-runtime\bin\corridorkey_torchtrt.dll"
        $torchTrtWrapperCandidates += Join-Path $sidecarRoot "torchtrt-runtime\bin\corridorkey_torchtrt.dll"
    }
    $torchTrtWrapperSource = @($torchTrtWrapperCandidates | Where-Object {
            Test-Path -LiteralPath $_ -PathType Leaf
        } | Select-Object -First 1)
    if ($torchTrtWrapperSource.Count -eq 0) {
        throw "Suite runtime staging requires corridorkey_torchtrt.dll from the runtime, OFX, or Adobe package root."
    }
    $torchTrtWrapperDestinationDir = Join-Path $resourcesDestination "torchtrt-runtime\bin"
    New-Item -ItemType Directory -Path $torchTrtWrapperDestinationDir -Force | Out-Null
    Copy-Item `
        -LiteralPath $torchTrtWrapperSource[0] `
        -Destination (Join-Path $torchTrtWrapperDestinationDir "corridorkey_torchtrt.dll") `
        -Force

}

function Copy-CorridorKeySuiteGuiPayload {
    param(
        [string]$RuntimeRoot,
        [string]$Destination
    )

    $resolvedRuntimeRoot = Assert-CorridorKeyExistingDirectory -Path $RuntimeRoot -Label "Runtime package root"
    $guiExecutablePath = Join-Path $resolvedRuntimeRoot "CorridorKey_Runtime.exe"
    if (-not (Test-Path -LiteralPath $guiExecutablePath -PathType Leaf)) {
        throw "Runtime package root is missing CorridorKey_Runtime.exe for suite GUI staging: $resolvedRuntimeRoot"
    }
    $ffmpegPath = Join-Path $resolvedRuntimeRoot "ffmpeg.exe"
    if (-not (Test-Path -LiteralPath $ffmpegPath -PathType Leaf)) {
        throw "Runtime package root is missing ffmpeg.exe for suite GUI previews: $resolvedRuntimeRoot"
    }

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Copy-Item -LiteralPath $guiExecutablePath -Destination (Join-Path $Destination "CorridorKey.exe") -Force
    Copy-Item -LiteralPath $ffmpegPath -Destination (Join-Path $Destination "ffmpeg.exe") -Force
}

function Resolve-CorridorKeyOfxBundleRoot {
    param([string]$PackageRoot)

    $resolvedPackageRoot = Assert-CorridorKeyExistingDirectory -Path $PackageRoot -Label "OFX package root"
    $directContents = Join-Path $resolvedPackageRoot "Contents\Win64\CorridorKey.ofx"
    if (Test-Path -LiteralPath $directContents -PathType Leaf) {
        return $resolvedPackageRoot
    }

    $bundleRoot = Join-Path $resolvedPackageRoot "CorridorKey.ofx.bundle"
    $bundleContents = Join-Path $bundleRoot "Contents\Win64\CorridorKey.ofx"
    if (Test-Path -LiteralPath $bundleContents -PathType Leaf) {
        return $bundleRoot
    }

    throw "OFX package root must be a CorridorKey.ofx.bundle or contain one: $resolvedPackageRoot"
}

function Resolve-CorridorKeyAdobePayloadRoot {
    param([string]$PackageRoot)

    $resolvedPackageRoot = Assert-CorridorKeyExistingDirectory -Path $PackageRoot -Label "Adobe package root"
    $mediaCoreRoot = Join-Path $resolvedPackageRoot "Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey"
    $mediaCoreWin64Root = Join-Path $mediaCoreRoot "Contents\Win64"
    if (@(Get-ChildItem -LiteralPath $mediaCoreWin64Root -Filter "*.aex" -File -ErrorAction SilentlyContinue | Select-Object -First 1).Count -gt 0) {
        return $mediaCoreRoot
    }

    $directWin64Root = Join-Path $resolvedPackageRoot "Contents\Win64"
    if (@(Get-ChildItem -LiteralPath $directWin64Root -Filter "*.aex" -File -ErrorAction SilentlyContinue | Select-Object -First 1).Count -gt 0) {
        return $resolvedPackageRoot
    }

    throw "Adobe package root must be a package output or exact MediaCore CorridorKey payload containing Contents\Win64 .aex files: $resolvedPackageRoot"
}

function Copy-CorridorKeySuiteOfxPayload {
    param(
        [string]$BundleRoot,
        [string]$Destination
    )

    $sourceWin64 = Join-Path $BundleRoot "Contents\Win64"
    $destinationWin64 = Join-Path $Destination "Contents\Win64"
    New-Item -ItemType Directory -Path $destinationWin64 -Force | Out-Null
    $pluginFiles = @(Get-ChildItem -LiteralPath $sourceWin64 -Filter "*.ofx" -File -ErrorAction SilentlyContinue)
    if ($pluginFiles.Count -eq 0) {
        throw "OFX package root does not contain a host plugin binary under Contents\Win64: $BundleRoot"
    }

    foreach ($pluginFile in $pluginFiles) {
        Copy-Item -LiteralPath $pluginFile.FullName -Destination $destinationWin64 -Force
    }
}

function Copy-CorridorKeySuiteAdobePayload {
    param(
        [string]$PayloadRoot,
        [string]$Destination
    )

    $sourceWin64 = Join-Path $PayloadRoot "Contents\Win64"
    $destinationWin64 = Join-Path $Destination "Contents\Win64"
    New-Item -ItemType Directory -Path $destinationWin64 -Force | Out-Null
    $pluginFiles = @(Get-ChildItem -LiteralPath $sourceWin64 -Filter "*.aex" -File -ErrorAction SilentlyContinue)
    if ($pluginFiles.Count -eq 0) {
        throw "Adobe payload root does not contain .aex files under Contents\Win64: $PayloadRoot"
    }

    foreach ($pluginFile in $pluginFiles) {
        Copy-Item -LiteralPath $pluginFile.FullName -Destination $destinationWin64 -Force
    }
}

function New-CorridorKeySuitePayloadRootFromPackages {
    param(
        [string]$OutputRoot,
        [string]$RuntimeRoot,
        [string]$OfxRoot,
        [string]$AdobeRoot
    )

    $resolvedRuntimeRoot = Assert-CorridorKeyExistingDirectory -Path $RuntimeRoot -Label "Runtime package root"
    $resolvedOfxPackageRoot = Assert-CorridorKeyExistingDirectory -Path $OfxRoot -Label "OFX package root"
    $ofxBundleRoot = Resolve-CorridorKeyOfxBundleRoot -PackageRoot $resolvedOfxPackageRoot
    $resolvedAdobePackageRoot = Assert-CorridorKeyExistingDirectory -Path $AdobeRoot -Label "Adobe package root"
    $adobePayloadRoot = Resolve-CorridorKeyAdobePayloadRoot -PackageRoot $resolvedAdobePackageRoot
    $resolvedOutputRoot = Assert-CorridorKeySafeSuitePayloadOutputRoot `
        -Root $OutputRoot `
        -SourceRoots @(
            $resolvedRuntimeRoot,
            $resolvedOfxPackageRoot,
            $ofxBundleRoot,
            $resolvedAdobePackageRoot,
            $adobePayloadRoot
        )

    if (Test-Path -LiteralPath $resolvedOutputRoot) {
        Remove-Item -LiteralPath $resolvedOutputRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $resolvedOutputRoot -Force | Out-Null

    Copy-CorridorKeySuiteRuntimePayload `
        -RuntimeRoot $resolvedRuntimeRoot `
        -Destination (Join-Path $resolvedOutputRoot "runtime") `
        -RuntimeSidecarRoots @($ofxBundleRoot, $adobePayloadRoot)
    Copy-CorridorKeySuiteGuiPayload `
        -RuntimeRoot $resolvedRuntimeRoot `
        -Destination (Join-Path $resolvedOutputRoot "gui")

    Copy-CorridorKeySuiteOfxPayload `
        -BundleRoot $ofxBundleRoot `
        -Destination (Join-Path $resolvedOutputRoot "ofx-resolve-fusion")
    Copy-CorridorKeySuiteOfxPayload `
        -BundleRoot $ofxBundleRoot `
        -Destination (Join-Path $resolvedOutputRoot "ofx-nuke")

    Copy-CorridorKeySuiteAdobePayload `
        -PayloadRoot $adobePayloadRoot `
        -Destination (Join-Path $resolvedOutputRoot "adobe")

    return $resolvedOutputRoot
}

function Assert-CorridorKeyFileSha256 {
    param(
        [string]$Path,
        [string]$ExpectedSha256
    )

    if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
        throw "Expected SHA-256 is missing for offline payload file: $Path"
    }

    $actualSha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
        throw "Offline model payload SHA256 mismatch for ${Path}: expected $ExpectedSha256, got $actualSha256"
    }
}

function Assert-CorridorKeySuitePayloadRoot {
    param(
        [string]$Root,
        [object]$SuiteManifest,
        [ValidateSet("online", "offline")]
        [string]$Flavor
    )

    $externalizedComponentIds = @()
    if ($Flavor -eq "online") {
        $externalizedComponentIds = @($SuiteManifest.component_payloads | ForEach-Object { [string]$_.component } | Sort-Object -Unique)
    }

    $requiredSubdirs = @("runtime\win64", "runtime\resources")
    foreach ($entry in @(
            @{ Component = "gui"; Subdir = "gui" },
            @{ Component = "ofx-resolve-fusion"; Subdir = "ofx-resolve-fusion" },
            @{ Component = "ofx-nuke"; Subdir = "ofx-nuke" },
            @{ Component = "adobe"; Subdir = "adobe" }
        )) {
        if ($Flavor -eq "online" -and $externalizedComponentIds -contains [string]$entry.Component) {
            continue
        }
        $requiredSubdirs += [string]$entry.Subdir
    }

    if ([string]::IsNullOrWhiteSpace($Root)) {
        throw "Suite payload root is required. Pass -SuitePayloadRoot with required subdirectories: $($requiredSubdirs -join ', ')."
    }
    if (-not (Test-Path -LiteralPath $Root)) {
        throw "Suite payload root not found: $Root"
    }

    foreach ($relativeDir in $requiredSubdirs) {
        $candidate = Join-Path $Root $relativeDir
        if (-not (Test-CorridorKeyDirectoryHasFiles -Path $candidate)) {
            throw "Suite payload subdirectory is missing, not a directory, or empty: $candidate"
        }
    }

    return (Resolve-Path -LiteralPath $Root).ProviderPath
}

function Assert-CorridorKeySuiteOfflinePayloadRoot {
    param(
        [string]$Root,
        [object]$SuiteManifest
    )

    if ([string]::IsNullOrWhiteSpace($Root)) {
        throw "Offline suite packaging requires -ModelPayloadDir matching scripts\installer\stage_offline_payload.ps1 output."
    }
    if (-not (Test-Path -LiteralPath $Root)) {
        throw "Offline model payload root not found: $Root"
    }

    foreach ($pack in $SuiteManifest.model_packs) {
        $destSubdir = ([string]$pack.dest_subdir).Replace("/", "\")
        $packDir = Join-Path $Root $destSubdir
        if ($pack.is_archive -and $pack.extract) {
            foreach ($file in $pack.files) {
                $archivePath = Join-Path $packDir $file.filename
                if (Test-Path -LiteralPath $archivePath) {
                    throw "Offline archive payload must be pre-extracted, not staged as the source archive: $archivePath"
                }
            }

            $stagedFiles = @(Get-ChildItem -LiteralPath $packDir -File -Recurse -ErrorAction SilentlyContinue)
            $stagedFileCount = $stagedFiles.Count
            if ($stagedFileCount -eq 0) {
                throw "Offline extracted archive payload is missing or empty: $packDir"
            }
            if ($null -ne $pack.installed_file_count -and $pack.installed_file_count -gt 0) {
                $expectedFileCount = [int]$pack.installed_file_count
                if ($stagedFileCount -ne $expectedFileCount) {
                    throw "Offline extracted archive payload has $stagedFileCount file(s), expected $expectedFileCount from the distribution manifest: $packDir"
                }
            }
            if ($null -ne $pack.installed_size_bytes -and $pack.installed_size_bytes -gt 0) {
                $expectedSizeBytes = [Int64]$pack.installed_size_bytes
                $actualSizeBytes = [Int64](($stagedFiles | Measure-Object -Property Length -Sum).Sum)
                if ($actualSizeBytes -ne $expectedSizeBytes) {
                    throw "Offline extracted archive payload has $actualSizeBytes byte(s), expected $expectedSizeBytes from the distribution manifest: $packDir"
                }
            }
            continue
        }

        foreach ($file in $pack.files) {
            $expectedFile = Join-Path $packDir $file.filename
            if (-not (Test-Path -LiteralPath $expectedFile)) {
                throw "Offline model payload file missing: $expectedFile"
            }
            Assert-CorridorKeyFileSha256 -Path $expectedFile -ExpectedSha256 $file.sha256
        }
    }

    return (Resolve-Path -LiteralPath $Root).ProviderPath
}

function ConvertTo-CorridorKeyConcreteSuiteIss {
    param(
        [object]$SuiteManifest,
        [ValidateSet("online", "offline")]
        [string]$Flavor,
        [string]$ResolvedSuitePayloadRoot,
        [string]$ResolvedModelPayloadDir,
        [string]$ResolvedOutputDir,
        [string]$ResolvedOutputBaseFilename,
        [object]$InstallerArtwork
    )

    $iss = New-CorridorKeySuiteIss `
        -SuiteManifest $SuiteManifest `
        -Flavor $Flavor `
        -InstallerIconPath ([string]$InstallerArtwork.setup_icon_path) `
        -InstallerWizardImagePath ([string]$InstallerArtwork.wizard_image_path) `
        -InstallerWizardSmallImagePath ([string]$InstallerArtwork.wizard_small_image_path)
    $iss = $iss.Replace("@@SUITE_PAYLOAD_ROOT@@", ($ResolvedSuitePayloadRoot -replace '/', '\'))
    $iss = $iss.Replace("@@OFFLINE_PAYLOAD_ROOT@@", ($ResolvedModelPayloadDir -replace '/', '\'))
    $iss = $iss.Replace("@@OUTPUT_DIR@@", ($ResolvedOutputDir -replace '/', '\'))
    $iss = $iss.Replace("@@OUTPUT_BASE_FILENAME@@", $ResolvedOutputBaseFilename)
    return $iss
}

$suiteManifest = New-CorridorKeySuiteManifest `
    -Flavor $Flavor `
    -Version $Version `
    -DisplayVersionLabel $DisplayVersionLabel `
    -Track $Track

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot "dist"
}
$artifactTag = if ([string]::IsNullOrWhiteSpace($DisplayVersionLabel)) { $Version } else { $DisplayVersionLabel }
if ([string]::IsNullOrWhiteSpace($artifactTag)) {
    $artifactTag = "local"
}

if ([string]::IsNullOrWhiteSpace($OutputBaseFilename)) {
    $OutputBaseFilename = "CorridorKey_Suite_v${artifactTag}_Windows_${Flavor}_Setup"
}

if ([string]::IsNullOrWhiteSpace($OutputManifestPath) -and [string]::IsNullOrWhiteSpace($OutputIssPath)) {
    $OutputManifestPath = Join-Path $OutputDir "CorridorKey_Suite_v${artifactTag}_Windows_${Flavor}_manifest.json"
}

if ($RenderOnly) {
    $installerArtwork = $null
    if (-not [string]::IsNullOrWhiteSpace($OutputIssPath)) {
        $installerArtwork = Resolve-CorridorKeySuiteInstallerArtwork -OutputIssPath $OutputIssPath
    }
    if (-not [string]::IsNullOrWhiteSpace($OutputManifestPath)) {
        Write-CorridorKeySuiteManifest -SuiteManifest $suiteManifest -Path $OutputManifestPath
    }
    if (-not [string]::IsNullOrWhiteSpace($OutputIssPath)) {
        Write-CorridorKeySuiteIss `
            -SuiteManifest $suiteManifest `
            -Flavor $Flavor `
            -Path $OutputIssPath `
            -InstallerArtwork $installerArtwork
    }
    if (-not [string]::IsNullOrWhiteSpace($OutputManifestPath)) {
        Write-Host "[suite] Rendered suite installer manifest: $OutputManifestPath" -ForegroundColor Green
    }
    if (-not [string]::IsNullOrWhiteSpace($OutputIssPath)) {
        Write-Host "[suite] Rendered suite Inno script: $OutputIssPath" -ForegroundColor Green
    }
    exit 0
}

if ([string]::IsNullOrWhiteSpace($OutputManifestPath)) {
    $OutputManifestPath = Join-Path $OutputDir "CorridorKey_Suite_v${artifactTag}_Windows_${Flavor}_manifest.json"
}
if ([string]::IsNullOrWhiteSpace($OutputIssPath)) {
    $tempIssDir = Join-Path $env:TEMP ("corridorkey_suite_iss_" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tempIssDir -Force | Out-Null
    $OutputIssPath = Join-Path $tempIssDir "corridorkey_suite.iss"
}

if (-not [string]::IsNullOrWhiteSpace($SuitePayloadRoot) -and -not [string]::IsNullOrWhiteSpace($SuitePayloadOutputRoot)) {
    throw "Pass either -SuitePayloadRoot or -SuitePayloadOutputRoot, not both."
}
if (-not [string]::IsNullOrWhiteSpace($SuitePayloadOutputRoot)) {
    $SuitePayloadRoot = New-CorridorKeySuitePayloadRootFromPackages `
        -OutputRoot $SuitePayloadOutputRoot `
        -RuntimeRoot $RuntimePackageRoot `
        -OfxRoot $OfxPackageRoot `
        -AdobeRoot $AdobePackageRoot
    Write-Host "[suite] Staged suite payload: $SuitePayloadRoot" -ForegroundColor Green
}

$resolvedSuitePayloadRoot = Assert-CorridorKeySuitePayloadRoot `
    -Root $SuitePayloadRoot `
    -SuiteManifest $suiteManifest `
    -Flavor $Flavor
$resolvedModelPayloadDir = ""
if ($Flavor -eq "offline") {
    $resolvedModelPayloadDir = Assert-CorridorKeySuiteOfflinePayloadRoot -Root $ModelPayloadDir -SuiteManifest $suiteManifest
}
$iscc = Resolve-CorridorKeySuiteIsccPath -Override $ISCCPath
$resolvedOutputDir = [System.IO.Path]::GetFullPath($OutputDir)

if (-not (Test-Path -LiteralPath $resolvedOutputDir)) {
    New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null
}
$installerArtwork = Resolve-CorridorKeySuiteInstallerArtwork -OutputIssPath $OutputIssPath
Write-CorridorKeySuiteManifest -SuiteManifest $suiteManifest -Path $OutputManifestPath
$concreteIss = ConvertTo-CorridorKeyConcreteSuiteIss `
    -SuiteManifest $suiteManifest `
    -Flavor $Flavor `
    -ResolvedSuitePayloadRoot $resolvedSuitePayloadRoot `
    -ResolvedModelPayloadDir $resolvedModelPayloadDir `
    -ResolvedOutputDir $resolvedOutputDir `
    -ResolvedOutputBaseFilename $OutputBaseFilename `
    -InstallerArtwork $installerArtwork
$issParent = Split-Path -Parent $OutputIssPath
if (-not [string]::IsNullOrWhiteSpace($issParent)) {
    New-Item -ItemType Directory -Path $issParent -Force | Out-Null
}
Set-Content -LiteralPath $OutputIssPath -Value $concreteIss -Encoding UTF8

Write-Host "[suite] Flavor:        $Flavor" -ForegroundColor Cyan
Write-Host "[suite] Payload root:  $resolvedSuitePayloadRoot" -ForegroundColor Cyan
if ($Flavor -eq "offline") {
    Write-Host "[suite] Model payload: $resolvedModelPayloadDir" -ForegroundColor Cyan
}
Write-Host "[suite] Output:        $resolvedOutputDir\$OutputBaseFilename.exe" -ForegroundColor Cyan
Write-Host "[suite] ISCC:          $iscc" -ForegroundColor Cyan
Write-Host "[suite] Generated iss: $OutputIssPath" -ForegroundColor DarkGray

$global:LASTEXITCODE = 0
& $iscc /Q $OutputIssPath
$isccExitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { [int]$global:LASTEXITCODE }
if ($isccExitCode -ne 0) {
    throw "ISCC failed with exit code $isccExitCode. Inspect $OutputIssPath for diagnostics."
}

$producedInstaller = Join-Path $resolvedOutputDir ($OutputBaseFilename + ".exe")
if (-not (Test-Path -LiteralPath $producedInstaller)) {
    throw "ISCC reported success but installer not found at $producedInstaller"
}

$sha256 = (Get-FileHash -LiteralPath $producedInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "[suite] Installer ready: $producedInstaller" -ForegroundColor Green
Write-Host "[suite] SHA256:         $sha256" -ForegroundColor Green

if (-not [string]::IsNullOrWhiteSpace($OutputManifestPath)) {
    Write-Host "[suite] Suite installer scaffold manifest ready: $OutputManifestPath" -ForegroundColor Green
}
if (-not [string]::IsNullOrWhiteSpace($OutputIssPath)) {
    Write-Host "[suite] Suite installer Inno script ready: $OutputIssPath" -ForegroundColor Green
}

[ordered]@{
    flavor = $Flavor
    display_label = $DisplayVersionLabel
    installer_path = $producedInstaller
    suite_payload_root = $resolvedSuitePayloadRoot
    model_payload_root = $resolvedModelPayloadDir
    generated_iss = $OutputIssPath
    manifest_path = $OutputManifestPath
    sha256 = $sha256
} | ConvertTo-Json -Depth 4
