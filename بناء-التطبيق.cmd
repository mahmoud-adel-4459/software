@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo بناء تطبيق سطح المكتب المتكامل (مثبت + portable)...
call npm.cmd run build:integrated
if errorlevel 1 pause & exit /b 1
echo.
echo راجع مجلد MilitaryAffairs-Integrated على سطح المكتب.
pause
