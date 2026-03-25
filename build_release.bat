@echo off
setlocal

cd /d "%~dp0"
title Build CCRS File Processing Framework

set "CUSTOM_ICON_ICO=%CD%\assets\icons\ccrs_app_icon.ico"
set "CUSTOM_ICON_PNG=%CD%\assets\icons\ccrs_app_icon.png"

set "PY_CMD=python"
where py >nul 2>nul
if %errorlevel%==0 (
    set "PY_CMD=py -3"
)

where python >nul 2>nul
if not %errorlevel%==0 (
    if "%PY_CMD%"=="python" (
        echo Python 3 is not installed or not available in PATH.
        pause
        exit /b 1
    )
)

if not exist "%CUSTOM_ICON_ICO%" (
    echo Missing custom icon file:
    echo %CUSTOM_ICON_ICO%
    echo.
    echo Add your Windows .ico file before running the release build.
    pause
    exit /b 1
)

if not exist "%CUSTOM_ICON_PNG%" (
    echo Missing custom PNG icon file:
    echo %CUSTOM_ICON_PNG%
    echo.
    echo Add your PNG icon file before running the release build.
    pause
    exit /b 1
)

echo Using custom application icon:
echo %CUSTOM_ICON_ICO%
echo.

echo Generating Windows icon from custom PNG...
%PY_CMD% scripts\generate_icon.py "%CUSTOM_ICON_PNG%" "%CUSTOM_ICON_ICO%"
if errorlevel 1 (
    echo Failed to generate the Windows icon file.
    pause
    exit /b 1
)

echo Installing build dependencies...
%PY_CMD% -m pip install -r requirements.txt
if errorlevel 1 (
    echo Failed to install requirements.
    pause
    exit /b 1
)

echo Cleaning previous build output...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo Building portable application...
%PY_CMD% -m PyInstaller --noconfirm "CCRS_File_Processing_Framework.spec"
if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
)

set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\CCRS File Processing.lnk"

echo.
echo Build completed.
echo Share this file:
echo dist\CCRS File Processing Framework.exe
echo.
if exist "%DESKTOP_SHORTCUT%" (
    echo Desktop shortcut detected:
    echo %DESKTOP_SHORTCUT%
    echo If the shortcut icon still shows the old image, delete that shortcut and launch the rebuilt app once to recreate it.
) else (
    echo No desktop shortcut was found on this machine.
    echo Launch the rebuilt app once if you want it to offer creating the desktop shortcut.
)
pause

endlocal
