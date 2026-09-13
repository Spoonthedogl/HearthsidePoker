@echo off
setlocal
set "UE_ROOT=C:\Program Files\Epic Games\UE_5.8"
start "Hearthside Poker Editor" "%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe" "%~dp0HearthsidePoker.uproject" -NoSplash
