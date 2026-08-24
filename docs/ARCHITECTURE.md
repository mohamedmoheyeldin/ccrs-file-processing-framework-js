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

## Renderer control system

`electron/renderer/styles.css` defines shared tokens for the 48-pixel form-control height, 44-pixel minimum interaction target, padding, toggle width, and corner radius. Native inputs, compact dropdown shells, date composites, and toolbar controls consume those tokens so a field cannot grow because an adjacent field has longer helper text. Responsive grids control width and stacking rather than assigning page-specific control sizes. Upload-target rows use a 2:3 Upload User-to-Remote Directory proportion on wide layouts and collapse to one column at the shared responsive breakpoint.

`electron/renderer/compactSelect.js` progressively enhances native selects while keeping the original value and change-event behavior. Its generated listbox exposes labels, disabled and invalid states, controlled-menu relationships, visible focus, and keyboard navigation. The native select remains the application data source.

## Data and security boundary

Runtime data is copied to the current Windows user's AppData area. Upload credentials are protected with Windows-provided encryption after import. Local credentials, WinSCP imports, logs, generated output, and temporary work directories must not be committed.

`config/stations.json` is the authoritative shipped station source and is refreshed from the application bundle during upgrades. It preserves every row and all 14 columns from the approved workbook; spreadsheet `NULL` and blank cells are stored as JSON `null`. `electron/backend/stationCatalog.js` de-duplicates by `station_key`, exposes the complete records to the searchable Stations control, and derives selectable/random StationID values from rows that contain `station_id`.

Automatic Station assignment shuffles the available `station_id` values and consumes them sequentially, so generated values cannot drift outside the structured source and do not repeat until all available entries have been used. Patient test SSNs use a fixed `999` prefix with a six-digit generated suffix.

`config/seoc_options.json` contains special SEOC pairs that must be visible for explicit selection but must not enter template-driven generation. `electron/backend/referralGenerator.js` merges those selection-only pairs with normal template pairs for the UI while leaving the referral templates unchanged.

## Release boundary

`config/app_version.json` is the canonical release record. `scripts/sync-build-version.js` propagates it to package metadata before start, test, and distribution tasks. `scripts/build-release.js` builds a Windows x64 NSIS Setup installer in a validated temporary directory outside the repository. GitHub Actions performs the authoritative Windows UI, installation, launch, executable, checksum, and release checks.
