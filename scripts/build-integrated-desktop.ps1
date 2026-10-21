# Integrated desktop: NSIS installer with embedded local server (PGlite) — no separate Node server for daily use.
param(
  [string]$BuildRoot = 'C:\MilitaryAffairsBuild'
)
$ErrorActionPreference = 'Stop'
$Source = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Desktop = [Environment]::GetFolderPath('Desktop')
$DesktopOut = Join-Path $Desktop 'MilitaryAffairs-Integrated'

Write-Host 'Integrated desktop build — Military Affairs'
Write-Host "Source: $Source"

Push-Location $Source
if (-not (Test-Path 'private\ca-cert.pem')) {
  Write-Host 'First-time: npm run lab:setup (TLS certificates)...'
  & npm.cmd run lab:setup
  if ($LASTEXITCODE -ne 0) { throw 'lab:setup failed' }
}
Pop-Location

$BuildSrc = $Source
if ($Source -match 'OneDrive') {
  Write-Host 'Copying outside OneDrive for NSIS (robocopy)...'
  $BuildSrc = Join-Path $BuildRoot 'military-affairs-src'
  New-Item -ItemType Directory -Path $BuildSrc -Force | Out-Null
  & robocopy $Source $BuildSrc /MIR /XD node_modules artifacts .git lab-user-data play-user-data /NFL /NDL /NJH /NJS /nc /ns /np
  if ($LASTEXITCODE -ge 8) { throw 'robocopy failed' }
}

Push-Location $BuildSrc
if (-not (Test-Path 'node_modules')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
}
Write-Host 'Running tests...'
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'npm test failed' }

Write-Host 'Building NSIS installer (embedded play mode by default)...'
& npm.cmd run dist
if ($LASTEXITCODE -ne 0) { throw 'npm run dist failed' }

Write-Host 'Portable folder (optional copy)...'
& npm.cmd run pack:portable
Pop-Location

if (Test-Path $DesktopOut) { Remove-Item -Recurse -Force $DesktopOut }
New-Item -ItemType Directory -Path $DesktopOut -Force | Out-Null

$setupExe = Get-ChildItem -Path (Join-Path $BuildSrc 'artifacts') -Filter '*Setup*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($setupExe) {
  Copy-Item $setupExe.FullName (Join-Path $DesktopOut $setupExe.Name)
}
$portable = Join-Path $BuildSrc 'artifacts\desktop-portable'
if (Test-Path $portable) {
  Copy-Item -Path $portable -Destination (Join-Path $DesktopOut 'Portable') -Recurse -Force
}

@"
شؤون العسكريين — تطبيق سطح مكتب متكامل
========================================

1) التثبيت (موصى به):
   شغّل ملف Setup.exe
   بعد التثبيت: افتح «Military Affairs» من قائمة ابدأ
   → خادم HTTPS + قاعدة بيانات محلية داخل التطبيق (بدون PostgreSQL)
   → كلمة admin في: %%LOCALAPPDATA%%\Military Affairs Play\standalone\login.txt
      (أو play-login.txt بجانب المشروع عند التشغيل من المصدر)

2) نسخة محمولة (بدون تثبيت):
   مجلد Portable — شغّل «تشغيل-محلي.cmd»

3) ربط بخادم PostgreSQL على الشبكة (اختياري):
   شغّل التطبيق مع: Military Affairs.exe --remote
   ثم من الإعدادات: عنوان https://الخادم:8443 + شهادة CA

4) التطوير من المصدر:
   شغّل.cmd  أو  npm run play

"@ | Set-Content -Path (Join-Path $DesktopOut 'اقرأني.txt') -Encoding UTF8

Write-Host ''
Write-Host "Done: $DesktopOut"
