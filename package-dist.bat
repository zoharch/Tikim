@echo off
REM Create dist folder
mkdir dist

REM Copy Playwright browser binaries
xcopy "%USERPROFILE%\AppData\Local\ms-playwright" "dist\ms-playwright" /E /I /Y

REM Copy Playwright CLI tools
xcopy "node_modules\.bin\playwright*" "dist\" /Y

REM Copy your built exe (after running pnpm run build:exe)
copy "insolvency-checker.exe" "dist\insolvency-checker.exe"

echo All required files have been copied to the dist folder.
pause