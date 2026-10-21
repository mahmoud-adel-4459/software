# Local demo: lab HTTPS server + Electron (printing/PDF). Keep server window open.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path 'private\lab-devices.json')) {
  if ($env:OPENSSL) { } elseif (Test-Path 'C:\laragon\bin\git\mingw64\bin\openssl.exe') {
    $env:OPENSSL = 'C:\laragon\bin\git\mingw64\bin\openssl.exe'
  }
  Write-Host 'Running lab:setup (first time)...'
  & npm.cmd run lab:setup
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$port = 8443
$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Host 'Starting lab server in a new window...'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'cd /d', "`"$Root`"", '&&', 'npm.cmd run lab:server' -WorkingDirectory $Root
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { break }
  }
  if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    Write-Error "Lab server did not start on port $port. Check the server window."
  }
} else {
  Write-Host "Lab server already listening on $port."
}

Write-Host ''
Write-Host 'Login: private\lab-login.txt'
Write-Host 'Starting Electron (lab mode)...'
$env:MILITARY_AFFAIRS_LAB = '1'
& npm.cmd run lab:start
exit $LASTEXITCODE
