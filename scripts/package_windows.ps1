param(
    [string]$Version = "",
    [string]$BuildDir = "",
    [string]$OrtRoot = "",
    [string]$ReleaseSuffix = "",
    [switch]$CompileContexts,
    [string]$FfmpegPath = "",
    [string]$ExpectedDisplayVersionLabel = "",
    [string]$ExpectedSourceRevision = "",
    [string[]]$ForbiddenPathPrefix = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows_runtime_helpers.ps1")

$Version = Initialize-CorridorKeyVersion -RepoRoot $repoRoot -Version $Version
if ([string]::IsNullOrWhiteSpace($BuildDir)) {
    $BuildDir = Join-Path $repoRoot "build\release"
}
$preferredTrack = Get-CorridorKeyWindowsTrackFromReleaseSuffix -ReleaseSuffix $ReleaseSuffix -DefaultTrack "rtx"
$OrtRoot = Resolve-CorridorKeyWindowsOrtRoot -RepoRoot $repoRoot -ExplicitRoot $OrtRoot -PreferredTrack $preferredTrack

$normalizedSuffix = ""
if (-not [string]::IsNullOrWhiteSpace($ReleaseSuffix)) {
    $normalizedSuffix = "_" + $ReleaseSuffix.Trim("_")
}
$releaseBasename = "CorridorKey_Runtime_v${Version}_Windows${normalizedSuffix}"
$distDir = Join-Path $repoRoot ("dist\" + $releaseBasename)
$zipPath = Join-Path $repoRoot ("dist\" + $releaseBasename + ".zip")
$engineSource = Join-Path $BuildDir "src\cli\corridorkey.exe"
$guiSource = Join-Path $repoRoot "src\gui\src-tauri\target\release\corridorkey-gui.exe"
$modelsSource = Join-Path $repoRoot "models"
$bundleModelsDir = Join-Path $distDir "models"
$bundleOutputsDir = Join-Path $distDir "outputs"
$modelInventoryPath = Join-Path $distDir "model_inventory.json"

function Assert-FileExists {
    param([string]$Path, [string]$Message)
    if (-not (Test-Path $Path)) {
        throw $Message
    }
}

function Test-CorridorKeyFfmpegExecutable {
    param([string]$CandidatePath)

    if ([string]::IsNullOrWhiteSpace($CandidatePath)) {
        throw "FFmpeg source path is empty."
    }
    $candidateItem = Get-Item -LiteralPath $CandidatePath -ErrorAction Stop
    if ($candidateItem.PSIsContainer) {
        throw "FFmpeg source must point to ffmpeg.exe, not a directory: $CandidatePath"
    }
    if ($candidateItem.Name -ne "ffmpeg.exe") {
        throw "FFmpeg source must be named ffmpeg.exe: $CandidatePath"
    }

    $versionOutput = & $candidateItem.FullName -version 2>&1
    $exitCode = if (Test-Path Variable:LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
    if ($exitCode -ne 0) {
        throw "FFmpeg source did not pass '-version': $($candidateItem.FullName)`n$versionOutput"
    }

    return $candidateItem.FullName
}

function Resolve-CorridorKeyFfmpegSource {
    param([string]$ExplicitPath)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        return Test-CorridorKeyFfmpegExecutable -CandidatePath $ExplicitPath
    }
    if (-not [string]::IsNullOrWhiteSpace($env:CORRIDORKEY_FFMPEG_PATH)) {
        return Test-CorridorKeyFfmpegExecutable -CandidatePath $env:CORRIDORKEY_FFMPEG_PATH
    }

    throw "ffmpeg.exe is required for GUI result previews. Pass -FfmpegPath or set CORRIDORKEY_FFMPEG_PATH to the reviewed ffmpeg.exe."
}

function Copy-DllsFromDir {
    param(
        [string]$SourceDir,
        [string]$DestinationDir,
        [string[]]$ExcludeNames = @()
    )
    if (Test-Path $SourceDir) {
        Get-ChildItem -Path $SourceDir -Filter "*.dll" -File |
            Where-Object { $ExcludeNames -notcontains $_.Name } |
            ForEach-Object {
                Copy-Item $_.FullName $DestinationDir -Force
            }
    }
}

function Copy-CudaNppRuntimeDlls {
    param([string]$DestinationDir)

    $cudaContract = Get-CorridorKeyWindowsRtxBuildContract
    $cudaVersion = $cudaContract.required_cuda_version
    $cudaVersionEnvVar = "CUDA_PATH_V" + ($cudaVersion -replace '\.', '_')
    $candidateRoots = @(
        [System.Environment]::GetEnvironmentVariable($cudaVersionEnvVar),
        "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v$cudaVersion",
        $env:CUDA_PATH
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

    $nppDllNames = @(
        "nppc64_12.dll",
        "nppial64_12.dll",
        "nppidei64_12.dll",
        "nppif64_12.dll",
        "nppig64_12.dll"
    )

    foreach ($candidateRoot in $candidateRoots) {
        $cudaBin = Join-Path $candidateRoot "bin"
        if (-not (Test-Path -LiteralPath $cudaBin -PathType Container)) {
            continue
        }

        $missingNames = @(
            $nppDllNames | Where-Object { -not (Test-Path -LiteralPath (Join-Path $cudaBin $_) -PathType Leaf) }
        )
        if ($missingNames.Count -gt 0) {
            continue
        }

        foreach ($nppName in $nppDllNames) {
            Copy-Item -LiteralPath (Join-Path $cudaBin $nppName) -Destination $DestinationDir -Force
        }
        Write-Host "[PASS] Copied CUDA NPP DLLs: $($nppDllNames -join ', ')" -ForegroundColor Green
        return
    }

    throw "Required CUDA NPP DLLs not found for CUDA $cudaVersion. Install the CUDA Toolkit to the default path or set $cudaVersionEnvVar."
}

function Get-CorridorKeyPackagedEngineDisplayLabel {
    param([string]$EnginePath)

    $versionLines = & $EnginePath --version 2>&1
    $exitCode = if (Test-Path Variable:LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
    $versionText = ($versionLines | Out-String).Trim()
    if ($exitCode -ne 0 -or [string]::IsNullOrWhiteSpace($versionText)) {
        throw "Packaged runtime version probe failed at $EnginePath."
    }

    $versionMatch = [regex]::Match($versionText, '^CorridorKey Runtime v(?<label>\S+)$')
    if (-not $versionMatch.Success) {
        throw "Packaged runtime version output has unexpected format: $versionText"
    }

    return $versionMatch.Groups["label"].Value
}

function Assert-CorridorKeyPackagedEngineIdentity {
    param(
        [string]$EnginePath,
        [string]$ExpectedDisplayVersionLabel,
        [string]$ExpectedSourceRevision
    )

    $displayLabel = Get-CorridorKeyPackagedEngineDisplayLabel -EnginePath $EnginePath
    if (-not [string]::IsNullOrWhiteSpace($ExpectedDisplayVersionLabel) -and
        $displayLabel -ne $ExpectedDisplayVersionLabel) {
        throw "Packaged runtime display label mismatch. Expected $ExpectedDisplayVersionLabel, got $displayLabel. Rebuild with the same -DisplayVersionLabel before packaging."
    }

    if (-not [string]::IsNullOrWhiteSpace($ExpectedSourceRevision)) {
        $normalizedRevision = $ExpectedSourceRevision.Trim()
        if ($normalizedRevision.StartsWith("g", [System.StringComparison]::OrdinalIgnoreCase)) {
            $normalizedRevision = $normalizedRevision.Substring(1)
        }

        $revisionPattern = "(^|-)g$([regex]::Escape($normalizedRevision))($|-)"
        if ($displayLabel -notmatch $revisionPattern) {
            throw "Packaged runtime source revision mismatch. Expected source revision $normalizedRevision, got display label $displayLabel. Rebuild from the current commit before packaging."
        }
    }

    Write-Host "[PASS] Packaged runtime display label: $displayLabel" -ForegroundColor Green
}

function Assert-NoForbiddenPathPrefix {
    param([string[]]$Prefixes, [string]$BundleRoot)

    $normalized = @(
        $Prefixes | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            ForEach-Object { [System.IO.Path]::GetFullPath($_) } | Select-Object -Unique
    )
    if ($normalized.Count -eq 0) {
        return
    }

    $items = Get-ChildItem -Path $BundleRoot -Recurse -Force
    foreach ($item in $items) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            $target = (Get-Item $item.FullName -Force).Target
            if (-not $target) {
                continue
            }
            $targetPath = [System.IO.Path]::GetFullPath($target)
            foreach ($prefix in $normalized) {
                if ($targetPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                    throw "Bundle contains a link to forbidden path: $targetPath"
                }
            }
        }
    }
}

Write-Host "[1/6] Cleaning and creating bundle layout..."
if (Test-Path $distDir) {
    Remove-Item $distDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $bundleModelsDir -Force | Out-Null
New-Item -ItemType Directory -Path $bundleOutputsDir -Force | Out-Null

Write-Host "[2/6] Copying ck-engine.exe..."
Assert-FileExists -Path $engineSource -Message "ck-engine source not found at $engineSource"
$packagedEnginePath = Join-Path $distDir "ck-engine.exe"
Copy-Item $engineSource $packagedEnginePath -Force

Write-Host "[3/6] Copying runtime DLLs..."
$forbiddenRootDlls = @(Get-CorridorKeyPortableRuntimeForbiddenRootDlls)
Copy-DllsFromDir -SourceDir (Join-Path $BuildDir "src\cli") -DestinationDir $distDir -ExcludeNames $forbiddenRootDlls
Copy-DllsFromDir -SourceDir (Join-Path $OrtRoot "lib") -DestinationDir $distDir
Copy-DllsFromDir -SourceDir (Join-Path $OrtRoot "bin") -DestinationDir $distDir
Copy-CudaNppRuntimeDlls -DestinationDir $distDir
Assert-CorridorKeyPackagedEngineIdentity `
    -EnginePath $packagedEnginePath `
    -ExpectedDisplayVersionLabel $ExpectedDisplayVersionLabel `
    -ExpectedSourceRevision $ExpectedSourceRevision

Write-Host "[4/6] Copying GUI..."
Assert-FileExists -Path $guiSource -Message "GUI binary not found at $guiSource"
Copy-Item $guiSource (Join-Path $distDir "CorridorKey_Runtime.exe") -Force

Write-Host "[4.5/6] Copying preview ffmpeg..."
$ffmpegSource = Resolve-CorridorKeyFfmpegSource -ExplicitPath $FfmpegPath
Copy-Item -LiteralPath $ffmpegSource -Destination (Join-Path $distDir "ffmpeg.exe") -Force

Write-Host "[5/6] Copying models..."
$targetModels = Get-CorridorKeyPortableRuntimeTargetModels
$sourceModelInventory = Get-CorridorKeyModelInventory -ModelsDir $modelsSource -ExpectedModels $targetModels
foreach ($model in $sourceModelInventory.present_models) {
    $sourcePath = Join-Path $modelsSource $model
    Copy-Item $sourcePath $bundleModelsDir -Force
}

if ($CompileContexts.IsPresent) {
    Write-Host "[5.5/6] Compiling TensorRT contexts..."
    $modelsToCompile = @(Get-CorridorKeyTensorRtContextCompileModels -TargetModels $targetModels)
    foreach ($model in $modelsToCompile) {
        $modelPath = Join-Path $bundleModelsDir $model
        if (-not (Test-Path $modelPath)) {
            continue
        }

        $compiledContextName = ([System.IO.Path]::GetFileNameWithoutExtension($model)) + "_ctx.onnx"
        $compiledContextPath = Join-Path $bundleModelsDir $compiledContextName
        if (Test-Path $compiledContextPath) {
            continue
        }

        & (Join-Path $distDir "ck-engine.exe") compile-context --model $modelPath --device tensorrt
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to compile TensorRT context for $model"
        }
    }
}

$modelInventory = Get-CorridorKeyModelInventory -ModelsDir $bundleModelsDir -ExpectedModels $targetModels
$expectedCompiledContextModels = @(
    Get-CorridorKeyExpectedCompiledContextModels `
        -PresentModels $targetModels `
        -ModelProfile "windows-rtx"
)
$compiledContextModels = @(
    $modelInventory.present_models |
        Where-Object { $expectedCompiledContextModels -contains $_ }
)
$missingCompiledContextModels = @(
    $expectedCompiledContextModels |
        Where-Object { $compiledContextModels -notcontains $_ }
)
$profileContract = Get-CorridorKeyModelProfileContract -ModelProfile "windows-rtx"

$inventoryPayload = [ordered]@{
    package_type = "runtime_bundle"
    model_profile = $profileContract.model_profile
    bundle_track = $profileContract.bundle_track
    release_label = $profileContract.release_label
    optimization_profile_id = $profileContract.optimization_profile_id
    optimization_profile_label = $profileContract.optimization_profile_label
    backend_intent = $profileContract.backend_intent
    fallback_policy = $profileContract.fallback_policy
    warmup_policy = $profileContract.warmup_policy
    certification_tier = $profileContract.certification_tier
    unrestricted_quality_attempt = $profileContract.unrestricted_quality_attempt
    models_dir = [System.IO.Path]::GetFullPath($bundleModelsDir)
    expected_models = @($modelInventory.expected_models)
    present_models = @($modelInventory.present_models)
    missing_models = @($modelInventory.missing_models)
    present_count = $modelInventory.present_count
    missing_count = $modelInventory.missing_count
    compiled_context_models = @($compiledContextModels)
    expected_compiled_context_models = @($expectedCompiledContextModels)
    missing_compiled_context_models = @($missingCompiledContextModels)
    compiled_context_complete = @($missingCompiledContextModels).Count -eq 0
}
Write-CorridorKeyJsonFile -Path $modelInventoryPath -Payload $inventoryPayload

if ($modelInventory.missing_count -gt 0) {
    Write-Host "[INFO] Packaging runtime bundle with partial model coverage: $($modelInventory.missing_models -join ', ')" -ForegroundColor Cyan
    Write-Host "[INFO] Wrote model inventory: $modelInventoryPath" -ForegroundColor Cyan
} else {
    Write-Host "[PASS] All targeted runtime models were packaged." -ForegroundColor Green
}

Write-Host "[6/6] Writing README and smoke test..."
$readmePath = Join-Path $distDir "README.txt"
$smokePath = Join-Path $distDir "smoke_test.bat"

@"
CorridorKey Runtime v$Version - Windows Portable Release
=======================================================

Quick start:
1. Open PowerShell or Command Prompt in this folder.
2. Run: .\ck-engine.exe doctor
3. Run: .\smoke_test.bat
4. Process a video:
   .\ck-engine.exe process input.mp4 output.mov

Notes:
- Lossless output is the default. Use --video-encode balanced for lossy output.
- ffmpeg.exe is packaged for GUI result preview proxies.
- The models folder must remain next to ck-engine.exe.
- model_inventory.json records any packaged models that are absent from this bundle.
"@ | Set-Content -Path $readmePath -Encoding ASCII

@'
@echo off
setlocal
cd /d "%~dp0"

ck-engine.exe info
if errorlevel 1 exit /b 1

ck-engine.exe doctor --json > doctor_report.json
if errorlevel 1 exit /b 1

powershell -NoProfile -Command "$report = Get-Content -Raw '.\\doctor_report.json' | ConvertFrom-Json; $inventory = if (Test-Path '.\\model_inventory.json') { Get-Content -Raw '.\\model_inventory.json' | ConvertFrom-Json } else { $null }; if ($null -ne $inventory -and $inventory.missing_count -gt 0) { Write-Host ('Portable runtime bundle uses partial model coverage: ' + ($inventory.missing_models -join ', ')); exit 0 }; if (-not $report.summary.video_healthy) { Write-Error 'Video output is not healthy.'; exit 1 }"
if errorlevel 1 exit /b 1

exit /b 0
'@ | Set-Content -Path $smokePath -Encoding ASCII

Assert-NoForbiddenPathPrefix -Prefixes $ForbiddenPathPrefix -BundleRoot $distDir

Write-Host "[6.5/6] Creating ZIP archive..."
Compress-Archive -Path $distDir -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Bundle ready at: $distDir"
Write-Host "Archive ready at: $zipPath"
