@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d C:\hermes-files\corridorkey\CorridorKey-Runtime
cl /nologo /EHsc /std:c++20 /Ithird_party\stb scratch\stb_probe.cpp /Foscratch\overlay\ /Fescratch\overlay\stb_probe.exe
scratch\overlay\stb_probe.exe
