@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo بناء مثبّت التطبيق...
call npm.cmd run dist
if errorlevel 1 pause & exit /b 1
echo.
echo المثبّت في مجلد artifacts.
pause
