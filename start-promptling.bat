@echo off
title Promptling

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js is not installed!
    echo.
    echo  Please install Node.js from: https://nodejs.org/
    echo  Download the LTS version and run the installer.
    echo.
    echo  After installing, restart this application.
    echo.
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "%~dp0server\node_modules" (
    echo.
    echo  Installing dependencies for first-time setup...
    echo.
    cd /d "%~dp0"
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Failed to install dependencies.
        echo.
        pause
        exit /b 1
    )
)

:: Check if client is built
if not exist "%~dp0client\dist\index.html" (
    echo.
    echo  Building client for first-time setup...
    echo.
    cd /d "%~dp0client"
    call npm run build
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Failed to build client.
        echo.
        pause
        exit /b 1
    )
) else (
    :: Check if source files are newer than build using PowerShell
    powershell -NoProfile -Command "if ((Get-ChildItem -Path '%~dp0client\src' -Recurse -File | Where-Object { $_.LastWriteTime -gt (Get-Item '%~dp0client\dist\index.html').LastWriteTime }).Count -gt 0) { exit 1 } else { exit 0 }"
    if %errorlevel% equ 1 (
        echo.
        echo  Source files changed, rebuilding client...
        echo.
        cd /d "%~dp0client"
        call npm run build
        if %errorlevel% neq 0 (
            echo.
            echo  ERROR: Failed to build client.
            echo.
            pause
            exit /b 1
        )
    )
)

:: Start the server
cd /d "%~dp0server"
echo.
echo  Starting Promptling...
echo  Opening http://localhost:3001 in your browser...
echo.
echo  Keep this window open while using Promptling.
echo  Press Ctrl+C to stop the server.
echo.

:: Open browser after a short delay (gives server time to start)
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3001"

:: Run the server (this blocks until Ctrl+C)
node index.js
