@echo off
setlocal
rem Launches AI Trading Assistance OS straight into a full-screen app window (no tabs, no address bar).
rem Exit full screen with F11 or Esc; close with Alt+F4.

set "URL=http://localhost:5173/"
set "PROFILE=%LOCALAPPDATA%\AI-TOS\browser-profile"
cd /d "%~dp0"

rem 1) Start the web + AI servers if they are not already running.
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%' | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Starting AI-TOS servers...
  start "AI-TOS servers" /min cmd /c "npm run dev"
  powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%' | Out-Null; exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1"
  if errorlevel 1 (
    echo Could not reach %URL% - check the "AI-TOS servers" window for errors.
    pause
    exit /b 1
  )
)

rem 2) Find Chrome, then Edge.
set "BROWSER="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if not defined BROWSER if exist %%P set "BROWSER=%%~P"

if not defined BROWSER (
  echo Chrome or Edge not found - opening in your default browser instead. Press F11 for full screen.
  start "" "%URL%"
  exit /b 0
)

rem A dedicated profile guarantees the full-screen flags apply even if the browser is already open.
if /i "%~1"=="--dry-run" (
  echo Would run: "%BROWSER%" --user-data-dir="%PROFILE%" --no-first-run --start-fullscreen --app="%URL%"
  exit /b 0
)
start "" "%BROWSER%" --user-data-dir="%PROFILE%" --no-first-run --start-fullscreen --app="%URL%"
exit /b 0
