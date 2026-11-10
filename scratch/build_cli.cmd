@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d C:\hermes-files\corridorkey\CorridorKey-Runtime
cmake --build build\release --target corridorkey_model_fetch corridorkey_ofx test_unit test_regression test_e2e 2>&1
if errorlevel 1 (echo CLIBUILD_FAIL & exit /b 1)
echo CLIBUILD_OK
