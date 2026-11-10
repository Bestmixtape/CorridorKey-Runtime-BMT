@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d C:\hermes-files\corridorkey\CorridorKey-Runtime
cl /nologo /EHsc /std:c++20 /Ithird_party\stb scratch\font_probe.cpp /Foscratch\overlay\ /Fescratch\overlay\font_probe.exe
scratch\overlay\font_probe.exe
