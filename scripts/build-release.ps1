# Build portable (and optional NSIS) outside OneDrive-synced paths.
param(
  [string]$BuildRoot = 'C:\MilitaryAffairsBuild'
)
$ErrorActionPreference = 'Stop'
$Source = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if ($Source -match 'OneDrive') {
  Write-Warning 'Building from OneDrive may fail NSIS; copying to BuildRoot...'
}
$Dest = Join-Path $BuildRoot 'military-affairs-src'
if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest -Force | Out-Null }
robocopy $Source $Dest /MIR /XD node_modules artifacts .git /NFL /NDL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) { throw 'robocopy failed' }
Push-Location $Dest
npm.cmd ci
npm.cmd run pack:portable
try { npm.cmd run dist } catch { Write-Warning 'dist failed — use artifacts\desktop-portable from pack:portable' }
Pop-Location
Write-Host "Output under $Dest\artifacts"
