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
  "version": "1.2.0",
  "label": "Production V1.2",
  "releaseNotes": [
    "Short list of release changes shown in the app the first time a user opens that release."
  ]
}
```

How it works:
- `version` stays numeric because Windows packaging and Electron builds require a standard build version.
- `label` is the user-facing release name shown in the app badge and window title.
- `releaseNotes` powers the first-run release popup for each user and release.
- The app now displays `Production V1.2` while the Windows build version remains `1.2.0`.
- `npm start`, `npm test`, and `npm run dist` automatically sync `package.json` and `package-lock.json` from this file before running.

## Developer Run
Install dependencies once:
- `npm install`

Run the desktop app:
- `npm start`

Run smoke tests:
- `npm test`

## Build And Distribution
Release binaries are not stored in this repository. The GitHub Actions release workflow builds the Windows Setup installer in temporary runner storage, verifies it, publishes it to GitHub Releases, and then discards the temporary build files.

`pnpm run dist` uses the same temporary-directory build flow for troubleshooting. It does not create `dist-electron\` or `release\` in the project. Portable executables are not generated.

## Publish A GitHub Release
The [Build and publish Windows release](.github/workflows/release.yml) workflow creates a complete GitHub Release containing:
- the verified Windows Setup installer
- `SHA256SUMS.txt` for download verification
- configured release highlights from [config/app_version.json](config/app_version.json)
- automatically generated GitHub change notes

Before publishing:
1. Update `version`, `label`, and `releaseNotes` in [config/app_version.json](config/app_version.json).
2. Commit and push the release changes to `main`.
3. Run the workflow manually from GitHub Actions, or push a matching version tag such as `v1.2.0`.

The workflow requires the tag to match the configured numeric version and refuses to overwrite an existing release. A manual run creates the matching tag from the selected commit when the release is published.

## Runtime Files
On first run, the packaged app creates or reuses these runtime folders:
- `config`
- `upload_import`
- `logs`
- `docs`
- `assets`

Runtime files are stored under the current user's AppData folder so the app can run without administrator rights, even when installed in `C:\Program Files`.

Files users commonly work with:
- `config\upload_profiles.json`
- `config\upload_credentials.json`
- `docs\USER_GUIDE.pdf`

Files that are kept in sync from the shipped app:
- `config\app_version.json`
- `docs\USER_GUIDE.md`
- `docs\USER_GUIDE.pdf`
- `docs\LEIE_UPLOAD_VALIDATION_GUIDE.md`

## Supported Workflows
- Process existing CCRS referral JSON files
- Process LEIE Excel files with strict full-row duplicate detection
- Generate new referral JSON files from bundled templates
- Use the bundled CCN1 all-fields reference templates stored under `templates\referrals`
- Generate random SSNs and DOBs per patient, or apply fixed overrides when needed
- Use an exact reference Station ID or randomly select valid Station IDs from the bundled catalog
- Select synchronized SEOC Number and SEOC ID pairs from the bundled referral references
- Choose how ICNs should be generated: keep `TEST`, keep `TEST` with a custom suffix, or use a custom full ICN base
- Match the last 3, 4, or 5 characters of each Referral Number and ICN
- Produce final `.gz` archives
- Import upload settings from `WinSCP.ini` or credentials JSON
- Upload final archives to configured `DEV`, `PPD`, `SQA`, and `PROD` targets
- Test upload connectivity before running the full workflow
- Automatically clean app-created temporary staging folders and upload helper files after a run or when the app closes

## V1.2 Highlights
- New LEIE processing flow with strict full-row duplicate detection and clearer scan status feedback.
- New in-app LEIE upload validation support:
  - quick access to `LEIE Upload and Validation Guide`
  - Step 4 database validation SQL with copy support
  - Step 5 CCRS UI validation checklist in the Upload section
- Security updates for upload config handling:
  - upload profiles are no longer auto-loaded from random machine locations
  - upload data is used only after `Import To Config`
  - fixed the security issue around where `WinSCP.ini` is sourced and persisted
- Bug fixes across LEIE scan, release update visibility, and upload gating behavior.
- UI polish for smoother interaction and clearer status messaging.

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
- Station catalog enforcement, random SSN/DOB generation, Referral/ICN suffix matching, and SEOC pairs
- optional override normalization
- invalid date rejection
- runtime cleanup of tracked temp artifacts
- upload profile summaries
- preview validation field errors

## User Documentation
The user guide source lives in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).
Packaged builds open the generated `docs/USER_GUIDE.pdf` from the app UI.
