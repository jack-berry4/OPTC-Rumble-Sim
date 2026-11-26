@echo off
rem Starts the Rumble Sim web server and opens it in your browser.
rem Double-click this file. Close this window (or press Ctrl+C) to stop the server.
title Rumble Sim
cd /d "%~dp0"

if not exist node_modules (
  echo Installing packages ^(first run only^)...
  call npm install || goto failed
)

echo Starting the simulator at http://localhost:5173 ...
call npm run dev -- --open || goto failed
goto :eof

:failed
echo.
echo Something went wrong - see the messages above.
pause
