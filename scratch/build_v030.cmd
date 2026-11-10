@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d C:\hermes-files\corridorkey\CorridorKey-Runtime
echo === configure 0.3 ===
cmake -B build\release -DCORRIDORKEY_DISPLAY_VERSION_LABEL=0.3 || (echo BUILDFAIL configure & exit /b 1)
echo === build all ===
cmake --build build\release || (echo BUILDFAIL compile & exit /b 1)
echo BMTWIN_BUILDDONE_030
