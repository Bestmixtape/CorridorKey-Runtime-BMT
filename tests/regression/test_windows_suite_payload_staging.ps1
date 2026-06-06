Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$suitePackageScriptPath = Join-Path $repoRoot "scripts\package_suite_installer_windows.ps1"
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

function New-TestDistributionManifest {
    param([string]$Path)

    $greenContent = "green-model-fixture"
    $blueContent = "blue-model-fixture"
    $manifest = [ordered]@{
        manifest_version = 1
        repo = "fixture/corridorkey"
        revision = "test"
        generated_by = "test_windows_suite_payload_staging.ps1"
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
                    }
                )
            }
            "blue-models" = [ordered]@{
                label = "Blue fixture pack"
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
                    }
                )
            }
        }
    }

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Set-Content -LiteralPath $Path -Value ($manifest | ConvertTo-Json -Depth 12) -Encoding UTF8
}

function New-FakeRuntimePackageRoot {
    param([string]$Root)

    New-TextFile -Path (Join-Path $Root "ck-engine.exe") -Content "engine"
    New-TextFile -Path (Join-Path $Root "onnxruntime.dll") -Content "ort"
    New-TextFile -Path (Join-Path $Root "CorridorKey_Runtime.exe") -Content "gui"
    New-TextFile -Path (Join-Path $Root "ffmpeg.exe") -Content "ffmpeg"
    New-TextFile -Path (Join-Path $Root "torch_cuda.dll") -Content "blue runtime"
    New-TextFile -Path (Join-Path $Root "torchtrt.dll") -Content "blue runtime"
    New-TextFile -Path (Join-Path $Root "corridorkey_torchtrt.dll") -Content "blue wrapper"
    New-TextFile -Path (Join-Path $Root "model_inventory.json") -Content "{}"
    New-TextFile -Path (Join-Path $Root "README.txt") -Content "readme"
    New-TextFile -Path (Join-Path $Root "smoke_test.bat") -Content "smoke"
    New-TextFile -Path (Join-Path $Root "models\green_fixture.onnx") -Content "model"
    New-TextFile -Path (Join-Path $Root "outputs\scratch.tmp") -Content "scratch"
}

function New-FakeOfxPackageRoot {
    param([string]$Root)

    New-TextFile -Path (Join-Path $Root "CorridorKey.ofx.bundle\Contents\Win64\CorridorKey.ofx") -Content "ofx"
    New-TextFile -Path (Join-Path $Root "CorridorKey.ofx.bundle\Contents\Win64\onnxruntime.dll") -Content "host runtime duplicate"
    New-TextFile -Path (Join-Path $Root "CorridorKey.ofx.bundle\Contents\Win64\corridorkey.exe") -Content "host runtime cli duplicate"
    New-TextFile -Path (Join-Path $Root "CorridorKey.ofx.bundle\Contents\Win64\corridorkey_host_plugin_runtime_server.exe") -Content "host runtime server duplicate"
    New-TextFile -Path (Join-Path $Root "CorridorKey.ofx.bundle\Contents\Resources\models\green_fixture.onnx") -Content "host model duplicate"
    New-TextFile -Path (Join-Path $Root "CorridorKey.ofx.bundle\Contents\Resources\torchtrt-runtime\bin\corridorkey_torchtrt.dll") -Content "host torchtrt duplicate"
    New-TextFile -Path (Join-Path $Root "CorridorKey.ofx.bundle\Contents\Resources\manifest.json") -Content "{}"
    New-TextFile -Path (Join-Path $Root "CorridorKey.ofx.bundle\model_inventory.json") -Content "{}"
}

function New-FakeAdobePackageRoot {
    param([string]$Root)

    $mediaCoreRoot = Join-Path $Root "Adobe\Common\Plug-ins\7.0\MediaCore\CorridorKey"
    New-TextFile -Path (Join-Path $mediaCoreRoot "Contents\Win64\corridorkey_adobe_green.aex") -Content "adobe green"
    New-TextFile -Path (Join-Path $mediaCoreRoot "Contents\Win64\corridorkey_adobe_blue.aex") -Content "adobe blue"
    New-TextFile -Path (Join-Path $mediaCoreRoot "Contents\Win64\onnxruntime.dll") -Content "adobe runtime duplicate"
    New-TextFile -Path (Join-Path $mediaCoreRoot "Contents\Win64\corridorkey.exe") -Content "adobe runtime cli duplicate"
    New-TextFile -Path (Join-Path $mediaCoreRoot "Contents\Win64\corridorkey_host_plugin_runtime_server.exe") -Content "adobe runtime server duplicate"
    New-TextFile -Path (Join-Path $mediaCoreRoot "Contents\Resources\models\green_fixture.onnx") -Content "adobe model duplicate"
    New-TextFile -Path (Join-Path $mediaCoreRoot "Contents\Resources\torchtrt-runtime\bin\corridorkey_torchtrt.dll") -Content "adobe torchtrt duplicate"
    New-TextFile -Path (Join-Path $mediaCoreRoot "model_inventory.json") -Content "{}"
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

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $outputDir ($outputBase + ".exe")) -Value "fake installer" -Encoding UTF8
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

function Assert-PathExists {
    param(
        [string]$Path,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Expected $Label not found: $Path"
    }
}

function Assert-PathMissing {
    param(
        [string]$Path,
        [string]$Label
    )

    if (Test-Path -LiteralPath $Path) {
        throw "Unexpected $Label found: $Path"
    }
}

function Assert-FileContent {
    param(
        [string]$Path,
        [string]$Expected,
        [string]$Label
    )

    Assert-PathExists -Path $Path -Label $Label
    $actual = Get-Content -LiteralPath $Path -Raw
    if ($actual -notmatch [regex]::Escape($Expected)) {
        throw "$Label should contain '$Expected'."
    }
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
        throw "Suite package should have failed for $Label."
    }
    $output = @(
        Get-Content -Path $stdoutPath -Raw -ErrorAction SilentlyContinue
        Get-Content -Path $stderrPath -Raw -ErrorAction SilentlyContinue
    ) -join [Environment]::NewLine
    if ($output -notmatch [regex]::Escape($ExpectedMessage)) {
        throw "Suite package failure for $Label should include '$ExpectedMessage'. Actual output: $output"
    }
}

if (-not (Test-Path -LiteralPath $suitePackageScriptPath)) {
    throw "Expected suite package script not found: $suitePackageScriptPath"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("corridorkey_suite_stage_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $manifestPath = Join-Path $tempRoot "distribution_manifest.json"
    $runtimeRoot = Join-Path $tempRoot "runtime_package"
    $ofxRoot = Join-Path $tempRoot "ofx_package"
    $adobeRoot = Join-Path $tempRoot "adobe_package"
    $suitePayloadOutputRoot = Join-Path $tempRoot "suite_payload"
    $wrapperSuitePayloadOutputRoot = Join-Path $tempRoot "wrapper_suite_payload"
    $outputRoot = Join-Path $tempRoot "out"
    $wrapperOutputRoot = Join-Path $tempRoot "wrapper_out"
    $outputIssPath = Join-Path $tempRoot "suite.iss"
    $fakeIscc = Join-Path $tempRoot "fake_iscc.ps1"

    New-TestDistributionManifest -Path $manifestPath
    New-FakeRuntimePackageRoot -Root $runtimeRoot
    New-FakeOfxPackageRoot -Root $ofxRoot
    New-FakeAdobePackageRoot -Root $adobeRoot
    New-FakeIscc -Path $fakeIscc

    $exitCode = Invoke-SuitePackage -Arguments @(
        "-Flavor", "online",
        "-Version", "0.9.0",
        "-DisplayVersionLabel", "0.9.0-win.0",
        "-DistributionManifestPath", $manifestPath,
        "-SuitePayloadOutputRoot", $suitePayloadOutputRoot,
        "-RuntimePackageRoot", $runtimeRoot,
        "-OfxPackageRoot", $ofxRoot,
        "-AdobePackageRoot", $adobeRoot,
        "-ISCCPath", $fakeIscc,
        "-OutputDir", $outputRoot,
        "-OutputBaseFilename", "CorridorKey_Suite_Test_stage",
        "-OutputIssPath", $outputIssPath
    )
    if ($exitCode -ne 0) {
        throw "Suite package staging path failed."
    }

    Assert-PathExists -Path (Join-Path $outputRoot "CorridorKey_Suite_Test_stage.exe") -Label "compiled installer"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\ck-engine.exe") -Label "staged runtime engine"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\corridorkey.exe") -Label "staged runtime CLI alias"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\onnxruntime.dll") -Label "staged runtime dll"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\corridorkey_host_plugin_runtime_server.exe") -Label "staged shared runtime server"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\update_path.ps1") -Label "staged CLI PATH helper"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "runtime\resources\torchtrt-runtime\bin\corridorkey_torchtrt.dll") -Label "staged TorchTRT wrapper"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "gui\CorridorKey.exe") -Label "staged GUI exe"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "gui\ffmpeg.exe") -Label "staged GUI ffmpeg"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "ofx-resolve-fusion\Contents\Win64\CorridorKey.ofx") -Label "staged Resolve/Fusion OFX payload"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "ofx-nuke\Contents\Win64\CorridorKey.ofx") -Label "staged Nuke OFX payload"
    Assert-PathExists -Path (Join-Path $suitePayloadOutputRoot "adobe\Contents\Win64\corridorkey_adobe_green.aex") -Label "staged Adobe payload"

    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\CorridorKey_Runtime.exe") -Label "portable GUI executable in runtime payload"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\README.txt") -Label "portable readme"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\smoke_test.bat") -Label "portable smoke test"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\torch_cuda.dll") -Label "blue runtime root DLL in runtime core"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\torchtrt.dll") -Label "blue runtime root DLL in runtime core"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\corridorkey_torchtrt.dll") -Label "blue wrapper root DLL in runtime core"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\torchtrt-runtime\bin\corridorkey_torchtrt.dll") -Label "runtime TorchTRT wrapper under Win64 payload"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\models\green_fixture.onnx") -Label "runtime model duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\resources\model_inventory.json") -Label "portable runtime model inventory in suite payload"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "runtime\outputs\scratch.tmp") -Label "runtime output scratch"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "ofx-resolve-fusion\Contents\Win64\onnxruntime.dll") -Label "OFX runtime dll duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "ofx-resolve-fusion\Contents\Win64\corridorkey.exe") -Label "OFX runtime cli duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "ofx-resolve-fusion\Contents\Win64\corridorkey_host_plugin_runtime_server.exe") -Label "OFX runtime server duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "ofx-resolve-fusion\Contents\Resources\models\green_fixture.onnx") -Label "OFX model duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "ofx-resolve-fusion\model_inventory.json") -Label "OFX model inventory duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "adobe\Contents\Win64\onnxruntime.dll") -Label "Adobe runtime dll duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "adobe\Contents\Win64\corridorkey.exe") -Label "Adobe runtime cli duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "adobe\Contents\Win64\corridorkey_host_plugin_runtime_server.exe") -Label "Adobe runtime server duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "adobe\Contents\Resources\models\green_fixture.onnx") -Label "Adobe model duplicate"
    Assert-PathMissing -Path (Join-Path $suitePayloadOutputRoot "adobe\model_inventory.json") -Label "Adobe model inventory duplicate"

    Assert-FileContent `
        -Path (Join-Path $suitePayloadOutputRoot "gui\CorridorKey.exe") `
        -Expected "gui" `
        -Label "staged GUI executable"
    Assert-FileContent `
        -Path (Join-Path $suitePayloadOutputRoot "runtime\win64\update_path.ps1") `
        -Expected "SendMessageTimeout" `
        -Label "staged CLI PATH helper"
    Assert-FileContent `
        -Path $outputIssPath `
        -Expected ('#define SuitePayloadRoot "' + $suitePayloadOutputRoot + '"') `
        -Label "generated suite .iss"
    Assert-FileContent `
        -Path $outputIssPath `
        -Expected 'Source: "{#SuitePayloadRoot}\runtime\resources\*"; DestDir: "{#SharedRuntimeRoot}\Contents\Resources"; Components: runtimecore' `
        -Label "generated suite .iss"
    Assert-FileContent `
        -Path $outputIssPath `
        -Expected 'Filename: "{commoncf64}\OFX\Plugins\CorridorKey.ofx.bundle\Contents\Resources\corridorkey_runtime.ini"; Section: "runtime"; Key: "shared_root"; String: "{#SharedRuntimeRoot}"; Components: ofxresolvefusion' `
        -Label "generated suite .iss"

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $windowsWrapperPath `
        -Task package-suite `
        -Version "0.9.0" `
        -DisplayVersionLabel "0.9.0-win.0" `
        -SuitePayloadOutputRoot $wrapperSuitePayloadOutputRoot `
        -RuntimePackageRoot $runtimeRoot `
        -OfxPackageRoot $ofxRoot `
        -AdobePackageRoot $adobeRoot `
        -ISCCPath $fakeIscc `
        -SuitePackageDistributionManifestPath $manifestPath `
        -SuitePackageOutputDir $wrapperOutputRoot `
        -SuitePackageOutputBaseFilename "CorridorKey_Suite_Test_wrapper"
    if ($LASTEXITCODE -ne 0) {
        throw "Suite package staging through scripts/windows.ps1 failed."
    }
    Assert-PathExists -Path (Join-Path $wrapperOutputRoot "CorridorKey_Suite_Test_wrapper.exe") -Label "wrapper compiled installer"
    Assert-PathExists -Path (Join-Path $wrapperSuitePayloadOutputRoot "runtime\win64\ck-engine.exe") -Label "wrapper staged runtime engine"
    Assert-PathExists -Path (Join-Path $wrapperSuitePayloadOutputRoot "gui\CorridorKey.exe") -Label "wrapper staged GUI executable"
    Assert-PathExists -Path (Join-Path $wrapperSuitePayloadOutputRoot "gui\ffmpeg.exe") -Label "wrapper staged GUI ffmpeg"

    Assert-SuitePackageFails `
        -Label "conflict" `
        -ExpectedMessage "Pass either -SuitePayloadRoot or -SuitePayloadOutputRoot, not both." `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $manifestPath,
            "-SuitePayloadRoot",
            $suitePayloadOutputRoot,
            "-SuitePayloadOutputRoot",
            (Join-Path $tempRoot "other_suite_payload"),
            "-RuntimePackageRoot",
            $runtimeRoot,
            "-OfxPackageRoot",
            $ofxRoot,
            "-AdobePackageRoot",
            $adobeRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "conflict"
        )

    Assert-SuitePackageFails `
        -Label "missing_runtime" `
        -ExpectedMessage "Runtime package root is required when staging a suite payload." `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $manifestPath,
            "-SuitePayloadOutputRoot",
            (Join-Path $tempRoot "missing_runtime_suite_payload"),
            "-OfxPackageRoot",
            $ofxRoot,
            "-AdobePackageRoot",
            $adobeRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "missing_runtime"
        )

    $unsafeOutputRoot = Join-Path $runtimeRoot "nested_suite_payload"
    New-TextFile -Path (Join-Path $unsafeOutputRoot "sentinel.txt") -Content "keep"
    Assert-SuitePackageFails `
        -Label "unsafe_output_overlap" `
        -ExpectedMessage "Suite payload output root must not overlap component package roots" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $manifestPath,
            "-SuitePayloadOutputRoot",
            $unsafeOutputRoot,
            "-RuntimePackageRoot",
            $runtimeRoot,
            "-OfxPackageRoot",
            $ofxRoot,
            "-AdobePackageRoot",
            $adobeRoot,
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "unsafe_output_overlap"
        )
    Assert-FileContent `
        -Path (Join-Path $unsafeOutputRoot "sentinel.txt") `
        -Expected "keep" `
        -Label "unsafe output sentinel"

    Assert-SuitePackageFails `
        -Label "adobe_media_core_ancestor" `
        -ExpectedMessage "Adobe package root must be a package output or exact MediaCore CorridorKey payload" `
        -Arguments @(
            "-Flavor",
            "online",
            "-Version",
            "0.9.0",
            "-DisplayVersionLabel",
            "0.9.0-win.0",
            "-DistributionManifestPath",
            $manifestPath,
            "-SuitePayloadOutputRoot",
            (Join-Path $tempRoot "adobe_media_core_ancestor_suite_payload"),
            "-RuntimePackageRoot",
            $runtimeRoot,
            "-OfxPackageRoot",
            $ofxRoot,
            "-AdobePackageRoot",
            (Join-Path $adobeRoot "Adobe\Common\Plug-ins\7.0\MediaCore"),
            "-ISCCPath",
            $fakeIscc,
            "-OutputDir",
            $outputRoot,
            "-OutputBaseFilename",
            "adobe_media_core_ancestor"
        )
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "[PASS] Windows suite payload staging checks passed." -ForegroundColor Green
