@echo off
title Tikim Project Setup

echo ===============================
echo   Checking Node.js...
echo ===============================
node -v >nul 2>&1
IF %errorlevel% NEQ 0 (
    echo Node.js is NOT installed. Installing now...
    
    REM Download Node.js ZIP (Portable version, no admin required)
    powershell -Command "Invoke-WebRequest -Uri https://nodejs.org/dist/v24.3.0/node-v24.3.0-win-x64.zip -OutFile node.zip"
    
    echo Extracting Node.js...
    powershell -Command "Expand-Archive node.zip -DestinationPath node"
    del node.zip

    REM Add local Node.js to PATH
    set "NODE_DIR=%~dp0node\node-v24.3.0-win-x64"
    set "PATH=%NODE_DIR%;%NODE_DIR%\node_modules\.bin;%PATH%"
) ELSE (
    echo Node.js is installed
)

REM If downloaded Node, still need to set PATH for this terminal
if exist "%~dp0node\node-v24.3.0-win-x64\node.exe" (
    set "NODE_DIR=%~dp0node\node-v24.3.0-win-x64"
    set "PATH=%NODE_DIR%;%NODE_DIR%\node_modules\.bin;%PATH%"
)

echo.
echo ===============================
echo   Checking for pnpm...
echo ===============================
pnpm -v >nul 2>&1
IF %errorlevel% NEQ 0 (
    echo pnpm is NOT installed. Installing...
    npm install -g pnpm
) ELSE (
    echo pnpm is installed
)

echo.
echo ===============================
echo   Running the project...
echo ===============================
call run_project.bat
pause
