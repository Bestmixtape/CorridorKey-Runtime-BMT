param(
    [string]$RuntimeRoot = "",
    [string]$DistributionManifestPath = "",
    [string]$ReportPath = "",
    [switch]$RunRuntimeCommands,
    [string]$RuntimeCommandPath = "",
    [ValidateRange(1, 3600)]
    [int]$RuntimeCommandTimeoutSeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($DistributionManifestPath)) {
    $DistributionManifestPath = Join-Path $PSScriptRoot "installer\distribution_manifest.json"
}
if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) {
    $RuntimeRoot = Join-Path $env:ProgramFiles "CorridorKey\Runtime"
}

function Get-CorridorKeySuiteDefaultReportPath {
    $basePath = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($basePath)) {
        $basePath = $env:TEMP
    }
    if ([string]::IsNullOrWhiteSpace($basePath)) {
        $basePath = [System.IO.Path]::GetTempPath()
    }

    return Join-Path $basePath "CorridorKey\Reports\suite_readiness.json"
}

function Read-CorridorKeySuiteIni {
    param([string]$Path)

    $sections = [ordered]@{}
    $currentSection = ""
    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith(";") -or $line.StartsWith("#")) {
            continue
        }
        if ($line.StartsWith("[") -and $line.EndsWith("]")) {
            $currentSection = $line.Substring(1, $line.Length - 2)
            if (-not $sections.Contains($currentSection)) {
                $sections[$currentSection] = [ordered]@{}
            }
            continue
        }
        $equalsIndex = $line.IndexOf("=")
        if ($equalsIndex -lt 1 -or [string]::IsNullOrWhiteSpace($currentSection)) {
            continue
        }
        $key = $line.Substring(0, $equalsIndex).Trim()
        $value = $line.Substring($equalsIndex + 1).Trim()
        $sections[$currentSection][$key] = $value
    }

    return $sections
}

function Test-CorridorKeySuiteSectionKey {
    param(
        [object]$Inventory,
        [string]$Section,
        [string]$Key
    )

    return $null -ne $Inventory -and
        $Inventory.Contains($Section) -and
        $Inventory[$Section].Contains($Key) -and
        -not [string]::IsNullOrWhiteSpace([string]$Inventory[$Section][$Key])
}

function Get-CorridorKeySuiteInventoryValue {
    param(
        [object]$Inventory,
        [string]$Section,
        [string]$Key,
        [string]$Fallback = ""
    )

    if (Test-CorridorKeySuiteSectionKey -Inventory $Inventory -Section $Section -Key $Key) {
        return [string]$Inventory[$Section][$Key]
    }
    return $Fallback
}

function New-CorridorKeySuiteCheck {
    param([bool]$Selected = $true)

    return [ordered]@{
        selected = $Selected
        healthy = $true
        issues = @()
        paths = @()
    }
}

function Add-CorridorKeySuiteIssue {
    param(
        [System.Collections.Generic.List[string]]$Issues,
        [object]$Check,
        [string]$Message
    )

    if (-not $Issues.Contains($Message)) {
        $Issues.Add($Message) | Out-Null
    }
    if ($null -ne $Check) {
        $Check["healthy"] = $false
        if ($Message -notin @($Check["issues"])) {
            $Check["issues"] = @($Check["issues"]) + $Message
        }
    }
}

function Add-CorridorKeySuitePath {
    param(
        [object]$Check,
        [string]$Path
    )

    if ($null -ne $Check) {
        $Check["paths"] = @($Check["paths"]) + $Path
    }
}

function Test-CorridorKeySuitePathInside {
    param(
        [string]$ChildPath,
        [string]$ParentPath
    )

    $parentFull = [System.IO.Path]::GetFullPath($ParentPath)
    if (-not $parentFull.EndsWith("\", [System.StringComparison]::Ordinal)) {
        $parentFull += "\"
    }
    $childFull = [System.IO.Path]::GetFullPath($ChildPath)
    return $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-CorridorKeySuiteRelativePath {
    param(
        [System.Collections.Generic.List[string]]$Issues,
        [object]$Check,
        [string]$Root,
        [string]$RelativePath,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "$Label is empty."
        return ""
    }

    $rawNormalized = ([string]$RelativePath).Replace("/", "\")
    if ([System.IO.Path]::IsPathRooted($rawNormalized)) {
        Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "$Label must be a relative path: $RelativePath"
        return ""
    }

    $normalized = $rawNormalized.TrimStart("\")
    $candidate = Join-Path $Root $normalized
    if (-not (Test-CorridorKeySuitePathInside -ChildPath $candidate -ParentPath $Root)) {
        Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "$Label escapes the expected root: $RelativePath"
        return ""
    }

    return [System.IO.Path]::GetFullPath($candidate)
}

function Test-CorridorKeySuitePath {
    param(
        [System.Collections.Generic.List[string]]$Issues,
        [object]$Check,
        [string]$Path,
        [string]$Label,
        [ValidateSet("Any", "File", "Directory")]
        [string]$Kind = "Any"
    )

    Add-CorridorKeySuitePath -Check $Check -Path $Path
    $exists = switch ($Kind) {
        "File" { Test-Path -LiteralPath $Path -PathType Leaf }
        "Directory" { Test-Path -LiteralPath $Path -PathType Container }
        default { Test-Path -LiteralPath $Path }
    }
    if (-not $exists) {
        Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "$Label not found: $Path"
        return $false
    }
    return $true
}

function Get-CorridorKeySuiteArchivePayloadFiles {
    param(
        [string]$PackRoot,
        [string[]]$SharedRuntimeFileNames = @()
    )

    return @(
        Get-ChildItem -LiteralPath $PackRoot -File -Recurse |
            Where-Object {
                $_.Name -notmatch '^\.cache\..+\.sha256$' -and
                $SharedRuntimeFileNames -notcontains $_.Name
            }
    )
}

function Get-CorridorKeySuiteComponentSelected {
    param(
        [object]$Inventory,
        [string]$Component
    )

    return Test-CorridorKeySuiteSectionKey -Inventory $Inventory -Section "components" -Key $Component
}

function ConvertTo-CorridorKeySuiteCommandArgument {
    param([string]$Value)

    if ($null -eq $Value -or $Value.Length -eq 0) {
        return '""'
    }
    if ($Value -notmatch '[\s"]') {
        return $Value
    }

    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.Append('"')
    $backslashCount = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') {
            $backslashCount += 1
            continue
        }
        if ($character -eq '"') {
            [void]$builder.Append(('\' * (($backslashCount * 2) + 1)))
            [void]$builder.Append('"')
            $backslashCount = 0
            continue
        }
        if ($backslashCount -gt 0) {
            [void]$builder.Append(('\' * $backslashCount))
            $backslashCount = 0
        }
        [void]$builder.Append($character)
    }
    if ($backslashCount -gt 0) {
        [void]$builder.Append(('\' * ($backslashCount * 2)))
    }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Stop-CorridorKeySuiteProcessTree {
    param([System.Diagnostics.Process]$Process)

    if ($null -eq $Process -or $Process.HasExited) {
        return
    }

    try {
        $processId = [string]$Process.Id
        & taskkill.exe /PID $processId /T /F > $null 2>&1
    } catch {
        try {
            $Process.Kill()
        } catch {
        }
    }
}

function Invoke-CorridorKeySuiteRuntimeCommand {
    param(
        [string]$CommandPath,
        [string]$Command,
        [int]$TimeoutSeconds
    )

    $filePath = $CommandPath
    $arguments = @($Command, "--json")
    if ($CommandPath.EndsWith(".ps1", [System.StringComparison]::OrdinalIgnoreCase)) {
        $filePath = "powershell.exe"
        $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $CommandPath, $Command, "--json")
    }

    $timedOut = $false
    $exitCode = $null
    $stdout = ""
    $stderr = ""
    $process = $null
    try {
        $previousProgressPreference = $ProgressPreference
        $ProgressPreference = "SilentlyContinue"
        try {
            $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
            $startInfo.FileName = $filePath
            $startInfo.Arguments = (($arguments | ForEach-Object {
                        ConvertTo-CorridorKeySuiteCommandArgument -Value ([string]$_)
                    }) -join " ")
            $startInfo.UseShellExecute = $false
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            $startInfo.CreateNoWindow = $true

            $process = [System.Diagnostics.Process]::new()
            $process.StartInfo = $startInfo
            $process.Start() | Out-Null
            $stdoutTask = $process.StandardOutput.ReadToEndAsync()
            $stderrTask = $process.StandardError.ReadToEndAsync()
            if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
                $timedOut = $true
                Stop-CorridorKeySuiteProcessTree -Process $process
                $process.WaitForExit(5000) | Out-Null
            }
            if ($stdoutTask.Wait(5000)) {
                $stdout = $stdoutTask.Result
            }
            if ($stderrTask.Wait(5000)) {
                $stderr = $stderrTask.Result
            }
            if (-not $timedOut) {
                $exitCode = [int]$process.ExitCode
            }
        } finally {
            $ProgressPreference = $previousProgressPreference
            if ($null -ne $process) {
                $process.Dispose()
            }
        }

        $jsonValid = $false
        $parsed = $null
        if (-not [string]::IsNullOrWhiteSpace($stdout)) {
            try {
                $parsed = $stdout | ConvertFrom-Json
                $jsonValid = $true
            } catch {
                $jsonValid = $false
            }
        }

        $doctorHealthy = $null
        if ($Command -eq "doctor" -and $jsonValid -and
            $parsed.PSObject.Properties.Match("summary").Count -gt 0 -and
            $null -ne $parsed.summary -and
            $parsed.summary.PSObject.Properties.Match("healthy").Count -gt 0) {
            $doctorHealthy = [bool]$parsed.summary.healthy
        }

        $succeeded = (-not $timedOut) -and $exitCode -eq 0 -and $jsonValid
        if ($Command -eq "doctor" -and $null -ne $doctorHealthy) {
            $succeeded = $succeeded -and $doctorHealthy
        }
        $stdoutText = if ($null -eq $stdout) { "" } else { ([string]$stdout).Trim() }
        $stderrText = if ($null -eq $stderr) { "" } else { ([string]$stderr).Trim() }

        return [ordered]@{
            command = $Command
            succeeded = $succeeded
            exit_code = $exitCode
            timed_out = $timedOut
            json_valid = $jsonValid
            doctor_healthy = $doctorHealthy
            stdout = $stdoutText
            stderr = $stderrText
        }
    } catch {
        return [ordered]@{
            command = $Command
            succeeded = $false
            exit_code = $exitCode
            timed_out = $timedOut
            json_valid = $false
            doctor_healthy = $null
            stdout = ([string]$stdout).Trim()
            stderr = ([string]$stderr + " " + $_.Exception.Message).Trim()
        }
    }
}

function Test-CorridorKeySuiteModelPack {
    param(
        [System.Collections.Generic.List[string]]$Issues,
        [object]$Check,
        [string]$ResourcesRoot,
        [object]$Pack,
        [string]$PackId
    )

    if ($PackId -notmatch '^[A-Za-z0-9._-]+$') {
        Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "Model pack id contains unsupported characters: $PackId"
        return
    }

    if ($Pack.PSObject.Properties.Match("dest_subdir").Count -eq 0) {
        Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "Model pack '$PackId' does not define dest_subdir."
        return
    }

    $packRoot = Resolve-CorridorKeySuiteRelativePath `
        -Issues $Issues `
        -Check $Check `
        -Root $ResourcesRoot `
        -RelativePath ([string]$Pack.dest_subdir) `
        -Label "Model pack '$PackId' destination"
    if ([string]::IsNullOrWhiteSpace($packRoot)) {
        return
    }
    $markerPath = Join-Path $packRoot (".cache." + $PackId + ".sha256")
    Test-CorridorKeySuitePath -Issues $Issues -Check $Check -Path $markerPath -Label "Model pack marker" -Kind File | Out-Null

    if ($Pack.PSObject.Properties.Match("files").Count -eq 0 -or $null -eq $Pack.files) {
        Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "Model pack '$PackId' does not define files."
        return
    }

    $isArchive = ($Pack.PSObject.Properties.Match("is_archive").Count -gt 0 -and [bool]$Pack.is_archive) -and
        ($Pack.PSObject.Properties.Match("extract").Count -gt 0 -and [bool]$Pack.extract)
    if ($isArchive) {
        if (Test-CorridorKeySuitePath -Issues $Issues -Check $Check -Path $packRoot -Label "Extracted model/runtime pack directory" -Kind Directory) {
            $payloadFiles = Get-CorridorKeySuiteArchivePayloadFiles `
                -PackRoot $packRoot `
                -SharedRuntimeFileNames @("corridorkey_torchtrt.dll")
            if ($Pack.PSObject.Properties.Match("installed_file_count").Count -gt 0 -and $null -ne $Pack.installed_file_count) {
                $expectedCount = [int]$Pack.installed_file_count
                $actualCount = $payloadFiles.Count
                if ($actualCount -ne $expectedCount) {
                    Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "Extracted model/runtime pack '$PackId' has $actualCount file(s), expected exactly $expectedCount."
                }
            }
            if ($Pack.PSObject.Properties.Match("installed_size_bytes").Count -gt 0 -and $null -ne $Pack.installed_size_bytes) {
                $expectedSizeBytes = [int64]$Pack.installed_size_bytes
                $actualSizeBytes = ($payloadFiles | Measure-Object -Property Length -Sum).Sum
                if ($null -eq $actualSizeBytes) {
                    $actualSizeBytes = 0
                }
                if ([int64]$actualSizeBytes -lt $expectedSizeBytes) {
                    Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "Extracted model/runtime pack '$PackId' has $actualSizeBytes installed byte(s), expected at least $expectedSizeBytes."
                }
            }
        }
        return
    }

    foreach ($file in @($Pack.files)) {
        if ($file.PSObject.Properties.Match("filename").Count -eq 0) {
            Add-CorridorKeySuiteIssue -Issues $Issues -Check $Check -Message "Model pack '$PackId' has a file entry without filename."
            continue
        }
        $filePath = Resolve-CorridorKeySuiteRelativePath `
            -Issues $Issues `
            -Check $Check `
            -Root $packRoot `
            -RelativePath ([string]$file.filename) `
            -Label "Model pack '$PackId' file"
        if ([string]::IsNullOrWhiteSpace($filePath)) {
            continue
        }
        Test-CorridorKeySuitePath -Issues $Issues -Check $Check -Path $filePath -Label "Model pack file" -Kind File | Out-Null
    }
}

$issues = [System.Collections.Generic.List[string]]::new()
$resolvedRuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
$resourcesRoot = Join-Path $resolvedRuntimeRoot "Contents\Resources"
$inventoryPath = Join-Path $resourcesRoot "suite_inventory.ini"
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
    $ReportPath = Get-CorridorKeySuiteDefaultReportPath
}

$inventory = $null
if (Test-Path -LiteralPath $inventoryPath -PathType Leaf) {
    $inventory = Read-CorridorKeySuiteIni -Path $inventoryPath
} else {
    Add-CorridorKeySuiteIssue -Issues $issues -Check $null -Message "Suite inventory not found: $inventoryPath"
}

$distribution = $null
$distributionIssues = [System.Collections.Generic.List[string]]::new()
if (Test-Path -LiteralPath $DistributionManifestPath -PathType Leaf) {
    try {
        $distribution = Get-Content -LiteralPath $DistributionManifestPath -Raw | ConvertFrom-Json
        if ($null -eq $distribution -or
            $distribution.PSObject.Properties.Match("packs").Count -eq 0 -or
            $null -eq $distribution.packs) {
            $distributionIssues.Add("Distribution manifest does not define packs: $DistributionManifestPath") | Out-Null
            $distribution = $null
        }
    } catch {
        $distributionIssues.Add("Distribution manifest is not valid JSON: $DistributionManifestPath") | Out-Null
        $distribution = $null
    }
} else {
    $distributionIssues.Add("Distribution manifest not found: $DistributionManifestPath") | Out-Null
}

$components = [ordered]@{}

$runtimeSelected = Get-CorridorKeySuiteComponentSelected -Inventory $inventory -Component "runtime-core"
$runtimeCheck = New-CorridorKeySuiteCheck -Selected $runtimeSelected
$components["runtime-core"] = $runtimeCheck
if (-not $runtimeSelected) {
    Add-CorridorKeySuiteIssue -Issues $issues -Check $runtimeCheck -Message "Suite inventory does not record the fixed runtime-core component."
}
$cliRoot = Get-CorridorKeySuiteInventoryValue -Inventory $inventory -Section "hosts" -Key "cli-runtime" -Fallback (Join-Path $resolvedRuntimeRoot "Contents\Win64")
$cliPath = Join-Path $cliRoot "corridorkey.exe"
Test-CorridorKeySuitePath -Issues $issues -Check $runtimeCheck -Path $cliPath -Label "CLI/runtime command" -Kind File | Out-Null
foreach ($runtimeFile in @(
        @{ Path = (Join-Path $cliRoot "ck-engine.exe"); Label = "Runtime engine binary" },
        @{ Path = (Join-Path $cliRoot "onnxruntime.dll"); Label = "ONNX Runtime DLL" },
        @{ Path = (Join-Path $cliRoot "corridorkey_host_plugin_runtime_server.exe"); Label = "Host plugin runtime server" },
        @{ Path = (Join-Path $resourcesRoot "model_inventory.json"); Label = "Runtime model inventory" },
        @{ Path = (Join-Path $resourcesRoot "torchtrt-runtime\bin\corridorkey_torchtrt.dll"); Label = "TorchTRT wrapper" }
    )) {
    Test-CorridorKeySuitePath `
        -Issues $issues `
        -Check $runtimeCheck `
        -Path ([string]$runtimeFile.Path) `
        -Label ([string]$runtimeFile.Label) `
        -Kind File | Out-Null
}

foreach ($entry in @(
        @{ Component = "gui"; Section = "hosts"; Key = "gui"; File = "CorridorKey.exe"; Kind = "File"; Label = "Suite GUI executable"; Sidecar = "corridorkey_runtime.ini" },
        @{ Component = "ofx-resolve-fusion"; Section = "hosts"; Key = "resolve-fusion"; File = "Contents\Win64\CorridorKey.ofx"; Kind = "File"; Label = "Resolve/Fusion OFX binary"; Sidecar = "Contents\Resources\corridorkey_runtime.ini" },
        @{ Component = "ofx-nuke"; Section = "hosts"; Key = "nuke"; File = "Contents\Win64\CorridorKey.ofx"; Kind = "File"; Label = "Nuke OFX binary"; Sidecar = "Contents\Resources\corridorkey_runtime.ini" },
        @{ Component = "adobe"; Section = "hosts"; Key = "adobe"; File = "Contents\Win64"; Kind = "Directory"; Label = "Adobe plugin binary directory"; Sidecar = "Contents\Resources\corridorkey_runtime.ini" }
    )) {
    $selected = Get-CorridorKeySuiteComponentSelected -Inventory $inventory -Component ([string]$entry.Component)
    $check = New-CorridorKeySuiteCheck -Selected $selected
    $components[[string]$entry.Component] = $check
    if (-not $selected) {
        continue
    }
    $root = Get-CorridorKeySuiteInventoryValue -Inventory $inventory -Section ([string]$entry.Section) -Key ([string]$entry.Key)
    if ([string]::IsNullOrWhiteSpace($root)) {
        Add-CorridorKeySuiteIssue -Issues $issues -Check $check -Message "Suite inventory is missing host path for component '$($entry.Component)'."
        continue
    }
    $targetPath = Join-Path $root ([string]$entry.File)
    if ([string]$entry.Component -eq "adobe") {
        if (Test-CorridorKeySuitePath -Issues $issues -Check $check -Path $targetPath -Label ([string]$entry.Label) -Kind Directory) {
            foreach ($pluginFileName in @("corridorkey_adobe_green.aex", "corridorkey_adobe_blue.aex")) {
                Test-CorridorKeySuitePath `
                    -Issues $issues `
                    -Check $check `
                    -Path (Join-Path $targetPath $pluginFileName) `
                    -Label "Adobe plugin binary" `
                    -Kind File | Out-Null
            }
        }
    } else {
        Test-CorridorKeySuitePath -Issues $issues -Check $check -Path $targetPath -Label ([string]$entry.Label) -Kind ([string]$entry.Kind) | Out-Null
    }
    $sidecarPath = Join-Path $root ([string]$entry.Sidecar)
    if (Test-CorridorKeySuitePath -Issues $issues -Check $check -Path $sidecarPath -Label "Runtime sidecar" -Kind File) {
        $sidecar = Read-CorridorKeySuiteIni -Path $sidecarPath
        $sidecarSharedRoot = Get-CorridorKeySuiteInventoryValue `
            -Inventory $sidecar `
            -Section "runtime" `
            -Key "shared_root"
        if ([string]::IsNullOrWhiteSpace($sidecarSharedRoot)) {
            Add-CorridorKeySuiteIssue -Issues $issues -Check $check -Message "Runtime sidecar does not define runtime.shared_root: $sidecarPath"
        } elseif (-not [string]::Equals(
                [System.IO.Path]::GetFullPath($sidecarSharedRoot),
                $resolvedRuntimeRoot,
                [System.StringComparison]::OrdinalIgnoreCase)) {
            Add-CorridorKeySuiteIssue -Issues $issues -Check $check -Message "Runtime sidecar points at '$sidecarSharedRoot' instead of '$resolvedRuntimeRoot': $sidecarPath"
        }
    }
}

foreach ($componentName in @("green", "blue")) {
    $selected = Get-CorridorKeySuiteComponentSelected -Inventory $inventory -Component $componentName
    $check = New-CorridorKeySuiteCheck -Selected $selected
    $components[$componentName] = $check
    if (-not $selected) {
        continue
    }

    if ($null -eq $distribution) {
        foreach ($distributionIssue in $distributionIssues) {
            Add-CorridorKeySuiteIssue -Issues $issues -Check $check -Message $distributionIssue
        }
        Add-CorridorKeySuiteIssue -Issues $issues -Check $check -Message "Distribution manifest is unavailable; cannot validate '$componentName' model packs."
        continue
    }

    $packIds = @()
    if ($null -ne $inventory -and $inventory.Contains("model_packs")) {
        foreach ($packEntry in $inventory["model_packs"].GetEnumerator()) {
            if ([string]$packEntry.Value -eq $componentName) {
                $packIds += [string]$packEntry.Key
            }
        }
    }
    if ($packIds.Count -eq 0) {
        Add-CorridorKeySuiteIssue -Issues $issues -Check $check -Message "Suite inventory records '$componentName' but no '$componentName' model packs."
        continue
    }

    foreach ($packId in $packIds) {
        $packMatches = @($distribution.packs.PSObject.Properties.Match($packId))
        if ($packMatches.Count -eq 0) {
            Add-CorridorKeySuiteIssue -Issues $issues -Check $check -Message "Suite inventory records model pack '$packId' but it is not present in the distribution manifest."
            continue
        }
        $pack = $packMatches[0].Value
        if ($pack.PSObject.Properties.Match("component").Count -eq 0 -or
            [string]$pack.component -ne $componentName) {
            Add-CorridorKeySuiteIssue -Issues $issues -Check $check -Message "Suite inventory records model pack '$packId' for '$componentName', but the distribution manifest assigns it differently."
            continue
        }
        Test-CorridorKeySuiteModelPack `
            -Issues $issues `
            -Check $check `
            -ResourcesRoot $resourcesRoot `
            -Pack $pack `
            -PackId $packId
    }
}

$runtimeCommands = [ordered]@{
    attempted = [bool]$RunRuntimeCommands
    command_path = ""
    commands = [ordered]@{}
}
if ($RunRuntimeCommands) {
    $commandPath = if ([string]::IsNullOrWhiteSpace($RuntimeCommandPath)) { $cliPath } else { $RuntimeCommandPath }
    $runtimeCommands["command_path"] = $commandPath
    if (-not (Test-Path -LiteralPath $commandPath -PathType Leaf)) {
        Add-CorridorKeySuiteIssue -Issues $issues -Check $runtimeCheck -Message "Runtime command smoke path not found: $commandPath"
    } else {
        foreach ($command in @("info", "doctor", "models", "presets")) {
            $result = Invoke-CorridorKeySuiteRuntimeCommand `
                -CommandPath $commandPath `
                -Command $command `
                -TimeoutSeconds $RuntimeCommandTimeoutSeconds
            $runtimeCommands["commands"][$command] = $result
            if (-not [bool]$result.succeeded) {
                Add-CorridorKeySuiteIssue -Issues $issues -Check $runtimeCheck -Message "Runtime command smoke failed for '$command'."
            }
        }
    }
}

$report = [ordered]@{
    validation_passed = $issues.Count -eq 0
    issues = @($issues)
    inventory_path = $inventoryPath
    distribution_manifest_path = [System.IO.Path]::GetFullPath($DistributionManifestPath)
    runtime_root = $resolvedRuntimeRoot
    components = $components
    runtime_commands = $runtimeCommands
}

$reportParent = Split-Path -Parent $ReportPath
if (-not [string]::IsNullOrWhiteSpace($reportParent)) {
    New-Item -ItemType Directory -Path $reportParent -Force | Out-Null
}
Set-Content -LiteralPath $ReportPath -Value ($report | ConvertTo-Json -Depth 12) -Encoding UTF8

if ($issues.Count -gt 0) {
    Write-Host "[suite-readiness] FAILED: $($issues.Count) issue(s). Report: $ReportPath" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "[suite-readiness] $issue" -ForegroundColor Red
    }
    exit 1
}

Write-Host "[suite-readiness] PASS: $ReportPath" -ForegroundColor Green
exit 0
