@echo off
setlocal
set "UE_ROOT=C:\Program Files\Epic Games\UE_5.8"
if not exist "%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe" (
  echo Unreal Engine 5.8 was not found. Edit UE_ROOT in this file to your installation path.
  pause
  exit /b 1
)
start "Hearthside Poker" "%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe" "%~dp0HearthsidePoker.uproject" -game -windowed -ResX=1600 -ResY=900 -NoSplash
