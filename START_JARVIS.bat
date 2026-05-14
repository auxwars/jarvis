@echo off
title J.A.R.V.I.S.
color 0B

echo.
echo  ============================================
echo   J.A.R.V.I.S. STARTUP
echo  ============================================
echo.

cd /d "%~dp0"

:: If .env already has a valid key, skip the prompt
if exist .env (
    findstr /C:"ANTHROPIC_API_KEY=sk-" .env >nul 2>&1
    if not errorlevel 1 goto START
)

:: Ask for key once, save it forever
echo  First time setup — paste your Anthropic API key below and press Enter:
echo  (Get one free at console.anthropic.com)
echo.
set /p "APIKEY=  Key: "
(echo ANTHROPIC_API_KEY=%APIKEY%) > .env
echo.
echo  Key saved. You will never be asked again.
echo.

:START
echo  Starting J.A.R.V.I.S...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:5000"
timeout /t 2 /nobreak >nul
python app.py

pause
