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
  "version": "1.1.0",
  "label": "Production V1.1",
  "releaseNotes": [
    "Short list of release changes shown in the app the first time a user opens that release."
  ]
}
```

How it works:
- `version` stays numeric because Windows packaging and Electron builds require a standard build version.
- `label` is the user-facing release name shown in the app badge and window title.
- `releaseNotes` powers the first-run release popup for each user and release.
- The app now displays `Production V1.1` while the Windows build version remains `1.1.0`.
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
- `dist-electron\CCRS File Processing Framework Setup 1.1.0.exe`
- `dist-electron\CCRS File Processing Framework 1.1.0.exe`

The final shareable copies are placed in `release\` using the display label when one is configured:
- `release\CCRS File Processing Framework Setup Production V1.1.exe`
- `release\CCRS File Processing Framework Production V1.1.exe`

Use the setup `.exe` for a normal installer flow. Use the non-setup `.exe` as the portable app.

## Runtime Files
On first run, the packaged app creates or reuses these runtime folders:
- `config`
- `upload_import`
- `logs`
- `docs`
- `assets`

For the Setup installer, runtime files are stored under the current user's AppData folder so the app can run without administrator rights, even when installed in `C:\Program Files`.

For the portable build, runtime files stay next to the portable `.exe`.

Files users commonly work with:
- `config\upload_profiles.json`
- `config\upload_credentials.json`
- `docs\USER_GUIDE.pdf`

Files that are kept in sync from the shipped app:
- `config\app_version.json`
- `docs\USER_GUIDE.md`
- `docs\USER_GUIDE.pdf`

## Supported Workflows
- Process existing CCRS referral JSON files
- Generate new referral JSON files from bundled templates
- Use the bundled CCN1 all-fields reference templates stored under `templates\referrals`
- Override referral number, SSN, station ID, payment authority code, and selected optional fields
- Choose how ICNs should be generated: keep `TEST`, keep `TEST` with a custom suffix, or use a custom full ICN base
- Produce final `.gz` archives
- Import upload settings from `WinSCP.ini` or credentials JSON
- Upload final archives to configured `DEV`, `PPD`, and `SQA` targets
- Test upload connectivity before running the full workflow
- Automatically clean app-created temporary staging folders and upload helper files after a run or when the app closes

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
- ICN generation modes
- optional override normalization
- invalid date rejection
- runtime cleanup of tracked temp artifacts
- upload profile summaries
- preview validation field errors

## User Documentation
The user guide source lives in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).
Packaged builds open the generated `docs/USER_GUIDE.pdf` from the app UI.
