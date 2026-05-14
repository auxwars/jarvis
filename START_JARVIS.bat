@echo off
title J.A.R.V.I.S.
color 0B

echo.
echo  ============================================
echo   J.A.R.V.I.S. STARTUP
echo  ============================================
echo.

:: SET YOUR API KEY HERE (replace PASTE_YOUR_KEY_HERE with your actual key)
set ANTHROPIC_API_KEY=PASTE_YOUR_KEY_HERE

:: Navigate to jarvis folder
cd /d "%~dp0"

:: Write a clean .env file every time
echo ANTHROPIC_API_KEY=%ANTHROPIC_API_KEY%> .env

:: Start the server
echo  Starting J.A.R.V.I.S...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:5000"
timeout /t 2 /nobreak >nul
python app.py

pause
