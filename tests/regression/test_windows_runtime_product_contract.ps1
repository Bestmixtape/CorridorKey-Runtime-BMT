Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repoRoot "scripts\windows_runtime_helpers.ps1")

$expectedInstallable = @(
    "corridorkey_fp16_512.onnx",
    "corridorkey_fp16_1024.onnx",
    "corridorkey_fp16_1536.onnx",
    "corridorkey_fp16_2048.onnx",
    "corridorkey_dynamic_blue_fp16.ts"
)

$expectedPortableTargets = @(
    "corridorkey_fp16_512.onnx",
    "corridorkey_fp16_1024.onnx",
    "corridorkey_fp16_1536.onnx",
    "corridorkey_fp16_2048.onnx",
    "corridorkey_fp16_512_ctx.onnx",
    "corridorkey_fp16_1024_ctx.onnx",
    "corridorkey_fp16_1536_ctx.onnx",
    "corridorkey_fp16_2048_ctx.onnx"
)

function Assert-SequenceEqual {
    param(
        [string[]]$Actual,
        [string[]]$Expected,
        [string]$Label
    )

    $actualText = $Actual -join ","
    $expectedText = $Expected -join ","
    if ($actualText -ne $expectedText) {
        throw "$Label mismatch. Expected [$expectedText], got [$actualText]."
    }
}

function Assert-DoesNotContain {
    param(
        [string[]]$Values,
        [string]$Forbidden,
        [string]$Label
    )

    if ($Values -contains $Forbidden) {
        throw "$Label must not contain '$Forbidden'."
    }
}

$installable = @(Get-CorridorKeyWindowsRtxInstallableModelList)
Assert-SequenceEqual -Actual $installable -Expected $expectedInstallable -Label "Windows RTX installable model list"
Assert-DoesNotContain -Values $installable -Forbidden "corridorkey_fp16_768.onnx" -Label "Windows RTX installable model list"
foreach ($value in $installable) {
    if ($value -match '^corridorkey_fp32_') {
        throw "Windows RTX installable model list must not contain fp32 reference artifact '$value'."
    }
}

$portableTargets = @(Get-CorridorKeyPortableRuntimeTargetModels)
Assert-SequenceEqual -Actual $portableTargets -Expected $expectedPortableTargets -Label "Portable runtime target model list"
Assert-DoesNotContain -Values $portableTargets -Forbidden "corridorkey_dynamic_blue_fp16.ts" -Label "Portable runtime target model list"

$contextCompileTargets = @(Get-CorridorKeyTensorRtContextCompileModels -TargetModels $portableTargets)
Assert-SequenceEqual `
    -Actual $contextCompileTargets `
    -Expected @(
        "corridorkey_fp16_512.onnx",
        "corridorkey_fp16_1024.onnx",
        "corridorkey_fp16_1536.onnx",
        "corridorkey_fp16_2048.onnx"
    ) `
    -Label "TensorRT context compile model list"

$tempRoot = Join-Path $env:TEMP ("corridorkey_runtime_contract_test_" + [System.Guid]::NewGuid().ToString("N"))
$modelsDir = Join-Path $tempRoot "models"
try {
    New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $modelsDir "corridorkey_fp16_512.onnx"), "stub", [System.Text.Encoding]::ASCII)

    $inventory = Get-CorridorKeyModelInventory -ModelsDir $modelsDir -ExpectedModels $portableTargets
    Assert-SequenceEqual `
        -Actual @($inventory.missing_models) `
        -Expected @(
            "corridorkey_fp16_1024.onnx",
            "corridorkey_fp16_1536.onnx",
            "corridorkey_fp16_2048.onnx",
            "corridorkey_fp16_512_ctx.onnx",
            "corridorkey_fp16_1024_ctx.onnx",
            "corridorkey_fp16_1536_ctx.onnx",
            "corridorkey_fp16_2048_ctx.onnx"
        ) `
        -Label "Portable runtime partial model inventory"
} finally {
    Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[PASS] Windows runtime product contract regression checks passed." -ForegroundColor Green
