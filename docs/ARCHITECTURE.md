# Architecture

## Purpose

The CCRS File Processing Framework is an evolving team automation application. Its long-term purpose is to automate more repetitive team work, reduce manual effort, and give team members more time for meaningful testing, defect discovery, and prevention before production. LEIE and referral processing are the first two supported workflows, not the limit of the application. Additional capabilities can be prioritized and added as team needs evolve; they are not available until implemented and validated.

The current local Electron application implements referral and LEIE workflows. New workflows should reuse the existing UI, background-job, validation, progress, and upload boundaries where appropriate. This is a development direction, not a claim that arbitrary workflows or plugins are supported today.

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

`electron/renderer/jobUi.js` keeps the sticky status area synchronized with the workflow stepper. Determinate backend events show item counts and percentages; indeterminate operations remove the native progress value so Windows displays ongoing activity. Renderer messages identify scanning, validation, processing, packaging, connection tests, uploads, diagnostics, completion, warnings, and failures without exposing sensitive paths or credentials.

`electron/renderer/runReview.js` owns the pre-run safety review and production confirmation state. Backend events include structured `phase`, `state`, `current`, `total`, and message fields; the renderer still accepts legacy positional events from the separate LEIE implementation while it migrates.

## Data and security boundary

Runtime data is copied to the current Windows user's AppData area. Upload credentials are protected with Windows-provided encryption after import. Local credentials, WinSCP imports, logs, generated output, and temporary work directories must not be committed.

`electron/backend/workflowPolicy.js` is authoritative for upload environments and display order. The renderer consumes that policy from application information, and the backend validates it before resolving credentials. Referral Files allow SQA, DEV, and PPD. LEIE allows SQA, DEV, PPD, and PROD; the renderer also requires typed confirmation before a PROD run. Selected destinations are uploaded one at a time through a shared queue (`uploadTargetsSequentially`) and report results independently: each destination is attempted once per run, a failure moves on to the next destination, and only failed destinations are retried, on request.

`electron/backend/batchSafety.js` canonicalizes paths, rejects identical or nested source/output folders, owns isolated run staging, calculates SHA-256 values, detects output collisions, and promotes complete artifacts. `referralValidator.js` performs the versioned source-shape preflight. `runHistory.js` stores at most 20 sanitized run summaries in AppData and intentionally excludes credentials and source contents.

Referral processing is fail-closed: all files must pass validation and transformation, Referral Numbers must be unique, and the gzip must complete in staging before any result is promoted. The generated manifest provides the business and file-integrity audit record. Upload failures do not invalidate the local artifact; failed destinations can be resolved from current protected credentials and retried without rebuilding the batch.

`config/stations.json` is the authoritative shipped station source and is refreshed from the application bundle during upgrades. It preserves every row and all 14 columns from the approved workbook; spreadsheet `NULL` and blank cells are stored as JSON `null`. `electron/backend/stationCatalog.js` de-duplicates by `station_key`, exposes the complete records to the searchable Stations control, and derives selectable/random StationID values from rows that contain `station_id`.

The renderer indexes station search text once when application information loads, leaves the dropdown DOM empty until it is opened, coalesces search input with `requestAnimationFrame`, and caps each rendered result page at 60 rows. Workflow cards use isolated layout and paint containment, duplicate previews are served from an in-memory signature cache, and unchanged UI settings are not written again.

Automatic Station assignment shuffles either the user's selected `station_id` subset or the complete selectable catalog and consumes it sequentially, so generated values cannot drift outside the structured source and do not repeat until the active set has been used. Station validation relies on exact catalog membership rather than a hardcoded length ceiling. Patient test SSNs use a fixed `999` prefix with a six-digit generated suffix. Referral generation maintains one sequence across all files in a batch and supports a fixed `VA`, fixed `iFAMS`, combined `VAiFAMS`, or validated custom letters/numbers/underscore prefix without a character ceiling. The referral-match ICN mode removes the selected prefix, adds `TEST`, and reserves ending space for a batch-sequence marker when a long Referral Number must be shortened to the required 17-character ICN format.

`config/seoc_options.json` is the deterministic regular runtime conversion of `SEOC.xlsx`. `config/situational_seoc_options.json` is the nine-record, manually selected Situational catalog. `scripts/import-seoc.js` maps `seoc_source_key/Number` and `seoc_id`, removes repeated version rows by logical Number/name identity, excludes every Situational identity from the regular output, retains the latest exact regular source SEOC ID, and sorts the result. The renderer builds separate search indexes and selector-key maps, displays the exact ID above its Number, and warns whenever an explicit selection is active. The backend resolves regular and Situational keys only against their own catalogs and applies each paired Number/ID record together.

`electron/backend/zipper.js` owns the reusable filename token model and Windows-safe normalization. Referral Number, Network, Referral DateTime, and Custom modes resolve the same tokens for processed JSON and gzip names, then add exactly one format-appropriate extension. Custom mode receives an ordered selection of Referral Number, Referral Prefix, Network Name, Date, Date and Time, and Custom Text values from the renderer's checkbox builder.

The renderer uses `.choice-card` and `.choice-card-grid` as the shared option-selection component for Referral Number, ICN, Archive naming, output behavior, duplicate handling, and equivalent checkbox choices. The base component owns compact spacing, typography, two-column layout, and interaction states; `.choice-card--compact` is reserved for dense secondary choices such as Custom Archive values. Responsive rules collapse every option grid to one column without introducing horizontal overflow.

Native `<details>` elements use the shared `.context-help` system for progressive, keyboard-accessible explanations near complex decisions. They require no renderer state, remain closed by default, adapt to light and dark themes, and collapse their explanation grids to one column at the shared responsive breakpoint.

## Release boundary

`config/app_version.json` is the canonical release record. `scripts/sync-build-version.js` propagates it to package metadata before start, test, and distribution tasks. `scripts/build-release.js` builds a Windows x64 NSIS Setup installer in a validated temporary directory outside the repository. GitHub Actions performs the authoritative Windows UI, installation, launch, executable, checksum, and release checks.

## Version 1.5 pipeline

Team payment codes are bundled in config/payment_authority_codes.json. outputValidation.js checks generated fields and SEOC pairs against selected catalog sets before packaging. zipOutput streams the combined JSON to gzip and optional master output. batchSafety promotes only the current run files, backing up overwritten files for rollback. Both LEIE and referrals call uploadTargetsSequentially; implicit retries are disabled.


### Local 1.5.1 update

Payment Authority Code uses the same searchable, multi-select chip control as SEOC. Selecting all clears the subset; selections are saved between sessions. New referrals default to current local dates and an expiration based on Referral Period (990 days by default). Editing a date switches to custom dates; checking Use current dates restores automatic dates. Existing source files are not rewritten by this default. Master JSON is formatted with four-space indentation and combines numbered files in natural numeric order. Regression coverage checks current and custom dates, leap-year expiration, selection persistence, master equality, and ordering beyond nine files.


### Optional manifest export (1.5.3)

Jobs validate output automatically but no longer write a manifest into the output folder. After a referral job finishes, Generate Manifest exports batch details from the saved run history. Export checks retained files against their original hashes and rejects changed or missing files. Existing manifests are not deleted. The current-dates control uses a compact title and helper line.
