param([string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8')
$ErrorActionPreference = 'Stop'
$projectPath = Join-Path $PSScriptRoot 'HearthsidePoker.uproject'
& (Join-Path $EngineRoot 'Engine\Build\BatchFiles\Build.bat') HearthsidePokerEditor Win64 Development $projectPath -WaitMutex
if ($LASTEXITCODE -ne 0) { throw "Unreal build failed with exit code $LASTEXITCODE" }
