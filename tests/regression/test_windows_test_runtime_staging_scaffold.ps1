$ErrorActionPreference = "Stop"

$testsCmake = Join-Path $PSScriptRoot "..\CMakeLists.txt"
if (-not (Test-Path -LiteralPath $testsCmake)) {
    throw "tests CMakeLists.txt not found at '$testsCmake'."
}

$content = Get-Content -Raw -LiteralPath $testsCmake
$stageHelperPattern = '(?s)function\(corridorkey_stage_ort_runtime target_name\).*?add_custom_command\(TARGET \$\{target_name\} POST_BUILD.*?copy_if_different.*?USES_TERMINAL'
if ($content -notmatch $stageHelperPattern) {
    throw "corridorkey_stage_ort_runtime must serialize runtime DLL staging with USES_TERMINAL."
}

Write-Host "[PASS] Windows test runtime staging scaffold checks passed."
