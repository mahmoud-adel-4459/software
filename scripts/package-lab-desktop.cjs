'use strict';
// Self-contained Lab demo folder: Electron portable + in-memory lab server (needs Node.js on PC).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { copyDependencies } = require('./package-dependency.cjs');

const workspace = path.resolve(__dirname, '..');
const out = path.join(workspace, 'artifacts', 'lab-desktop-package');

function rm(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

execFileSync(process.execPath, [path.join(__dirname, 'portable.cjs')], { stdio: 'inherit', cwd: workspace });

rm(out);
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(workspace, 'artifacts', 'desktop-portable'), out, { recursive: true });

for (const name of ['server', 'shared']) {
  fs.cpSync(path.join(workspace, name), path.join(out, name), { recursive: true });
}
fs.mkdirSync(path.join(out, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(out, 'tests'), { recursive: true });
for (const rel of ['scripts/lab-server.cjs', 'scripts/lab-sample-data.cjs', 'tests/pglite-pool.cjs']) {
  fs.copyFileSync(path.join(workspace, rel), path.join(out, rel));
}

const privateDir = path.join(out, 'private');
fs.mkdirSync(privateDir, { recursive: true });
for (const name of ['lab-devices.json', 'ca-cert.pem', 'server-cert.pem', 'server-key.pem', 'license.json', 'issuer-public.pem']) {
  const src = path.join(workspace, 'private', name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(privateDir, name));
}
if (!fs.existsSync(path.join(workspace, '.env'))) {
  throw new Error('Run npm.cmd run lab:setup first (.env missing)');
}
fs.copyFileSync(path.join(workspace, '.env'), path.join(out, '.env'));

const loginSrc = path.join(workspace, 'private', 'lab-login.txt');
const loginText = fs.existsSync(loginSrc) ? fs.readFileSync(loginSrc, 'utf8') : '';
fs.writeFileSync(path.join(out, 'بيانات-الدخول.txt'), loginText + '\r\nعسكريون تجريبيون: 000012345 · 000054321 · 000099887\r\n', 'utf8');

copyDependencies(['@electric-sql/pglite'], out, workspace);

fs.writeFileSync(path.join(out, 'تشغيل-التجربة.cmd'), `@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1 || (
  echo تثبيت Node.js 24 أو أحدث مطلوب من https://nodejs.org
  pause
  exit /b 1
)
echo تشغيل خادم التجربة...
start "Lab Server" cmd /k "cd /d %~dp0 && node --env-file=.env scripts\\lab-server.cjs"
set /a n=0
:wait
timeout /t 2 /nobreak >nul
set /a n+=1
netstat -an | findstr /C:":8443" | findstr LISTENING >nul && goto ready
if %n% lss 30 goto wait
echo لم يبدأ الخادم على المنفذ 8443 — راجع نافذة Lab Server
pause
exit /b 1
:ready
set MILITARY_AFFAIRS_LAB=1
start "" "%~dp0Military Affairs.exe" --lab
echo تم. الدخول: admin — كلمة المرور في بيانات-الدخول.txt
`, 'utf8');

fs.writeFileSync(path.join(out, 'إذا-ظهر-جهاز-غير-معتمد.txt'), `جهاز غير معتمد — الحل
========================
1) أغلق كل نوافذ «Lab Server» وكل نسخ Military Affairs من قائمة Start (Setup).
2) شغّل فقط من هذا المجلد: تشغيل-التجربة.cmd
   (يفتح خادم + تطبيق بنفس الترخيص)
3) لا تشغّل npm run lab:server من مجلد المشروع مع تطبيق Demo-Lab — قد يختلف الترخيص.
4) الدخول: admin — بيانات-الدخول.txt
`, 'utf8');

fs.writeFileSync(path.join(out, 'README.txt'), `Military Affairs — Lab demo package
1. Install Node.js 24+ if needed.
2. Double-click تشغيل-التجربة.cmd
3. Login: see بيانات-الدخول.txt
Do not use https://127.0.0.1:8443 in a browser for daily work.
`, 'utf8');

console.log(`Lab desktop package: ${out}`);
