# CCRS File Processing Framework Version 1.3.9

## Unreleased UI Simplification

- Removed Generation preset, Preset name, and their saved-settings controls.
- Removed the Recent Runs section from the interface.
- Kept the current run's status, progress, primary action, manifest, output-folder, copy-path, and failed-upload retry controls.
- Changed the run panel from a floating overlay to a normal final workflow section so it does not cover other fields.

## [Version 1.3.9](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.9) Release Notes

### Release Summary

Version 1.3.9 makes file processing safer, more auditable, and easier to recover. It prevents source/output path mistakes, isolates each referral run before publishing results, blocks incomplete batches, adds a pre-run safety review, records batch manifests and recent runs, and retries failed uploads without repeating file generation.

The GitHub Release contains:

- `CCRS.File.Processing.Framework.Setup.Version.1.3.9.exe`
- `SHA256SUMS.txt`

### File and Batch Safety

- Source and output folders must be different and cannot be nested inside each other.
- Referral work runs in an isolated staging folder, so `Keep existing files` no longer removes or packages unrelated JSON files.
- Existing-name collisions stop the run instead of overwriting an unrelated file.
- `Delete everything first` is applied only after the staged batch has processed and packaged successfully.
- Referral JSON is checked for a valid top-level object and `Referrals` array before transformation.
- Any schema or processing failure stops the full batch before an archive or upload can be produced.
- Duplicate generated Referral Numbers stop the batch before publishing.
- LEIE output is also staged and refuses unsafe source/output relationships or silent output replacement.

### Review, Progress, and Environment Controls

- Every run opens a safety review showing workflow, source, output, output behavior, archive, station plan, and upload destinations.
- LEIE production upload requires the user to type `PROD` in the safety review.
- The backend is authoritative for Referral DEV/PPD/SQA and LEIE DEV/PPD/SQA/PROD target policy.
- Structured progress phases drive the workflow stepper instead of relying only on matching visible message text.
- Cancellation confirms that completed results from earlier runs were not changed.

### Audit and Recovery

- Every referral archive receives a `.manifest.json` report containing application version, timestamps, counts, Referral Number range and uniqueness, ICN mode, station distribution, source hashes, archive hash, and upload outcomes.
- Recent Runs keeps the latest 20 sanitized results in the current user's AppData.
- Result actions open the output folder, open the batch manifest, and copy the output path.
- Failed destinations can be retried from the existing local artifact; successful destinations are not uploaded again.
- A retry refreshes both the run history and manifest upload result.

### Reusable Settings and Maintainability

- Named generation presets save reusable referral settings while excluding input/output folders and upload credentials.
- Safety, schema validation, environment policy, run history, and pre-run review live in focused modules.
- New regression tests cover identical/nested folders, malformed input, fail-closed behavior, output preservation, manifest hashes, centralized policy, and the new UI controls.

## Version 1.3.8 Historical Release Notes

## Release Summary

Version 1.3.8 is the consolidated user release. It includes the referral-generation and responsiveness improvements released internally as Version 1.3.7, removes PROD from Referral Files uploads, and gives users clearer status and progress feedback throughout the application.

The GitHub Release contains:

- `CCRS.File.Processing.Framework.Setup.Version.1.3.8.exe`
- `SHA256SUMS.txt`

## Referral Upload Environments

- Referral Files expose only DEV, PPD, and SQA upload targets.
- PROD is hidden on Referral screens and rejected by backend validation even if an older saved setting or crafted request includes it.
- LEIE Data remains a separate workflow and retains DEV, PPD, SQA, and PROD upload support.

## Status and Progress Experience

- The sticky status area starts with workflow-specific readiness guidance instead of a generic idle message.
- Scanning, importing configuration, validating, processing, packaging, connection testing, uploading, diagnostics, cancellation, completion, warnings, and failures use clear action-specific messages.
- File and server work shows completed counts and percentages when totals are known.
- Steps without numeric totals use visible indeterminate progress so the app never appears idle while it is working.
- Referral archive creation reports dedicated Packaging and Archive Ready phases between file processing and upload.

## Included Internal Version 1.3.7 Improvements

- ICNs can be derived directly from Referral Numbers, including `VA26S600001` or `iFAMS26S600001` becoming `TEST26S600001`.
- Generated Referral Numbers remain unique across the complete batch.
- Multiple selected stations are shuffled across all generated referrals.
- Optional iFAMS prefixes and timestamped JSON/gzip naming remain included.
- Deferred station rendering, cached previews, debounced settings, smoother transitions, and Electron 44 remain included.

## Regression Coverage

- Smoke coverage rejects PROD for Referral processing before credential resolution and protects the determinate/indeterminate progress structure.
- Windows Electron coverage confirms Referral shows exactly DEV, PPD, and SQA while LEIE still shows PROD.
- The full referral-generation and station-selection regression coverage from Version 1.3.7 remains active.

## Documentation

- README, architecture, testing, release notes, User Guide, and generated PDFs describe the consolidated Version 1.3.8 user release.
- Version 1.3.7 is retained below as an internal release record.

## [Version 1.3.7](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.7) Internal Release Notes

Version 1.3.7 was released internally. Its features are included in the consolidated Version 1.3.8 user release.

### Release Summary

Version 1.3.7 improves high-volume referral generation with referral-derived ICNs, unique Referral Numbers, multi-station assignment, predictable iFAMS naming, and a faster station-selection experience.

The internal GitHub Release contains:

- `CCRS.File.Processing.Framework.Setup.Version.1.3.7.exe`
- `SHA256SUMS.txt`

### Referral and ICN Generation

- Adds an ICN mode that derives the value from each Referral Number: `VA26S600001` or `iFAMS26S600001` becomes `TEST26S600001`.
- Guarantees unique generated Referral Numbers across the entire batch, including batches split across multiple JSON files.
- Adds an optional iFAMS prefix for generated Referral Numbers.

### Multi-Station Assignment

- The Stations control supports selecting multiple station rows and displays the selection as removable chips.
- Selected Station IDs are shuffled across all referrals in the generated batch.
- A single selected station still applies consistently, and the existing all-stations random mode remains available.

### File Naming

- Generated gzip archives use the current timestamp in the form `referrals_YYYYMMDD_HHMMSS.gz`.
- An optional iFAMS naming setting prefixes generated JSON and gzip file names.

### Responsiveness and Dependencies

- The station catalog is indexed once and search results are limited to a focused visible set instead of rendering all 1,573 rows at startup.
- Preview work, settings writes, and station interactions are coalesced or debounced to reduce unnecessary UI work.
- Subtle transitions and reduced-motion support make interactions feel smoother without compromising accessibility.
- Electron is updated to Version 44, with current direct dependencies and no known production audit vulnerabilities at release preparation time.

### Regression Coverage

- Smoke tests cover referral-derived ICNs, batch-wide uniqueness, multi-station distribution, and iFAMS/timestamp naming.
- Windows Electron end-to-end coverage verifies the updated multi-select station interaction and generation workflow.

### Documentation

- README, architecture, testing, release notes, User Guide, and generated PDFs describe the Version 1.3.7 workflows.

## [Version 1.3.6](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.6) Release Notes

## Release Summary

Version 1.3.6 replaces the reduced legacy Station ID list with a complete structured conversion of the approved station workbook. The application exposes one optional Stations selector that makes the five requested station identifiers clear and searchable while preserving all workbook fields for application use.

The GitHub Release contains:

- `CCRS.File.Processing.Framework.Setup.Version.1.3.6.exe`
- `SHA256SUMS.txt`

## Structured Station Source

- Converts all 1,573 rows and all 14 columns from the approved station workbook into `config/stations.json`; blank and `NULL` cells become JSON `null`.
- Uses that structured file as the application's main station source.
- Replaces the Station ID lookup with one optional Stations control that searches and displays `station_key`, `station_id`, `visn_id`, `station_name`, and `parent_station_id`.
- Keeps SEOC Number and SEOC ID optional and labels their blank choices clearly.

## Selection and Data Behavior

- Selecting a station applies its exact `station_id` to referral data.
- All 1,573 source rows remain searchable and visible; 1,572 rows have a selectable `station_id`.
- The single row without `station_id` is retained for completeness and clearly disabled in the selector.
- Manual and random Station IDs must come from the same structured source.

## Regression Coverage

- Smoke tests verify the full row count, all 14 source columns, unique station keys and IDs, null conversion, packaged upgrade refresh, and reference-only assignment.
- Electron end-to-end coverage searches the structured station data, selects Tremont VA Clinic, and verifies generated referrals use only source-backed station IDs.

## Documentation

- README, architecture, development, testing, release notes, User Guide, and generated User Guide PDF describe the new source and workflow.
- The workbook import can be repeated with `pnpm data:stations -- /path/to/stations.xlsx`.

## [Version 1.3.5](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.5) Release Notes

## Release Summary

Version 1.3.5 refines the upload-target form layout introduced by Version 1.3.4. Upload User now remains compact while the longer Remote Directory value receives more horizontal room, without changing the established control height, responsive behavior, accessibility, or upload workflow.

The GitHub Release contains:

- `CCRS.File.Processing.Framework.Setup.Version.1.3.5.exe`
- `SHA256SUMS.txt`

## Proportional Upload Fields

- Upload User occupies two-fifths of the available wide-screen row and Remote Directory occupies three-fifths.
- The 40/60 proportion gives typical remote paths more room while keeping the shorter user value easy to scan.
- Both controls stay aligned along the same top edge and continue to use the shared 48-pixel control height.
- Narrow windows continue to stack the fields into a single readable column.

## Regression Coverage

- The Electron end-to-end test verifies that Remote Directory is wider than Upload User at the expected 3:2 ratio.
- The same test verifies that both fields remain vertically aligned on wide layouts.
- The cross-platform smoke suite protects the responsive grid definition and Setup-only release contract.

## Station ID Selection Reliability

- The Station ID menu stays open while keyboard or pointer focus moves from its search field to an option inside the menu.
- Choosing an option still closes the menu, fills the exact reference-backed Station ID, and refreshes the referral preview.
- The Windows Electron end-to-end test selects Tremont VA Clinic and verifies its exact `614GA01` Station ID.

## Documentation and Release History

- The README and User Guide now identify Version 1.3.5 and its Setup installer.
- Historical sections link directly to the published Version 1.3.4, Version 1.3.3, and Version 1.3.2 GitHub Releases.
- The generated User Guide PDF and LEIE Upload and Validation Guide PDF are refreshed for the release package.

## [Version 1.3.4](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.4) Release Notes

Version 1.3.4 completed an application-wide control-system pass so form fields remain visually consistent, responsive, keyboard accessible, and easier to use in both light and dark themes.

### Unified Form Controls

- Standard text boxes, native selects, compact dropdowns, and date composites use one 48-pixel height, shared padding, and the same corner radius.
- Form controls no longer stretch because a neighboring field has longer helper text.
- Upload user and remote-directory fields share one row on wide layouts and stack cleanly on narrow layouts.
- One-off fixed dropdown and text-box widths have been removed from the upload workflow.

### Keyboard and Accessibility Improvements

- Dropdowns open and navigate with the Arrow keys and support Home, End, Enter, Space, and Escape.
- Dropdown triggers expose their controlled menu and accurately reflect disabled and invalid states.
- Buttons, dropdown choices, radio chips, and checkbox chips provide interaction targets of at least 44 pixels.
- Focus indicators and accessible labels are present across visible enabled form controls.
- Muted text and active controls have improved contrast in light and dark themes.

### Automated UI Regression Coverage

- The Electron end-to-end test measures every visible standard text box and dropdown on Referral and LEIE screens and requires the shared 48-pixel height.
- The test rejects undersized interaction targets, unnamed enabled fields, invalid upload-field proportions, and broken keyboard dropdown selection.

## [Version 1.3.3](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.3) Release Notes

### Correct Test SSNs

- Every automatically generated test SSN starts with `999`.
- The remaining six digits change for each patient, producing values in the `999-00-0000` through `999-99-9999` test range.
- Generated SSNs do not repeat within the supported referral-generation limit.
- A fixed SSN is accepted only when it starts with `999` and uses the `999-99-0001` display format.

### Reference-Only Automatic Station IDs

- Automatic mode shuffles the installed Station ID reference list and assigns only exact `stationKey` values from that list.
- Each referral receives a changing Station ID without repeats until the 1,570-entry list is exhausted.
- Output validation tests compare every automatic value with the same list displayed by the application.
- Manual Station ID entry still requires an exact reference match.

### Special Selection-Only SEOCs

The following synchronized pairs are available in both SEOC selectors. They are never automatically introduced by the bundled generator and are applied only when explicitly selected:

| SEOC key | SEOC ID |
| --- | --- |
| `67` | `INF_FERTILITY-1332 EXISTING OVARY_1.1.17` |
| `158` | `EUC_EMERGENCY CARE_1.2.8` |
| `191` | `EUC_POM USE ONLY UNAUTHORIZED EMERGENCY ROOM CARE_1.1.7` |
| `233` | `SSC_TRANSPLANT BONE MARROW COMP EVAL_1.5.14_REV` |
| `268` | `MHC_MENTAL HEALTH RESIDENTIAL TREATMENT_1.15.7` |
| `1160` | `MHC_RESIDENTIAL WITHDRAWAL MANAGEMENT_1.22.2` |

## [Version 1.3.2](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.3.2) Release Notes

### Correct DIM_VA_STATION IDs

- Catalog row number `2242` is replaced by the actual Tremont VA Clinic Station ID `614GA01`.
- All 1,577 source rows were re-evaluated; the app now exposes 1,570 unique valid Station IDs after removing duplicates, test records, and an obsolete `_OLD` entry.
- Manual and random Station ID modes use the corrected catalog.
- Valid VA Station IDs from three through seven characters are supported.
- Upgrades refresh the shipped Station ID catalog so an older installed catalog cannot continue producing synthetic values.

### Compact Dropdowns

- Referral / ICN Match, Network, SEOC Number, SEOC ID, and every other dropdown now use one consistent design.
- Long lists remain inside a 260-pixel scrollable menu instead of expanding across the application window.
- Selected values are shortened visually with an ellipsis when needed; the stored value remains unchanged.
- Dropdowns retain keyboard access, disabled states, and the existing field behavior.

### Separate Referral and LEIE Upload Workflows

- CCRS Referral processing uploads the final `.gz` archive and defaults every Remote Directory field to `/CCRA_Uploads`.
- LEIE Data processing uploads the processed `.xlsx` file and defaults every Remote Directory field to `/in/manual_process/`.
- Each Remote Directory note identifies its workflow's default and explicitly contrasts it with the other workflow.
- Switching workflows changes recognized standard defaults without replacing a custom remote directory entered by the user.
- Smoke and Windows Electron end-to-end tests verify both visible defaults and workflow switching behavior.

### Performance and Large Files

- File processing, generation, LEIE work, upload tests, compression, and uploads run in background workers instead of blocking the window.
- A visible progress bar and Cancel control keep long operations understandable and interruptible.
- LEIE worksheets use SheetJS dense mode for more efficient large-sheet processing.
- Source file size, combined size, LEIE rows, generated files, referrals per file, and total generated referrals have explicit safety limits.
- Source summaries display file size and row information before processing.
- Referral gzip output is streamed to disk instead of constructing the entire combined archive in memory.

### Upload Reliability and Security

- Referral and LEIE uploads retry transient failures with exponential backoff.
- Every selected server is attempted even when another target fails, with independent status reporting.
- Remote file size remains verified before an upload is considered complete.
- Imported upload credentials are encrypted with Electron safe storage on Windows.
- Existing plaintext credential files migrate automatically when encryption is available.
- Importing a credentials JSON file no longer removes or modifies the original source file.

### User Experience and Accessibility

- A Select, Configure, Validate, Process, and Upload stepper makes workflow position clear.
- The action and status card remains visible near the bottom of the window.
- Status updates use an accessible live region, with improved tab, theme, and date-control semantics.
- The minimum window size is reduced and narrow layouts reorganize into readable columns.
- Release notes continue to use the full application window with independent scrolling and a Start Using The App button.

### Existing Workflow Features

- Original LEIE source name remains the default output name.
- Strict full-row duplicate detection and optional automatic removal remain available.
- LEIE uploads default to `/in/manual_process/`; referral uploads default to `/CCRA_Uploads`.
- Station IDs stay exact or use valid reference entries, Referral Number and ICN endings can match by 3, 4, or 5 characters, SSNs and DOBs randomize by default, and SEOC fields remain synchronized.
- Batch-ID-aware, syntax-highlighted SQL validation remains available.
