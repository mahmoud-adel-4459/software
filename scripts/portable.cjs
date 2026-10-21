'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { copyDependencies } = require('./package-dependency.cjs');
const workspace = path.resolve(__dirname, '..');
const output = path.join(workspace, 'artifacts', 'desktop-portable');
const application = path.join(output, 'resources', 'app');
const runtime = path.dirname(require('electron'));
// No cleanup or deletion: rebuilding replaces matching generated files only.
fs.mkdirSync(application, { recursive: true });
fs.cpSync(runtime, output, { recursive: true });
for (const name of ['desktop', 'renderer', 'css', 'fonts', 'shared', 'server']) {
  fs.cpSync(path.join(workspace, name), path.join(application, name), { recursive: true });
}
const scriptsInApp = path.join(application, 'scripts');
fs.mkdirSync(scriptsInApp, { recursive: true });
fs.copyFileSync(path.join(workspace, 'scripts/lab-sample-data.cjs'), path.join(scriptsInApp, 'lab-sample-data.cjs'));
const sourcePackage = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(application, 'package.json'), JSON.stringify({ name: sourcePackage.name, version: sourcePackage.version,
  main: sourcePackage.main, description: sourcePackage.description }, null, 2));
copyDependencies(['qrcode', '@electric-sql/pglite'], application, workspace);
const appPrivate = path.join(application, 'private');
fs.mkdirSync(appPrivate, { recursive: true });
for (const name of ['lab-devices.json', 'ca-cert.pem', 'server-cert.pem', 'server-key.pem']) {
  const src = path.join(workspace, 'private', name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(appPrivate, name));
}
fs.copyFileSync(path.join(runtime, 'electron.exe'), path.join(output, 'Military Affairs.exe'));
fs.writeFileSync(path.join(output, 'Start Lab.cmd'), '@echo off\r\nset MILITARY_AFFAIRS_LAB=1\r\ncd /d "%~dp0"\r\nstart "" "%~dp0Military Affairs.exe" --lab\r\n');
fs.writeFileSync(path.join(output, 'تشغيل-تجربة.cmd'), '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nset MILITARY_AFFAIRS_STANDALONE=1\r\nstart "" "%~dp0Military Affairs.exe" --standalone\r\necho تم فتح البرنامج — خادم محلي داخل التطبيق.\r\necho كلمة المرور: %%LOCALAPPDATA%%\\Military Affairs\\standalone\\login.txt\r\n', 'utf8');
fs.writeFileSync(path.join(output, 'تشغيل-محلي.cmd'), '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nset MILITARY_AFFAIRS_PLAY=1\r\nstart "" "%~dp0Military Affairs.exe" --play\r\necho تطبيق متكامل — خادم وقاعدة محلية.\r\necho بيانات الدخول: %%LOCALAPPDATA%%\\Military Affairs Play\\standalone\\login.txt\r\n', 'utf8');
fs.writeFileSync(path.join(output, 'README.txt'), 'Double-click تشغيل-تجربة.cmd (one exe, offline server). Lab+Node: Start Lab.cmd + npm lab:server.\r\n');
if (fs.existsSync(path.join(application, 'tools')) || fs.existsSync(path.join(application, '.env'))) throw new Error('Private files must not be packaged');
console.log(`Portable desktop created: ${output}`);
