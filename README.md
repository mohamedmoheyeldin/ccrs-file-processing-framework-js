# CCRS File Processing Framework

This app now runs as a pure JavaScript Electron desktop application. The desktop shell, processing logic, referral generation, gzip creation, upload profile handling, and packaging flow are all driven from JavaScript in the Electron app.

## Architecture
- Electron handles the desktop window, dialogs, IPC, and Windows packaging.
- The runtime logic lives under [electron/backend](/c:/Projects/projects/coding/ccrs-file-processing-framework-js/electron/backend).
- The UI lives under [electron/renderer](/c:/Projects/projects/coding/ccrs-file-processing-framework-js/electron/renderer).

## Developer Run
Install dependencies:
- `npm install`

Run the desktop app:
- `npm start`

## Build Shareable Windows Executables
Run:
- [build_release.bat](/c:/Projects/projects/coding/ccrs-file-processing-framework-js/build_release.bat)

Or directly:
- `npm run dist`

The build outputs are:
- `dist-electron\CCRS File Processing Framework Setup 1.0.0.exe`
- `dist-electron\CCRS File Processing Framework 1.0.0.exe`

The portable `.exe` is the easiest file to hand to end users. The setup `.exe` provides an installer flow.

## Runtime Files
On first run, the app creates or reuses these folders next to the packaged executable:
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
