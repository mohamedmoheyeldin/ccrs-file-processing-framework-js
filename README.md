# CCRS File Processing Framework

This project is a pure JavaScript Electron desktop app for working with CCRS referral files. It supports editing existing referral JSON files, generating new referral files, building final `.gz` packages, importing WinSCP upload settings, and uploading the finished archive to configured targets.

## Architecture
- Electron handles the desktop window, dialogs, IPC, and Windows packaging.
- The runtime logic lives under [electron/backend](electron/backend).
- The UI lives under [electron/renderer](electron/renderer).
- The canonical application logo is [assets/icons/ccrs_app_icon.png](assets/icons/ccrs_app_icon.png); its multi-resolution Windows counterpart is [assets/icons/ccrs_app_icon.ico](assets/icons/ccrs_app_icon.ico). Both are used by the renderer, application window, executable, installer, and uninstaller.

## Versioning
The single source of truth for the app version is [config/app_version.json](config/app_version.json).

Current structure:
```json
{
  "version": "1.3.9",
  "releaseTag": "v1.3.9",
  "label": "Version 1.3.9",
  "releaseNotes": [
    "Short list of release changes shown in the app the first time a user opens that release."
  ]
}
```

How it works:
- `version` is the internal numeric Windows build version and remains monotonic for installer upgrades.
- `releaseTag` is the public GitHub Release tag.
- `label` is the user-facing release name shown in the app badge and window title.
- `releaseNotes` powers the one-time What's New popup for each release. It appears after a fresh install and on the first launch after upgrading from an older release.
- `announcementId` must be unique for every release. The app compares it with the last acknowledged release stored in the user's AppData, so older acknowledgements never suppress newer notes.
- The current user release is `Version 1.3.9` (`v1.3.9`). Version 1.3.7 remains documented as an internal release included in Version 1.3.8 and later releases.
- `pnpm start`, `pnpm test`, and `pnpm run dist` automatically synchronize package metadata from this file before running.

## Developer Run
Install dependencies once:
- `corepack enable`
- `pnpm install --frozen-lockfile`

Run the desktop app:
- `pnpm start`

Run smoke tests:
- `pnpm verify`

Run the real Electron end-to-end test:
- `pnpm run test:e2e`

## Build And Distribution
Release binaries are not stored in this repository. The GitHub Actions release workflow builds the Windows Setup installer in temporary runner storage, verifies it, publishes it to GitHub Releases, and then discards the temporary build files.

`pnpm run dist` uses the same temporary-directory build flow for troubleshooting. It does not create `dist-electron\` or `release\` in the project. Portable executables are not generated.

## Publish A GitHub Release
The [Build and publish Windows release](.github/workflows/release.yml) workflow creates a complete GitHub Release containing:
- the verified Windows Setup installer
- `SHA256SUMS.txt` for download verification
- configured release highlights from [config/app_version.json](config/app_version.json)
- curated release highlights from `config/app_version.json`

Before publishing:
1. Update `version`, `releaseTag`, `label`, `announcementId`, and `releaseNotes` in [config/app_version.json](config/app_version.json).
2. Commit and push the release changes to `main`.
3. Run the workflow manually from GitHub Actions, or push the configured release tag such as `v1.3.9`.

The workflow requires the tag to match `releaseTag` and refuses to overwrite an existing release.
It also refuses to build a release when `releaseNotes` is empty.

Pull requests and updates to `main` run functional smoke tests, a production dependency audit, and a Windows Electron end-to-end test. Release CI repeats those checks, builds the Setup installer, silently installs it, launches the installed app, verifies the executable, and then publishes it.

Full release notes are maintained in [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).

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
- `config\upload_credentials.json` (encrypted with Windows-protected storage after import)
- `docs\USER_GUIDE.pdf`

Files that are kept in sync from the shipped app:
- `config\app_version.json`
- `config\stations.json`
- `config\seoc_options.json`
- `docs\USER_GUIDE.md`
- `docs\USER_GUIDE.pdf`
- `docs\LEIE_UPLOAD_VALIDATION_GUIDE.md`

## Supported Workflows
- Process existing CCRS referral JSON files
- Process LEIE Excel files with strict full-row duplicate detection
- Keep the original LEIE source file name as the default output name
- Generate new referral JSON files from bundled templates
- Use the bundled CCN1 all-fields reference templates stored under `templates\referrals`
- Generate unique `999`-prefixed test SSNs and random DOBs per patient, or apply fixed overrides when needed
- Search all imported station rows by station key, station ID, VISN, station name, or parent station ID; selection is optional
- Optionally select synchronized SEOC Number and SEOC ID pairs, including six special selection-only pairs
- Choose how ICNs should be generated: derive `TEST` plus the Referral Number body, keep `TEST`, keep `TEST` with a custom suffix, or use a custom full ICN base
- Match the last 3, 4, or 5 characters of each Referral Number and ICN
- Produce final `.gz` archives
- Import upload settings from `WinSCP.ini` or credentials JSON
- Upload Referral archives to `DEV`, `PPD`, or `SQA`; the separate LEIE workflow can also use `PROD`
- Test upload connectivity before running the full workflow
- Verify each LEIE upload and continue through every selected server even when one target fails
- Default every LEIE server upload to `/in/manual_process/` while retaining `/CCRA_Uploads` for referral workflows
- Automatically clean app-created temporary staging folders and upload helper files after a run or when the app closes
- Process long-running work in background workers with progress and cancellation
- Enforce configurable large-file and generation safety limits
- Stream referral gzip output to reduce peak memory use
- Export a sanitized diagnostic report without credentials or user file paths
- Review a complete safety summary before processing or upload
- Preserve unrelated output files through isolated per-run staging and collision checks
- Write a batch manifest with counts, uniqueness results, station distribution, hashes, and upload outcomes
- Open the current output, inspect its manifest, copy its path, or retry only failed uploads

## Station reference data

`config\stations.json` is the application's main station source. It contains every row and column imported from the approved Excel workbook, with blank and Excel `NULL` cells represented as JSON `null`. The Stations control displays and searches `station_key`, `station_id`, `visn_id`, `station_name`, and `parent_station_id`; selecting a row applies its `station_id` to referral data.

To refresh the structured source from a replacement workbook:

```bash
pnpm data:stations -- /path/to/stations.xlsx
pnpm verify
```

## Version 1.3.9 Highlights
- Source and output folders must be separate, and the app stages each run before changing the selected output folder.
- Any invalid referral file stops the batch before an incomplete archive can be created or uploaded.
- A pre-run safety review makes output behavior, station choices, and upload destinations explicit; LEIE PROD requires typed confirmation.
- Every referral archive receives an auditable manifest with SHA-256 hashes and business-result summaries.
- Current-run actions support opening results, viewing the manifest, copying the output path, and retrying only failed uploads.
- Structured phases keep progress and cancellation messages aligned with the actual backend state.
- Full current and historical notes are maintained in [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).

Previous release notes:

- [Version 1.3.8](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.8)
- [Version 1.3.7](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.7) — internal release included in Version 1.3.8
- [Version 1.3.6](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.6)
- [Version 1.3.5](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.5)
- [Version 1.3.4](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.4)
- [Version 1.3.3](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.3)
- [Version 1.3.2](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.2)

## Validation And Testing
Developer setup, architecture, and test-layer details are maintained in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/TESTING.md](docs/TESTING.md).

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
- secure credential imports, atomic settings writes, source limits, and streaming gzip output

The Windows Playwright test in [scripts/electron-e2e-test.js](scripts/electron-e2e-test.js) launches the actual Electron UI and verifies a background referral generation job.

## User Documentation
The user guide source lives in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).
Packaged builds open the generated `docs/USER_GUIDE.pdf` from the app UI.
