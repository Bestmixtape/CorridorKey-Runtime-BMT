@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (echo VCVARS_FAIL & exit /b 1)
cd /d C:\hermes-files\corridorkey\CorridorKey-Runtime
cmake -B build\release -DCORRIDORKEY_DISPLAY_VERSION_LABEL=0.2.0 || exit /b 1
cmake --build build\release --target corridorkey_ofx || exit /b 1
echo BUILD_OK
