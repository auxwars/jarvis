@echo off
title J.A.R.V.I.S.
color 0B

echo.
echo  ============================================
echo   J.A.R.V.I.S. STARTUP
echo  ============================================
echo.

:: SET YOUR API KEY HERE (replace PASTE_YOUR_KEY_HERE with your actual key)
set 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

:: Navigate to jarvis folder
cd /d "%~dp0"

:: Write a clean .env file every time
echo ANTHROPIC_API_KEY=%ANTHROPIC_API_KEY%> .env

:: Pull latest updates automatically
echo  Checking for updates...
git pull
echo.

:: Start the server
echo  Starting J.A.R.V.I.S...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:5000"
timeout /t 2 /nobreak >nul
python app.py

pause
