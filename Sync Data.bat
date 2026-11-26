@echo off
rem Syncs all data into the simulator in one go. Double-click this file.
rem   1. From the game's servers (no phone; each run registers a new anonymous game account to ask for the current
rem      data): the game's data, decrypted into a new master database, new animation files, decoded timings, rebuilt
rem      unit database, box icons of new alternate arts. Skipped when the server's data is already synced (from a
rem      terminal, add --force to redo it). If that fails (e.g. the game changed its sign-up keys), it tries the phone
rem      instead (plugged in, USB debugging on, game updated and opened once since an update).
rem   2. The community data (2Shankz OPTC-DB): if it has changed, the unit database is rebuilt with it.
rem   3. From the game data: every Pirate Rumble stage's rules (the app uses today's) and the Assault Rumble seasons
rem      (boss teams, their rules, trusty characters).
rem   4. Nydato's Rumble Sheet: the meta team comps (tier SS and up become the default teams; credit: Nydato).
rem The simulator's checks run after every rebuild. See data\reports\ for what changed.
rem   5. Publish: if any data changed, it lists the files and asks before committing just those and pushing them to
rem      GitHub; the website (Cloudflare Pages) rebuilds from that in about 2 minutes. Answer N to keep it local.
title Rumble Sim - sync data
cd /d "%~dp0"

if not exist node_modules (
  echo Installing packages ^(first run only^)...
  call npm install || goto failed
)

echo === 1. Game data from the game's servers
call npm run --silent sync:game -- %*
if errorlevel 1 (
  echo.
  echo The server step didn't finish ^(see the message above^). Trying the phone instead...
  call npm run --silent sync:phone -- %*
  if errorlevel 1 (
    echo.
    echo The phone step didn't finish either ^(see the message above^). Carrying on with the community data.
  )
)

echo.
echo === 2. Community data ^(2Shankz OPTC-DB^)
call npm run --silent db:check
if errorlevel 10 (
  echo Rebuilding the unit database...
  call npm run db:update || goto failed
) else if errorlevel 1 (
  goto failed
)

echo.
echo === 3. Rumble rules and Assault Rumble boss teams from the game data
call npm run --silent sync:assault
if errorlevel 1 (
  echo The Assault Rumble step didn't finish ^(see the message above^). Carrying on.
)

echo.
echo === 4. Nydato's Rumble Sheet ^(meta teams: the default teams and the team generator's templates^)
call npm run --silent sync:nydato
if errorlevel 1 (
  echo.
  echo The sheet step didn't finish ^(see the message above^). The rest is done.
)

echo.
echo === 5. Publish to the website
set "PUBPATHS=data public/game public/import src/engine/nydato-comps.json"
set "CHANGED="
for /f "delims=" %%i in ('git status --porcelain -- %PUBPATHS%') do set "CHANGED=1"
if not defined CHANGED (
  echo No new data: nothing to publish.
  goto done
)
set "BRANCH="
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
if not "%BRANCH%"=="main" (
  echo The simulator folder is on branch %BRANCH%, not main: not publishing. Switch to main and run this again.
  goto done
)
echo Changed data files:
git status --short -- %PUBPATHS%
echo.
choice /c YN /m "Publish this data to the website"
if errorlevel 2 (
  echo Not published. The data stays on this PC only.
  goto done
)
git add -- %PUBPATHS% || goto failed
git commit -q -m "Data sync %DATE%" -- %PUBPATHS% || goto failed
git push || goto failed
echo Published: the website updates in about 2 minutes.

:done
echo.
echo Done. See data\reports\ for what changed.
pause
goto :eof

:failed
echo.
echo Something went wrong - see the messages above.
pause
