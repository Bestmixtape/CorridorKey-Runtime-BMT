@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d C:\hermes-files\corridorkey\CorridorKey-Runtime
if not exist scratch\overlay mkdir scratch\overlay
cl /nologo /EHsc /std:c++20 /DSERIES /DNDEBUG ^
  /Isrc /Isrc\plugins\ofx /Iinclude /Ivendor\openfx\include /Ithird_party\stb ^
  scratch\overlay_test.cpp src\plugins\ofx\ofx_status_overlay.cpp ^
  /Foscratch\overlay\ /Fescratch\overlay\overlay_test.exe
if errorlevel 1 exit /b 1
cd scratch\overlay
overlay_test.exe "C:\hermes-files\corridorkey\CorridorKey-Runtime\third_party\fonts"
