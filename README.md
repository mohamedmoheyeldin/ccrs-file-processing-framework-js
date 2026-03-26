# CCRS File Processing Framework

This project is a pure JavaScript Electron desktop app for working with CCRS referral files. It supports editing existing referral JSON files, generating new referral files, building final `.gz` packages, importing WinSCP upload settings, and uploading the finished archive to configured targets.

## Architecture
- Electron handles the desktop window, dialogs, IPC, and Windows packaging.
- The runtime logic lives under [electron/backend](electron/backend).
- The UI lives under [electron/renderer](electron/renderer).

## Versioning
The single source of truth for the app version is [config/app_version.json](config/app_version.json).

Current structure:
```json
{
  "version": "6.3.0",
  "channel": "Beta"
}
```

How it works:
- `version` controls the Windows build version and the `.exe` filenames.
- `channel` controls the badge prefix shown in the app, such as `Beta`.
- The app displays `Beta 6.3` while the build artifacts use `6.3.0`.
- `npm start`, `npm test`, and `npm run dist` automatically sync `package.json` and `package-lock.json` from this file before running.

## Developer Run
Install dependencies once:
- `npm install`

Run the desktop app:
- `npm start`

Run smoke tests:
- `npm test`

## Build Shareable Windows Executables
Run:
- `build_release.bat`

Or directly:
- `npm run dist`

The build outputs use the current version from [config/app_version.json](config/app_version.json), for example:
- `dist-electron\CCRS File Processing Framework Setup 6.3.0.exe`
- `dist-electron\CCRS File Processing Framework 6.3.0.exe`

The final shareable copies are placed in `release\`:
- `release\CCRS File Processing Framework Setup 6.3.0.exe`
- `release\CCRS File Processing Framework 6.3.0.exe`

Use the setup `.exe` for a normal installer flow. Use the non-setup `.exe` as the portable app.

## Runtime Files
On first run, the packaged app creates or reuses these folders next to the `.exe`:
- `config`
- `upload_import`
- `logs`
- `docs`
- `assets`

Files users commonly work with:
- `config\upload_profiles.json`
- `config\upload_credentials.json`
- `docs\USER_GUIDE.md`

Files that are kept in sync from the shipped app:
- `config\app_version.json`
- `docs\USER_GUIDE.md`

## Supported Workflows
- Process existing CCRS referral JSON files
- Generate new referral JSON files from bundled templates
- Override referral number, SSN, station ID, payment authority code, and selected optional fields
- Produce final `.gz` archives
- Import upload settings from `WinSCP.ini` or credentials JSON
- Upload final archives to configured `DEV`, `PPD`, and `SQA` targets
- Test upload connectivity before running the full workflow

## Validation And Testing
The app now validates key fields before processing and shows inline messages for common mistakes such as:
- invalid SSN format
- invalid referral number format
- invalid station ID format
- payment authority code values above the allowed 5-digit limit
- invalid date formats
- missing upload user or remote directory values

Smoke coverage lives in [scripts/smoke-test.js](scripts/smoke-test.js). The current smoke tests cover:
- payment authority code limits and generation
- referral number generation
- optional override normalization
- invalid date rejection
- upload profile summaries
- preview validation field errors

## User Documentation
The main user-facing guide is [docs/USER_GUIDE.md](docs/USER_GUIDE.md).
