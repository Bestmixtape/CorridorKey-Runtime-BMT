Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repoRoot "scripts\windows_runtime_helpers.ps1")

$doctorMissingOnly = [pscustomobject]@{
    windows_universal = [pscustomobject]@{
        execution_probes = @(
            [pscustomobject]@{
                model = "corridorkey_fp16_2048.onnx"
                model_found = $false
                error = "Model not found: corridorkey_fp16_2048.onnx"
                session_create_ok = $false
                frame_execute_ok = $false
            },
            [pscustomobject]@{
                model = "corridorkey_fp16_1536.onnx"
                model_found = $true
                error = ""
                session_create_ok = $true
                frame_execute_ok = $true
            }
        )
    }
}

if (-not (Test-CorridorKeyDoctorMissingModelProbeFailuresOnly `
        -Doctor $doctorMissingOnly `
        -MissingModels @("corridorkey_fp16_2048.onnx"))) {
    throw "Expected missing-model-only execution probe failures to be tolerated."
}

$doctorRealFailure = [pscustomobject]@{
    windows_universal = [pscustomobject]@{
        execution_probes = @(
            [pscustomobject]@{
                model = "corridorkey_fp16_1536.onnx"
                model_found = $true
                error = "Model output contains non-finite values"
                session_create_ok = $true
                frame_execute_ok = $false
            }
        )
    }
}

if (Test-CorridorKeyDoctorMissingModelProbeFailuresOnly `
        -Doctor $doctorRealFailure `
        -MissingModels @("corridorkey_fp16_2048.onnx")) {
    throw "Did not expect real execution failures to be tolerated as missing-model-only issues."
}

$doctorBundleMissingOnly = [pscustomobject]@{
    bundle = [pscustomobject]@{
        healthy = $false
        packaged_layout_detected = $true
        runtime_backend_bundle_ready = $true
        packaged_models = @(
            [pscustomobject]@{
                filename = "corridorkey_fp16_2048.onnx"
                found = $false
                usable = $false
                artifact_status = "missing"
                error = "Model not found"
            },
            [pscustomobject]@{
                filename = "corridorkey_fp16_1536.onnx"
                found = $true
                usable = $true
                artifact_status = "usable"
                error = ""
            }
        )
    }
}

if (-not (Test-CorridorKeyDoctorMissingModelBundleFailuresOnly `
        -Doctor $doctorBundleMissingOnly `
        -MissingModels @("corridorkey_fp16_2048.onnx"))) {
    throw "Expected missing-model-only bundle failures to be tolerated."
}

$doctorBundleInvalidPresent = [pscustomobject]@{
    bundle = [pscustomobject]@{
        healthy = $false
        packaged_layout_detected = $true
        runtime_backend_bundle_ready = $true
        packaged_models = @(
            [pscustomobject]@{
                filename = "corridorkey_fp16_1536.onnx"
                found = $true
                usable = $false
                artifact_status = "invalid"
                error = "Model output contains non-finite values"
            }
        )
    }
}

if (Test-CorridorKeyDoctorMissingModelBundleFailuresOnly `
        -Doctor $doctorBundleInvalidPresent `
        -MissingModels @("corridorkey_fp16_2048.onnx")) {
    throw "Did not expect invalid present bundle models to be tolerated as missing-model-only issues."
}

$doctorAdobeOnlineBlueRuntimePending = [pscustomobject]@{
    bundle = [pscustomobject]@{
        healthy = $false
        layout_kind = "windows_adobe"
        packaged_layout_detected = $true
        runtime_backend_bundle_ready = $true
        blue_runtime = [pscustomobject]@{
            required = $true
            ready = $false
            directory_found = $true
            corridorkey_torchtrt_dll_found = $true
            torchtrt_dll_found = $false
        }
        packaged_models = @(
            [pscustomobject]@{
                filename = "corridorkey_fp16_1024.onnx"
                found = $true
                usable = $true
                artifact_status = "usable"
                error = ""
            }
        )
    }
}

if (-not (Test-CorridorKeyDoctorAdobeOnlinePayloadFailuresOnly `
        -Doctor $doctorAdobeOnlineBlueRuntimePending `
        -MissingRuntimePacks @("blue-runtime"))) {
    throw "Expected Adobe online payload validation to tolerate a pending blue-runtime pack."
}

$doctorAdobeRealBackendFailure = [pscustomobject]@{
    bundle = [pscustomobject]@{
        healthy = $false
        layout_kind = "windows_adobe"
        packaged_layout_detected = $true
        runtime_backend_bundle_ready = $false
        blue_runtime = [pscustomobject]@{
            required = $true
            ready = $false
            directory_found = $true
            corridorkey_torchtrt_dll_found = $true
            torchtrt_dll_found = $false
        }
        packaged_models = @(
            [pscustomobject]@{
                filename = "corridorkey_fp16_1024.onnx"
                found = $true
                usable = $true
                artifact_status = "usable"
                error = ""
            }
        )
    }
}

if (Test-CorridorKeyDoctorAdobeOnlinePayloadFailuresOnly `
        -Doctor $doctorAdobeRealBackendFailure `
        -MissingRuntimePacks @("blue-runtime")) {
    throw "Did not expect Adobe online blue-runtime tolerance to hide a real backend bundle failure."
}

$adobeOnlineBlueRuntimeValidation = [pscustomobject]@{
    validation_passed = $true
    install = [pscustomobject]@{}
    effects = @(
        [pscustomobject]@{
            match_name = "com.corridorkey.effect"
            pipl_capabilities = @("PF_OutFlag2_SUPPORTS_SMART_RENDER")
        },
        [pscustomobject]@{
            match_name = "com.corridorkey.effect.blue"
            pipl_capabilities = @("PF_OutFlag2_SUPPORTS_SMART_RENDER")
        }
    )
    runtime = [pscustomobject]@{}
    models = [pscustomobject]@{
        missing_count = 0
    }
    doctor = [pscustomobject]@{
        succeeded = $true
        failure_tolerated = $true
        failure_reason = "Packaged runtime doctor reported failures only for the online blue-runtime pack."
    }
}

$adobeOnlineBlueRuntimeIssues = @(
    Get-CorridorKeyAdobePackageValidationIssues -Validation $adobeOnlineBlueRuntimeValidation
)
if ($adobeOnlineBlueRuntimeIssues.Count -gt 0) {
    throw "Expected Adobe package validation to accept online blue-runtime-only doctor tolerance. Issues: $($adobeOnlineBlueRuntimeIssues -join ' | ')"
}

$adobeUnexpectedToleratedValidation = [pscustomobject]@{
    validation_passed = $true
    install = [pscustomobject]@{}
    effects = @(
        [pscustomobject]@{
            match_name = "com.corridorkey.effect"
            pipl_capabilities = @("PF_OutFlag2_SUPPORTS_SMART_RENDER")
        },
        [pscustomobject]@{
            match_name = "com.corridorkey.effect.blue"
            pipl_capabilities = @("PF_OutFlag2_SUPPORTS_SMART_RENDER")
        }
    )
    runtime = [pscustomobject]@{}
    models = [pscustomobject]@{
        missing_count = 0
    }
    doctor = [pscustomobject]@{
        succeeded = $true
        failure_tolerated = $true
        failure_reason = "Some unrelated tolerated failure."
    }
}

$adobeUnexpectedToleratedIssues = @(
    Get-CorridorKeyAdobePackageValidationIssues -Validation $adobeUnexpectedToleratedValidation
)
if ($adobeUnexpectedToleratedIssues -notcontains "Adobe package doctor failure was tolerated without missing model state or online runtime-pack state.") {
    throw "Expected Adobe package validation to reject unrelated tolerated doctor failures."
}

Write-Host "[PASS] Windows doctor missing-model tolerance regression checks passed." -ForegroundColor Green
