@echo off
setlocal

cd /d "%~dp0"
title Build CCRS File Processing Framework

set "CUSTOM_ICON_ICO=%CD%\assets\icons\ccrs_app_icon.ico"
if not exist "%CUSTOM_ICON_ICO%" (
    echo Missing custom icon file:
    echo %CUSTOM_ICON_ICO%
    echo.
    echo Add your Windows .ico file before running the release build.
    pause
    exit /b 1
)

echo Using custom application icon:
echo %CUSTOM_ICON_ICO%
echo.

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo npm is not installed or not available in PATH.
    pause
    exit /b 1
)

echo Installing Electron dependencies...
npm install
if errorlevel 1 (
    echo Failed to install npm dependencies.
    pause
    exit /b 1
)

echo Cleaning previous build output...
if exist dist-electron rmdir /s /q dist-electron

echo Building pure JavaScript Electron application...
npm run dist
if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
)

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "$cfg = Get-Content config\\app_version.json | ConvertFrom-Json; $label = [string]$cfg.label; if ([string]::IsNullOrWhiteSpace($label)) { $label = [string]$cfg.version }; $label -replace '[<>:\"/\\|?*]', ''"`) do set "DISPLAY_VERSION=%%v"
if "%DISPLAY_VERSION%"=="" (
    echo Failed to read the display version from config\app_version.json.
    pause
    exit /b 1
)

set "RELEASE_DIR=%CD%\release"
set "RELEASE_PORTABLE_EXE=%RELEASE_DIR%\CCRS File Processing Framework %DISPLAY_VERSION%.exe"
set "RELEASE_SETUP_EXE=%RELEASE_DIR%\CCRS File Processing Framework Setup %DISPLAY_VERSION%.exe"

if not exist "%RELEASE_PORTABLE_EXE%" (
    echo Missing exported portable release file:
    echo %RELEASE_PORTABLE_EXE%
    echo.
    echo npm run dist should now create verified shareable files in release\ automatically.
    pause
    exit /b 1
)

if not exist "%RELEASE_SETUP_EXE%" (
    echo Missing exported setup release file:
    echo %RELEASE_SETUP_EXE%
    echo.
    echo npm run dist should now create verified shareable files in release\ automatically.
    pause
    exit /b 1
)

set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\CCRS File Processing.lnk"

echo.
echo Build completed.
echo Share one of these files:
echo release\CCRS File Processing Framework Setup %DISPLAY_VERSION%.exe
echo release\CCRS File Processing Framework %DISPLAY_VERSION%.exe
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
