@echo off
cd /d "%~dp0"
start "Centro de Control - servidor" cmd /k node server\server.js
timeout /t 2 >nul
start "" http://127.0.0.1:4173
