param(
    [string]$EngineRoot = 'C:\Program Files\Epic Games\UE_5.8',
    [string]$Destination = (Join-Path $PSScriptRoot '..\HearthsidePoker-Windows')
)
$ErrorActionPreference = 'Stop'
$projectPath = Join-Path $PSScriptRoot 'HearthsidePoker.uproject'
$archivePath = [System.IO.Path]::GetFullPath($Destination)
& (Join-Path $EngineRoot 'Engine\Build\BatchFiles\RunUAT.bat') BuildCookRun "-project=$projectPath" -noP4 -platform=Win64 -clientconfig=Development -build -cook -map=/Engine/Maps/Entry -stage -pak -archive -nodebuginfo "-archivedirectory=$archivePath" -unattended -utf8output
if ($LASTEXITCODE -ne 0) { throw "Unreal packaging failed with exit code $LASTEXITCODE" }
Write-Host "Packaged game: $archivePath"
