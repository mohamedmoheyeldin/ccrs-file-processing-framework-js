# CCRS File Processing Framework

This project now targets an Electron desktop app with JavaScript for the UI while keeping the existing Python processing logic intact behind a packaged backend.

## Architecture
- Electron provides the desktop shell, window management, dialogs, and Windows packaging.
- The existing Python modules in [src](/c:/Projects/projects/coding/ccrs-file-processing-framework-js/src) still handle file processing, referral generation, upload profile import, gzip creation, and optional upload behavior.
- [src/backend_api.py](/c:/Projects/projects/coding/ccrs-file-processing-framework-js/src/backend_api.py) is the bridge that Electron calls.

## Developer Run
Install dependencies:
- `py -3 -m pip install -r requirements.txt`
- `npm install`

Run the Electron app:
- `npm start`

Optional: build the packaged Python backend only:
- `npm run backend:build`

## Build Shareable Windows Executables
Run:
- [build_release.bat](/c:/Projects/projects/coding/ccrs-file-processing-framework-js/build_release.bat)

That script builds:
- a bundled Python backend executable in `dist-python`
- a packaged Electron app in `dist-electron`

The main shareable outputs are:
- `dist-electron\CCRS File Processing Framework Setup 1.0.0.exe`
- `dist-electron\CCRS File Processing Framework 1.0.0.exe`

The portable `.exe` is the simplest file to hand to end users. The setup `.exe` provides an installer experience.

## Runtime Files
On first run, the app creates or reuses these folders next to the packaged runtime:
- `config`
- `upload_import`
- `logs`
- `docs`
- `assets`

## Supported Workflows
- Process existing CCRS referral JSON files
- Generate new referral JSON files from bundled templates
- Override referral number, SSN, station ID, payment authority code, and selected optional fields
- Produce final `.gz` archives
- Import upload settings from `WinSCP.ini` or credentials JSON
- Upload final archives to configured `DEV`, `PPD`, and `SQA` targets

## Legacy Files
The older `tkinter` GUI source is still in the repo for reference, but the new distribution path is the Electron app.
