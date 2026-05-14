@echo off
title J.A.R.V.I.S.
color 0B

echo.
echo  ============================================
echo   J.A.R.V.I.S. STARTUP
echo  ============================================
echo.

:: SET YOUR API KEY HERE (replace the text between the quotes)
set ANTHROPIC_API_KEY=PASTE_YOUR_KEY_HERE

:: Navigate to jarvis folder
cd /d "%~dp0"

:: Start the server
echo  Starting J.A.R.V.I.S...
start "" "http://localhost:5000"
timeout /t 2 /nobreak >nul
python app.py

pause
