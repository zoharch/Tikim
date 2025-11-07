@echo off
chcp 65001
title בדיקת חדלות פירעון
chcp 65001
setlocal enabledelayedexpansion


rem Store current location
SET currentDirectory=%~dp0
pushd %CD%
cd %currentDirectory%
cls
cd ../..
set root=%CD%




rem Configure color codes
set "GREEN=0A"
set "YELLOW=0E"
set "RED=0C"
set "WHITE=07"

set PLAYWRIGHT_HEADLESS=1

rem Show loading message
color %YELLOW%
echo Loading Tikim (npm start:parallel)...
echo ============================================



rem Open input folder and prompt user to insert XLSX
start "" explorer "%root%\input"
color %YELLOW%
echo Insert new xlsx file into the opened 'input' folder.
echo Make sure to close any open Excel files before proceeding.
echo.
set /p dummy="Press Enter to continue..."
echo Starting Tikim via npm run start:parallel...
echo.


rem Run npm script and capture output in real time
call npm run start:parallel
@echo off
set EXIT_CODE=%ERRORLEVEL%

echo.
echo ============================================

if %EXIT_CODE% equ 0 (
    color %GREEN%
    echo.
    echo Tikim finished successfully!
    rem Find and display the latest result files
    for /f "tokens=*" %%f in ('dir /b /o-d "%~dp0output\results-*.xlsx" 2^>nul') do (
        set "LATEST_XLSX=%%f"
        goto :found_xlsx
    )
    echo No XLSX results found!
    goto :after_xlsx

    :found_xlsx
    echo.
    echo Results saved to: %~dp0output\!LATEST_XLSX!
    echo Opening result file...
    start "" "%~dp0output\!LATEST_XLSX!"
    :after_xlsx
) else (
    color %RED%
    echo.
    echo Tikim exited with errors (exit code %EXIT_CODE%)
    echo.
    echo Checking logs directory...
    for /f "tokens=*" %%f in ('dir /b /o-d "%~dp0logs\*.log" 2^>nul') do (
        set "LATEST_LOG=%%f"
        goto :found_log
    )
    echo No log files found!
    goto :after_log

    :found_log
    echo.
    echo Latest log file: %~dp0logs\!LATEST_LOG!
    echo Showing last 50 lines:
    echo.
    more +0 "%~dp0logs\!LATEST_LOG!"
    :after_log
    echo.
    pause
)

color %WHITE%
echo ============================================
echo.
if %EXIT_CODE% equ 0 (
    color %GREEN%
    echo Press Enter to close this window - your results file is already open...
) else (
    color %RED%
    echo Press Enter to close this window after reviewing the errors...
)

goto :final_prompt

:FINAL
@echo off
@REM restore location
popd
@echo on
exit /b %EXIT_CODE%

:final_prompt
color %WHITE%
echo ============================================
echo.
if %EXIT_CODE% equ 0 (
    color %GREEN%
    echo Press Enter to close this window - your results file is already open...
) else (
    color %RED%
    echo Press Enter to close this window after reviewing the errors...
)
set /p dummy=""
goto :FINAL
