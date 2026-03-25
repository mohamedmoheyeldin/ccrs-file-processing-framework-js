@echo off
setlocal

cd /d "%~dp0"
title CCRS File Processing Framework

set "PY_CMD=python"
set "GUI_CMD=pythonw"

where py >nul 2>nul
if %errorlevel%==0 (
    set "PY_CMD=py -3"
    set "GUI_CMD=pyw"
)

where python >nul 2>nul
if not %errorlevel%==0 (
    if "%PY_CMD%"=="python" (
        echo Python 3 is not installed or not available in PATH.
        echo Please install Python 3 and then run this file again.
        pause
        exit /b 1
    )
)

echo Checking dependencies...
if exist requirements.txt (
    for %%A in (requirements.txt) do set REQ_SIZE=%%~zA
    if not "%REQ_SIZE%"=="0" (
        %PY_CMD% -m pip install -r requirements.txt
        if errorlevel 1 (
            echo Failed to install required dependencies.
            pause
            exit /b 1
        )
    )
)

where pyw >nul 2>nul
if %errorlevel% neq 0 (
    where pythonw >nul 2>nul
    if %errorlevel% neq 0 (
        set "GUI_CMD=%PY_CMD%"
    )
)

echo Starting the application...
start "" %GUI_CMD% src\gui.py

endlocal
