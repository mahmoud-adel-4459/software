@echo off
setlocal
cd /d "%~dp0"
set MILITARY_AFFAIRS_LAB=1
echo Lab client — keep another window running: npm.cmd run lab:server
npm.cmd run lab:start
