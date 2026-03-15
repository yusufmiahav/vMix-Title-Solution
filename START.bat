@echo off
title VMix Title Controller
color 0A

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║     VMix Title Controller — Starting      ║
echo  ╚═══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo  Please download it from https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo  Installing dependencies (first run only)...
    echo.
    call npm install
    echo.
)

echo  Starting server...
echo  Open http://localhost:3000 in your browser
echo  Remote operators can use http://YOUR-IP:3000
echo.
echo  Press Ctrl+C to stop.
echo.

node server.js

pause
