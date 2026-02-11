@echo off
setlocal
title Promptling Rebuild

set "SCRIPT_DIR=%~dp0"
set "PM2_NAME=%~1"
if "%PM2_NAME%"=="" set "PM2_NAME=promptling"

echo.
echo  Promptling rebuild started...
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo  ERROR: Node.js is not installed.
  exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo  ERROR: npm is not installed.
  exit /b 1
)

echo  [1/4] Installing root dependencies...
cd /d "%SCRIPT_DIR%"
call npm install
if %errorlevel% neq 0 (
  echo  ERROR: Root dependency install failed.
  exit /b 1
)

echo  [2/4] Installing client dependencies...
cd /d "%SCRIPT_DIR%client"
call npm install
if %errorlevel% neq 0 (
  echo  ERROR: Client dependency install failed.
  exit /b 1
)

echo  [3/4] Building client...
call npm run build
if %errorlevel% neq 0 (
  echo  ERROR: Client build failed.
  exit /b 1
)

echo  [4/4] Installing server dependencies...
cd /d "%SCRIPT_DIR%server"
call npm install
if %errorlevel% neq 0 (
  echo  ERROR: Server dependency install failed.
  exit /b 1
)

cd /d "%SCRIPT_DIR%"
echo.
echo  Rebuild complete.
echo.
echo  Restart PM2 with:
echo    pm2 restart %PM2_NAME%
echo.
echo  Or rebuild + restart now:
echo    rebuild-promptling.bat %PM2_NAME% ^&^& pm2 restart %PM2_NAME%
echo.

endlocal
exit /b 0
