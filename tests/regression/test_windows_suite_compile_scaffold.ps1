Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$suitePackageScriptPath = Join-Path $repoRoot "scripts\package_suite_installer_windows.ps1"
$manifestPath = Join-Path $repoRoot "scripts\installer\distribution_manifest.json"

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

function Get-TextSha256 {
    param([string]$Content)

    $encoding = [System.Text.UTF8Encoding]::new($false)
    $bytes = $encoding.GetBytes($Content)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha256.Dispose()
    }
}

function Get-TextByteCount {
    param([string]$Content)

    $encoding = [System.Text.UTF8Encoding]::new($false)
    return $encoding.GetByteCount($Content)
}

function New-ExactTextFile {
    param(
        [string]$Path,
        [string]$Content
    )

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function New-TestDistributionManifest {
    param([string]$Path)

    $greenContent = "green-model-fixture"
    $blueContent = "blue-model-fixture"
    $archiveContent = "blue-runtime-archive-fixture"
    $runtimeFiles = @(
        [ordered]@{ filename = "torch_cuda.dll"; fixture_content = "runtime-cuda-fixture" },
        [ordered]@{ filename = "torchtrt.dll"; fixture_content = "runtime-trt-fixture" }
    )
    $runtimeSizeBytes = 0
    foreach ($file in $runtimeFiles) {
        $runtimeSizeBytes += Get-TextByteCount -Content $file.fixture_content
    }

    $manifest = [ordered]@{
        manifest_version = 1
        repo = "fixture/corridorkey"
        revision = "test"
        generated_by = "test_windows_suite_compile_scaffold.ps1"
        packs = [ordered]@{
            "green-models" = [ordered]@{
                label = "Green fixture pack"
                component = "green"
                dest_subdir = "models"
                files = @(
                    [ordered]@{
                        remote_path = "fixture/green_fixture.onnx"
                        filename = "green_fixture.onnx"
                        url = "https://example.invalid/green_fixture.onnx"
                        sha256 = Get-TextSha256 -Content $greenContent
                        size_bytes = Get-TextByteCount -Content $greenContent
                        status = "ready"
                        fixture_content = $greenContent
                    }
                )
            }
            "blue-models" = [ordered]@{
                label = "Blue fixture model pack"
                component = "blue"
                dest_subdir = "models"
                files = @(
                    [ordered]@{
                        remote_path = "fixture/blue_fixture.ts"
                        filename = "blue_fixture.ts"
                        url = "https://example.invalid/blue_fixture.ts"
                        sha256 = Get-TextSha256 -Content $blueContent
                        size_bytes = Get-TextByteCount -Content $blueContent
                        status = "ready"
                        fixture_content = $blueContent
                    }
                )
            }
            "blue-runtime" = [ordered]@{
                label = "Blue fixture runtime pack"
                component = "blue"
                dest_subdir = "torchtrt-runtime/bin"
                is_archive = $true
                extract = $true
                installed_size_bytes = $runtimeSizeBytes
                installed_file_count = $runtimeFiles.Count
                extracted_files = @($runtimeFiles)
                files = @(
                    [ordered]@{
                        remote_path = "fixture/corridorkey_blue_torchtrt_runtime.7z"
                        filename = "corridorkey_blue_torchtrt_runtime.7z"
                        url = "https://example.invalid/corridorkey_blue_torchtrt_runtime.7z"
                        sha256 = Get-TextSha256 -Content $archiveContent
                        size_bytes = Get-TextByteCount -Content $archiveContent
                        status = "ready"
                        fixture_content = $archiveContent
                    }
                )
            }
        }
    }

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $json = $manifest | ConvertTo-Json -Depth 16
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
    return $json | ConvertFrom-Json
}

function New-SuitePayloadRoot {
    param([string]$Root)

    foreach ($relativeDir in @(
        "runtime\win64",
        "runtime\resources",
        "gui",
        "ofx-resolve-fusion",
        "ofx-nuke",
        "adobe"
    )) {
        New-TextFile -Path (Join-Path $Root (Join-Path $relativeDir "payload.txt"))
    }
}

function New-RuntimeOnlySuitePayloadRoot {
    param([string]$Root)

    foreach ($relativeDir in @("runtime\win64", "runtime\resources")) {
        New-TextFile -Path (Join-Path $Root (Join-Path $relativeDir "payload.txt"))
    }
}

function New-FileBackedSuitePayloadRoot {
    param([string]$Root)

    New-TextFile -Path (Join-Path $Root "runtime\win64")
    New-TextFile -Path (Join-Path $Root "runtime\resources\payload.txt")
    foreach ($relativeDir in @(
        "gui",
        "ofx-resolve-fusion",
        "ofx-nuke",
        "adobe"
    )) {
        New-TextFile -Path (Join-Path $Root (Join-Path $relativeDir "payload.txt"))
    }
}

function New-OfflinePayloadRoot {
    param(
        [string]$Root,
        [object]$Manifest
    )

    foreach ($pack in $Manifest.packs.PSObject.Properties) {
        $destSubdir = ([string]$pack.Value.dest_subdir).Replace("/", "\")
        $isArchive = ($pack.Value.PSObject.Properties.Match("is_archive").Count -gt 0 -and $pack.Value.is_archive) -and
            ($pack.Value.PSObject.Properties.Match("extract").Count -gt 0 -and $pack.Value.extract)
        if ($isArchive) {
            foreach ($file in $pack.Value.extracted_files) {
                New-ExactTextFile `
                    -Path (Join-Path $Root (Join-Path $destSubdir $file.filename)) `
                    -Content $file.fixture_content
            }
            continue
        }
        foreach ($file in $pack.Value.files) {
            New-ExactTextFile `
                -Path (Join-Path $Root (Join-Path $destSubdir $file.filename)) `
                -Content $file.fixture_content
        }
    }
}

function New-RawArchiveOfflinePayloadRoot {
    param(
        [string]$Root,
        [object]$Manifest
    )

    foreach ($pack in $Manifest.packs.PSObject.Properties) {
        $destSubdir = ([string]$pack.Value.dest_subdir).Replace("/", "\")
        $isArchive = ($pack.Value.PSObject.Properties.Match("is_archive").Count -gt 0 -and $pack.Value.is_archive) -and
            ($pack.Value.PSObject.Properties.Match("extract").Count -gt 0 -and $pack.Value.extract)
        foreach ($file in $pack.Value.files) {
            New-ExactTextFile `
                -Path (Join-Path $Root (Join-Path $destSubdir $file.filename)) `
                -Content $file.fixture_content
        }
        if ($isArchive) {
            continue
        }
    }
}

function New-FakeIscc {
    param([string]$Path)

    $script = @'
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$issPath = @($args | Where-Object { $_ -like "*.iss" } | Select-Object -Last 1)
if ([string]::IsNullOrWhiteSpace($issPath)) {
    throw "fake ISCC expected an .iss path."
}

$content = Get-Content -Path $issPath -Raw
$outputDir = [regex]::Match($content, "(?m)^OutputDir=(.+)$").Groups[1].Value.Trim()
$outputBase = [regex]::Match($content, "(?m)^OutputBaseFilename=(.+)$").Groups[1].Value.Trim()
if ([string]::IsNullOrWhiteSpace($outputDir) -or [string]::IsNullOrWhiteSpace($outputBase)) {
    throw "fake ISCC expected OutputDir and OutputBaseFilename in the .iss."
}
foreach ($requiredToken in @(
    "WizardImageFile={#InstallerWizardImage}",
    "WizardImageFileDynamicDark={#InstallerWizardImage}",
    "SetupIconFile={#InstallerIcon}"
)) {
    if ($content -notmatch [regex]::Escape($requiredToken)) {
        throw "fake ISCC expected suite installer branding token: $requiredToken"
    }
}
foreach ($defineName in @("InstallerIcon", "InstallerWizardImage")) {
    $match = [regex]::Match($content, '(?m)^#define ' + [regex]::Escape($defineName) + ' "([^"\r\n]+)"\r?$')
    if (-not $match.Success) {
        throw "fake ISCC expected #define $defineName in the .iss."
    }
    $assetPath = $match.Groups[1].Value.Replace('""', '"')
    if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
        throw "fake ISCC expected $defineName asset to exist: $assetPath"
    }
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $outputDir ($outputBase + ".exe")) -Value "fake installer" -Encoding UTF8
'@
    New-TextFile -Path $Path -Content $script
}

function New-FailingIscc {
    param([string]$Path)

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, "@echo off`r`nexit /b 23`r`n", [System.Text.Encoding]::ASCII)
}

function New-NoOutputIscc {
    param([string]$Path)

    $script = @'
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$issPath = @($args | Where-Object { $_ -like "*.iss" } | Select-Object -Last 1)
if ([string]::IsNullOrWhiteSpace($issPath)) {
    throw "fake ISCC expected an .iss path."
}
'@
    New-TextFile -Path $Path -Content $script
}

function Invoke-SuitePackage {
    param([string[]]$Arguments)

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $suitePackageScriptPath @Arguments | Out-Host
    return $LASTEXITCODE
}

function Invoke-SuitePackageCapture {
    param(
        [string[]]$Arguments,
        [string]$StdoutPath,
        [string]$StderrPath
    )

    $processArguments = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $suitePackageScriptPath
    ) + $Arguments

    return Start-Process -FilePath "powershell.exe" `
        -ArgumentList $processArguments `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath
}

function Get-CapturedProcessOutput {
    param(
        [string]$StdoutPath,
        [string]$StderrPath
    )

    return @(
        Get-Content -Path $StdoutPath -Raw -ErrorAction SilentlyContinue
        Get-Content -Path $StderrPath -Raw -ErrorAction SilentlyContinue
    ) -join [Environment]::NewLine
}

function Assert-SuitePackageFails {
    param(
        [string[]]$Arguments,
        [string]$ExpectedMessage,
        [string]$Label
    )

    $stdoutPath = Join-Path $tempRoot ($Label + ".stdout.txt")
    $stderrPath = Join-Path $tempRoot ($Label + ".stderr.txt")
    $process = Invoke-SuitePackageCapture `
        -Arguments $Arguments `
        -StdoutPath $stdoutPath `
        -StderrPath $stderrPath
    if ($process.ExitCode -eq 0) {
        throw "Suite compile should have failed for $Label."
    }
    $output = Get-CapturedProcessOutput -StdoutPath $stdoutPath -StderrPath $stderrPath
    if ($output -notmatch [regex]::Escape($ExpectedMessage)) {
        throw "Suite compile failure for $Label should include '$ExpectedMessage'."
    }
}

function New-MissingShaDistributionManifest {
    param(
        [object]$Manifest,
        [string]$Path
    )

    $manifestJson = $Manifest | ConvertTo-Json -Depth 16
    $missingShaManifest = $manifestJson | ConvertFrom-Json
    $missingShaManifest.packs."green-models".files[0].PSObject.Properties.Remove("sha256")
    Set-Content -LiteralPath $Path -Value ($missingShaManifest | ConvertTo-Json -Depth 16) -Encoding UTF8
}

function New-AllExternalizedComponentDistributionManifest {
    param(
        [object]$Manifest,
        [string]$Path
    )

    $manifestJson = $Manifest | ConvertTo-Json -Depth 24
    $externalizedManifest = $manifestJson | ConvertFrom-Json
    $externalizedManifest | Add-Member -NotePropertyName "component_payloads" -NotePropertyValue ([ordered]@{
            "gui-app" = [ordered]@{
                label = "GUI fixture payload"
                component = "gui"
                dest_subdir = ""
                files = @(
                    [ordered]@{
                        filename = "gui_payload.zip"
                        url = "https://example.invalid/gui_payload.zip"
                        sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        size_bytes = 10
                        status = "ready"
                    }
                )
            }
            "resolve-fusion-plugin" = [ordered]@{
                label = "Resolve Fusion OFX fixture payload"
                component = "ofx-resolve-fusion"
                dest_subdir = "Contents/Win64"
                files = @(
                    [ordered]@{
                        filename = "resolve_payload.zip"
                        url = "https://example.invalid/resolve_payload.zip"
                        sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                        size_bytes = 20
                        status = "ready"
                    }
                )
            }
            "nuke-plugin" = [ordered]@{
                label = "Nuke OFX fixture payload"
                component = "ofx-nuke"
                files = @(
                    [ordered]@{
                        filename = "nuke_payload.zip"
                        url = "https://example.invalid/nuke_payload.zip"
                        sha256 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
                        size_bytes = 30
                        status = "ready"
                    }
                )
            }
            "adobe-plugin" = [ordered]@{
                label = "Adobe fixture payload"
                component = "adobe"
                dest_subdir = "Contents/Win64"
                files = @(
                    [ordered]@{
                        filename = "adobe_payload.zip"
                        url = "https://example.invalid/adobe_payload.zip"
                        sha256 = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                        size_bytes = 40
                        status = "ready"
                    }
                )
            }
        }) -Force
    Set-Content -LiteralPath $Path -Value ($externalizedManifest | ConvertTo-Json -Depth 24) -Encoding UTF8
    return $externalizedManifest
}

function New-MissingComponentPayloadSizeDistributionManifest {
    param(
        [object]$Manifest,
        [string]$Path
    )

    $manifestJson = $Manifest | ConvertTo-Json -Depth 24
    $missingSizeManifest = $manifestJson | ConvertFrom-Json
    $missingSizeManifest.component_payloads."gui-app".files[0].PSObject.Properties.Remove("size_bytes")
    Set-Content -LiteralPath $Path -Value ($missingSizeManifest | ConvertTo-Json -Depth 24) -Encoding UTF8
}

function New-InvalidPackIdDistributionManifest {
    param(
        [object]$Manifest,
        [string]$Path
    )

    $manifestJson = $Manifest | ConvertTo-Json -Depth 24
    $invalidManifest = $manifestJson | ConvertFrom-Json
    $invalidPack = $invalidManifest.packs."green-models"
    $invalidManifest.packs.PSObject.Properties.Remove("green-models")
    $invalidManifest.packs | Add-Member -NotePropertyName "green`"models" -NotePropertyValue $invalidPack -Force
    Set-Content -LiteralPath $Path -Value ($invalidManifest | ConvertTo-Json -Depth 24) -Encoding UTF8
}

function New-InvalidPackSubdirDistributionManifest {
    param(
        [object]$Manifest,
        [string]$Path
    )

    $manifestJson = $Manifest | ConvertTo-Json -Depth 24
    $invalidManifest = $manifestJson | ConvertFrom-Json
    $invalidManifest.packs."green-models".dest_subdir = "..\models"
    Set-Content -LiteralPath $Path -Value ($invalidManifest | ConvertTo-Json -Depth 24) -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $suitePackageScriptPath)) {
    throw "Expected suite package script not found: $suitePackageScriptPath"
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Expected distribution manifest not found: $manifestPath"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("corridorkey_suite_compile_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $fixtureManifestPath = Join-Path $tempRoot "distribution_manifest.json"
    $missingShaManifestPath = Join-Path $tempRoot "distribution_manifest_missing_sha.json"
    $externalizedManifestPath = Join-Path $tempRoot "distribution_manifest_externalized_components.json"
    $missingComponentSizeManifestPath = Join-Path $tempRoot "distribution_manifest_missing_component_size.json"
    $invalidPackIdManifestPath = Join-Path $tempRoot "distribution_manifest_invalid_pack_id.json"
    $invalidPackSubdirManifestPath = Join-Path $tempRoot "distribution_manifest_invalid_pack_subdir.json"
    $manifest = New-TestDistributionManifest -Path $fixtureManifestPath
    New-MissingShaDistributionManifest -Manifest $manifest -Path $missingShaManifestPath
    $externalizedManifest = New-AllExternalizedComponentDistributionManifest -Manifest $manifest -Path $externalizedManifestPath
    New-MissingComponentPayloadSizeDistributionManifest -Manifest $externalizedManifest -Path $missingComponentSizeManifestPath
    New-InvalidPackIdDistributionManifest -Manifest $manifest -Path $invalidPackIdManifestPath
    New-InvalidPackSubdirDistributionManifest -Manifest $manifest -Path $invalidPackSubdirManifestPath
    $suitePayloadRoot = Join-Path $tempRoot "suite_payload"
    $runtimeOnlySuitePayloadRoot = Join-Path $tempRoot "runtime_only_suite_payload"
    $fileBackedPayloadRoot = Join-Path $tempRoot "file_backed_suite_payload"
    $offlinePayloadRoot = Join-Path $tempRoot "offline_payload"
    $rawArchivePayloadRoot = Join-Path $tempRoot "raw_archive_payload"
    $corruptModelPayloadRoot = Join-Path $tempRoot "corrupt_model_payload"
    $outputRoot = Join-Path $tempRoot "out"
    $fakeIscc = Join-Path $tempRoot "fake_iscc.ps1"
    $failingIscc = Join-Path $tempRoot "failing_iscc.cmd"
    $noOutputIscc = Join-Path $tempRoot "no_output_iscc.ps1"
    New-SuitePayloadRoot -Root $suitePayloadRoot
    New-RuntimeOnlySuitePayloadRoot -Root $runtimeOnlySuitePayloadRoot
    New-FileBackedSuitePayloadRoot -Root $fileBackedPayloadRoot
    New-OfflinePayloadRoot -Root $offlinePayloadRoot -Manifest $manifest
    New-RawArchiveOfflinePayloadRoot -Root $rawArchivePayloadRoot -Manifest $manifest
    New-OfflinePayloadRoot -Root $corruptModelPayloadRoot -Manifest $manifest
    New-ExactTextFile `
        -Path (Join-Path $corruptModelPayloadRoot "models\green_fixture.onnx") `
        -Content "corrupt-green-model-fixture"
    New-FakeIscc -Path $fakeIscc
    New-FailingIscc -Path $failingIscc
    New-NoOutputIscc -Path $noOutputIscc

    $onlineManifest = Join-Path $tempRoot "online_manifest.json"
    $onlineIss = Join-Path $tempRoot "online.iss"
    $onlineBaseName = "CorridorKey_Suite_Test_online"
    $exitCode = Invoke-SuitePackage -Arguments @(
        "-Flavor", "online",
        "-Version", "0.9.0",
        "-DisplayVersionLabel", "0.9.0-win.0",
        "-DistributionManifestPath", $fixtureManifestPath,
        "-SuitePayloadRoot", $suitePayloadRoot,
        "-ISCCPath", $fakeIscc,
        "-OutputDir", $outputRoot,
        "-OutputBaseFilename", $onlineBaseName,
        "-OutputManifestPath", $onlineManifest,
        "-OutputIssPath", $onlineIss
    )
    if ($exitCode -ne 0) {
        throw "Online suite compile scaffold failed."
    }
    foreach ($expectedPath in @(
        (Join-Path $outputRoot ($onlineBaseName + ".exe")),
        $onlineManifest,
        $onlineIss
    )) {
        if (-not (Test-Path -LiteralPath $expectedPath)) {
            throw "Expected online suite compile artifact not found: $expectedPath"
        }
    }

    $onlineIssText = Get-Content -Path $onlineIss -Raw
    foreach ($requiredToken in @(
        ('#define SuitePayloadRoot "' + $suitePayloadRoot + '"'),
        ('OutputDir=' + $outputRoot),
        ('OutputBaseFilename=' + $onlineBaseName)
    )) {
        if ($onlineIssText -notmatch [regex]::Escape($requiredToken)) {
            throw "Compiled online .iss must contain '$requiredToken'."
        }
    }

    $offlineIss = Join-Path $tempRoot "offline.iss"
    $offlineBaseName = "CorridorKey_Suite_Test_offline"
    $exitCode = Invoke-SuitePackage -Arguments @(
        "-Flavor", "offline",
        "-Version", "0.9.0",
        "-DisplayVersionLabel", "0.9.0-win.0",
        "-DistributionManifestPath", $fixtureManifestPath,
        "-SuitePayloadRoot", $suitePayloadRoot,
        "-ModelPayloadDir", $offlinePayloadRoot,
        "-ISCCPath", $fakeIscc,
        "-OutputDir", $outputRoot,
        "-OutputBaseFilename", $offlineBaseName,
        "-OutputIssPath", $offlineIss
    )
    if ($exitCode -ne 0) {
        throw "Offline suite compile scaffold failed."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $outputRoot ($offlineBaseName + ".exe")))) {
        throw "Expected offline suite installer artifact was not produced."
    }
    $offlineIssText = Get-Content -Path $offlineIss -Raw
    if ($offlineIssText -notmatch [regex]::Escape('#define OfflinePayloadRoot "' + $offlinePayloadRoot + '"')) {
        throw "Compiled offline .iss must contain the concrete offline payload root."
    }

    $externalizedOnlineIss = Join-Path $tempRoot "externalized_online.iss"
    $externalizedOnlineBaseName = "CorridorKey_Suite_Test_externalized_online"
    $exitCode = Invoke-SuitePackage -Arguments @(
        "-Flavor", "online",
        "-Version", "0.9.0",
        "-DisplayVersionLabel", "0.9.0-win.0",
        "-DistributionManifestPath", $externalizedManifestPath,
        "-SuitePayloadRoot", $runtimeOnlySuitePayloadRoot,
        "-ISCCPath", $fakeIscc,
        "-OutputDir", $outputRoot,
        "-OutputBaseFilename", $externalizedOnlineBaseName,
        "-OutputIssPath", $externalizedOnlineIss
    )
    if ($exitCode -ne 0) {
        throw "Online suite compile with externalized optional payloads failed."
    }
    $externalizedOnlineIssText = Get-Content -Path $externalizedOnlineIss -Raw
    foreach ($embeddedOptionalPayload in @(
            "Source: `"{#SuitePayloadRoot}\gui\*`"",
            "Source: `"{#SuitePayloadRoot}\ofx-resolve-fusion\*`"",
            "Source: `"{#SuitePayloadRoot}\ofx-nuke\*`"",
            "Source: `"{#SuitePayloadRoot}\adobe\*`""
        )) {
        if ($externalizedOnlineIssText -match [regex]::Escape($embeddedOptionalPayload)) {
            throw "Externalized online .iss must not require embedded optional payload '$embeddedOptionalPayload'."
        }
    }
    foreach ($requiredToken in @(
            "Source: `"{#SuitePayloadRoot}\runtime\win64\*`"",
            "DownloadPage.Add('https://example.invalid/gui_payload.zip', 'gui_payload.zip'",
            "DestDir: `"{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle\Contents\Win64`"; Components: ofxresolvefusion"
        )) {
        if ($externalizedOnlineIssText -notmatch [regex]::Escape($requiredToken)) {
            throw "Externalized online .iss must contain '$requiredToken'."
        }
    }

    Assert-SuitePackageFails `
        -Label "raw_archive_payload" `
        -ExpectedMessage "Offline archive payload must be pre-extracted" `
        -Arguments @(
            "-Flavor",
            "offline",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $fixtureManifestPath,
            "-SuitePayloadRoot",
            $suitePayloadRoot,
            "-ModelPayloadDir",
            $rawArchivePayloadRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "raw_archive_payload"
        )

    Assert-SuitePackageFails `
        -Label "corrupt_model_payload" `
        -ExpectedMessage "Offline model payload SHA256 mismatch" `
        -Arguments @(
            "-Flavor",
            "offline",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $fixtureManifestPath,
            "-SuitePayloadRoot",
            $suitePayloadRoot,
            "-ModelPayloadDir",
            $corruptModelPayloadRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "corrupt_model_payload"
        )

    Assert-SuitePackageFails `
        -Label "missing_manifest_sha" `
        -ExpectedMessage "Distribution manifest file is missing SHA-256" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $missingShaManifestPath,
            "-SuitePayloadRoot",
            $suitePayloadRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "missing_manifest_sha"
        )

    Assert-SuitePackageFails `
        -Label "missing_component_payload_size" `
        -ExpectedMessage "Optional component payload file 'gui_payload.zip' is missing size_bytes" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $missingComponentSizeManifestPath,
            "-SuitePayloadRoot",
            $runtimeOnlySuitePayloadRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "missing_component_payload_size"
        )

    Assert-SuitePackageFails `
        -Label "invalid_pack_id" `
        -ExpectedMessage "Distribution manifest pack id must be a safe inventory key" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $invalidPackIdManifestPath,
            "-SuitePayloadRoot",
            $suitePayloadRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "invalid_pack_id"
        )

    Assert-SuitePackageFails `
        -Label "invalid_pack_subdir" `
        -ExpectedMessage "Distribution manifest pack 'green-models' dest_subdir must be a safe relative subdirectory" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $invalidPackSubdirManifestPath,
            "-SuitePayloadRoot",
            $suitePayloadRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "invalid_pack_subdir"
        )

    Assert-SuitePackageFails `
        -Label "file_backed_payload" `
        -ExpectedMessage "not a directory" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $fixtureManifestPath,
            "-SuitePayloadRoot",
            $fileBackedPayloadRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "file_backed_payload"
        )

    Assert-SuitePackageFails `
        -Label "iscc_nonzero" `
        -ExpectedMessage "ISCC failed with exit code 23" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $fixtureManifestPath,
            "-SuitePayloadRoot",
            $suitePayloadRoot,
            "-ISCCPath",
            $failingIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "iscc_nonzero"
        )

    Assert-SuitePackageFails `
        -Label "missing_installer" `
        -ExpectedMessage "ISCC reported success but installer not found" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $fixtureManifestPath,
            "-SuitePayloadRoot",
            $suitePayloadRoot,
            "-ISCCPath",
            $noOutputIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "missing_installer"
        )

    Assert-SuitePackageFails `
        -Label "missing_payload" `
        -ExpectedMessage "Suite payload root is required" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $fixtureManifestPath,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "missing_payload"
        )
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "[PASS] Windows suite compile scaffold checks passed." -ForegroundColor Green
