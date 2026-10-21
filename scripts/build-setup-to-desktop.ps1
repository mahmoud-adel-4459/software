# Build NSIS installer + Lab demo folder on the user's Desktop.
param(
  [string]$BuildRoot = 'C:\MilitaryAffairsBuild'
)
$ErrorActionPreference = 'Stop'
$Source = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Desktop = [Environment]::GetFolderPath('Desktop')
$DesktopOut = Join-Path $Desktop 'MilitaryAffairs'

Write-Host "Source: $Source"
Write-Host "Desktop output: $DesktopOut"

Push-Location $Source
if (-not (Test-Path 'private\lab-devices.json')) {
  Write-Host 'lab:setup (first time)...'
  & npm.cmd run lab:setup
  if ($LASTEXITCODE -ne 0) { throw 'lab:setup failed' }
}
Pop-Location

$BuildSrc = $Source
if ($Source -match 'OneDrive') {
  Write-Host 'Copying project outside OneDrive for NSIS build...'
  $BuildSrc = Join-Path $BuildRoot 'military-affairs-src'
  New-Item -ItemType Directory -Path $BuildSrc -Force | Out-Null
  & robocopy $Source $BuildSrc /MIR /XD node_modules artifacts .git lab-user-data /NFL /NDL /NJH /NJS /nc /ns /np
  if ($LASTEXITCODE -ge 8) { throw 'robocopy failed' }
}

Push-Location $BuildSrc
if (-not (Test-Path 'node_modules')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
}

Write-Host 'Packaging Lab demo (Electron + sample data server)...'
& npm.cmd run pack:lab-desktop
if ($LASTEXITCODE -ne 0) { throw 'pack:lab-desktop failed' }

Write-Host 'Building Windows Setup (NSIS)...'
& npm.cmd run dist
$distOk = ($LASTEXITCODE -eq 0)
if (-not $distOk) { Write-Warning 'NSIS dist failed (common on OneDrive) — Demo folder still works.' }

Pop-Location

if (Test-Path $DesktopOut) { Remove-Item -Recurse -Force $DesktopOut }
New-Item -ItemType Directory -Path $DesktopOut -Force | Out-Null

$labPkg = Join-Path $BuildSrc 'artifacts\lab-desktop-package'
if (-not (Test-Path $labPkg)) { throw "Missing $labPkg" }
$demoDest = Join-Path $DesktopOut 'Demo-Lab'
New-Item -ItemType Directory -Path $demoDest -Force | Out-Null
Copy-Item -Path (Join-Path $labPkg '*') -Destination $demoDest -Recurse -Force

$setupExe = Get-ChildItem -Path (Join-Path $BuildSrc 'artifacts') -Filter '*Setup*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($setupExe) {
  Copy-Item $setupExe.FullName (Join-Path $DesktopOut 'Military-Affairs-Setup.exe')
}

@"
شؤون العسكريين — ملفات سطح المكتب
================================

1) تجربة كاملة مع بيانات (3 عسكريين):
   افتح المجلد Demo-Lab
   شغّل: تشغيل-التجربة.cmd
   الدخول: admin — كلمة المرور في بيانات-الدخول.txt

2) تثبيت التطبيق (يتصل بخادم إنتاج لاحقًا):
   شغّل Military-Affairs-Setup.exe إن وُجد
   ثم اضبط الخادم وCA حسب docs\DEPLOY-AR.md

Node.js 24+ مطلوب لتشغيل Demo-Lab.
"@ | Set-Content -Path (Join-Path $DesktopOut 'README-Desktop.txt') -Encoding UTF8

Write-Host ''
Write-Host "Done. Open: $DesktopOut"
