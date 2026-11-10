@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d C:\hermes-files\corridorkey\CorridorKey-Runtime
cmake --build build\release --target test_unit 2>&1
if errorlevel 1 (echo TESTBUILD_FAIL & exit /b 1)
echo TESTBUILD_OK
build\release\tests\unit\test_unit.exe 2>&1 | findstr /C:"test cases" /C:"assertions" /C:"FAILED"
