@echo off

chcp 65001
title בדיקת חדלות פירעון
chcp 65001
setlocal EnableDelayedExpansion

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
set EXIT_CODE=%ERRORLEVEL%

rem Wait a moment to ensure output files are written
timeout /t 2 >nul

echo.
echo ============================================

@REM echo DEBUG: About to check EXIT_CODE, value is [%EXIT_CODE%]
if %EXIT_CODE% equ 0 goto success
goto failure

:success
@REM echo DEBUG: Entered SUCCESS branch
color %GREEN%
echo.
echo Tikim finished successfully!
rem Find and display the latest result files
set "LATEST_XLSX="

for /f "tokens=*" %%f in ('dir /b /o-d "%root%\output\results-*.xlsx" 2^>nul') do (
    set "LATEST_XLSX=%%f"
    goto found_xlsx
)
echo No XLSX results found!
goto after_xlsx

:found_xlsx
echo.
echo Results saved to: %root%\output\!LATEST_XLSX!
echo Opening result file...
start "" "%root%\output\!LATEST_XLSX!"
:after_xlsx
goto final_prompt

:failure
@REM echo DEBUG: Entered FAILURE branch
color %RED%
echo.
echo Tikim exited with errors (exit code %EXIT_CODE%)
echo.
echo Checking logs directory...

for /f "tokens=*" %%f in ('dir /b /o-d "%root%\logs\*.log" 2^>nul') do (
    set "LATEST_LOG=%%f"
    goto found_log
)
echo No log files found!
goto after_log

:found_log
echo.
echo Latest log file: %root%\logs\!LATEST_LOG!
echo Showing last 50 lines:
echo.
more +0 "%root%\logs\!LATEST_LOG!"
:after_log
echo.
pause
goto final_prompt

:final_prompt
@REM echo DEBUG: Entered FINAL PROMPT section
color %WHITE%
echo ============================================
echo.
if %EXIT_CODE% equ 0 goto prompt_success
goto prompt_failure

:prompt_success
color %GREEN%
set /p dummy="Press Enter to close this window - your results file is already open..."
goto prompt_end

:prompt_failure
color %RED%
set /p dummy="Press Enter to close this window after reviewing the errors..."
goto prompt_end

:prompt_end
@echo off
popd
@echo on
exit /b %EXIT_CODE%