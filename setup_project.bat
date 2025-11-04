
@echo off
REM --- Clone the repository if not already present ---
setlocal
set NVM_VERSION=1.1.12
set NODE_VERSION=22.0.0
set PROJECT_DIR=C:\hadlap\
set REPO_URL=https://github.com/zoharch/Tikim
set REPO_BRANCH=v-1.1.1
set BATCH_TARGET=%PROJECT_DIR%scripts\templates\run_tikim_headless.bat
set ICON_URL=https://cdn.jsdelivr.net/gh/google/material-design-icons@master/src/action/eco/materialicons/24px.svg
set ICON_PATH=%PROJECT_DIR%green_tree.ico
set SHORTCUT_NAME=Tikim.lnk
set SHORTCUT_PATH=%USERPROFILE%\Desktop\%SHORTCUT_NAME%

if not exist "%PROJECT_DIR%" mkdir "%PROJECT_DIR%"
if not exist "%PROJECT_DIR%.git" (
  echo Cloning repository...
  git clone --branch %REPO_BRANCH% --single-branch %REPO_URL% "%PROJECT_DIR%"
) else (
  echo Repository already exists in %PROJECT_DIR%
)

REM Download NVM for Windows
if not exist nvm-setup.exe (
  powershell -Command "Invoke-WebRequest -Uri https://github.com/coreybutler/nvm-windows/releases/download/%NVM_VERSION%/nvm-setup.exe -OutFile nvm-setup.exe"
)
start /wait nvm-setup.exe /SILENT

REM Add NVM to PATH for this session
set "PATH=%ProgramFiles%\nvm;%PATH%"

REM Install Node.js 22 and set as default
nvm install %NODE_VERSION%
nvm use %NODE_VERSION%

REM Install pnpm globally
npm install -g pnpm

REM Go to project directory and install dependencies
cd /d "%PROJECT_DIR%"
pnpm install

REM Download a free green tree icon (public domain/CC0)
REM We'll use a simple SVG to ICO conversion via PowerShell (Windows 10+)
if not exist "%ICON_PATH%" (
  powershell -Command "Invoke-WebRequest -Uri 'https://cdn.pixabay.com/photo/2013/07/13/12/46/tree-146497_1280.png' -OutFile '%PROJECT_DIR%green_tree.png'"
  powershell -Command "Add-Type -AssemblyName System.Drawing; $img=[System.Drawing.Image]::FromFile('%PROJECT_DIR%green_tree.png'); $icon=[System.Drawing.Icon]::FromHandle($img.GetHicon()); $fs=New-Object IO.FileStream('%ICON_PATH%', 'Create'); $icon.Save($fs); $fs.Close();"
)

REM Create desktop shortcut to the batch file with the icon
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); $Shortcut.TargetPath = '%BATCH_TARGET%'; $Shortcut.IconLocation = '%ICON_PATH%'; $Shortcut.Save()"

echo Setup complete. You can now use the desktop shortcut to run the project.
endlocal
