# Architecture

## Purpose

The CCRS File Processing Framework is a local Electron desktop application for preparing referral and LEIE data, creating final artifacts, and optionally uploading them to configured environments.

## Main boundaries

- `electron/main.js` owns the Electron lifecycle, windows, native dialogs, and IPC registration.
- `electron/renderer/` contains the desktop user interface and renderer-side interactions.
- `electron/backend/` contains file processing, validation, generation, upload, credential, and worker logic.
- `templates/` and `config/` contain shipped reference data and versioned defaults.
- `scripts/` contains documentation generation, metadata synchronization, tests, and release automation.
- `docs/` contains user and developer documentation packaged with the app.

## Data and security boundary

Runtime data is copied to the current Windows user's AppData area. Upload credentials are protected with Windows-provided encryption after import. Local credentials, WinSCP imports, logs, generated output, and temporary work directories must not be committed.

`config/station_options.json` is authoritative shipped reference data and is refreshed from the application bundle during upgrades. `electron/backend/stationCatalog.js` normalizes legacy catalogs by deriving the actual VA Station ID from the second parenthesized code in each station name, rejects non-station/test rows, and de-duplicates IDs before they reach manual or random referral generation.

## Release boundary

`config/app_version.json` is the canonical release record. `scripts/sync-build-version.js` propagates it to package metadata before start, test, and distribution tasks. `scripts/build-release.js` builds a Windows x64 NSIS Setup installer in a validated temporary directory outside the repository. GitHub Actions performs the authoritative Windows UI, installation, launch, executable, checksum, and release checks.
