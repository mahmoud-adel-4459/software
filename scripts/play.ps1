# One command: local app + data on this PC. No license, no CA wizard, no Desktop copy.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path 'private\ca-cert.pem')) {
  Write-Host 'First time: creating local certificates (lab:setup)...'
  & npm.cmd run lab:setup
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ''
Write-Host 'Starting Military Affairs (play mode)...'
Write-Host 'Login file (after window opens): play-login.txt in this folder'
Write-Host 'Username: admin'
Write-Host ''
$env:MILITARY_AFFAIRS_PLAY = '1'
& npx.cmd electron . -- --play
exit $LASTEXITCODE
