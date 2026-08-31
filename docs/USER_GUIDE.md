# CCRS File Processing Framework User Guide

## Version

This guide covers `Version 1.3.11`, including source-backed Station IDs, searchable regular and Situational SEOC selection, consistent Referral/ICN/Archive naming controls, safe live filename previews, batch auditing, and recovery controls.

## Purpose

The CCRS File Processing Framework supports these workflows:

- process existing CCRS referral JSON files
- generate new referral JSON files from the bundled templates
- build a final `.gz` referral package
- process LEIE Excel files with strict duplicate detection
- upload referral or LEIE output to configured CCRS environments
- validate a completed LEIE load in the database and CCRS Table Viewer

## Install and Start the App

Download `CCRS.File.Processing.Framework.Setup.Version.1.3.11.exe` from the GitHub Releases page and run the installer.

The release contains a full Windows Setup installer. Portable executables are not generated.

The installer lets you choose the installation folder. Application files, bundled templates, assets, and documentation are installed with the app. Writable runtime data is stored under the current Windows user's AppData location so the app can run without administrator rights.

Runtime data includes:

- `config`
- `docs`
- `logs`
- `upload_import`

Use `GitHub Releases` for official installers. Build directories such as `dist-electron` and `release` are not part of the project or normal user workflow.

### What's New Release Notes

The app automatically displays the current release notes:

- the first time the app is opened after a new installation
- the first time the app is opened after upgrading from any older version

Select `Start Using The App` to acknowledge the notes. The same release notes will not open again on later launches, but a future release with a new release identifier will display its own notes once. This acknowledgement is stored in the current user's AppData so reinstalling or changing the installation folder does not confuse an older release with a newer one.

Complete current and historical notes are available in the repository's Release Notes document. Published notes and installers for Version 1.3.3 and Version 1.3.2 remain available on the GitHub Releases page.

## Before You Begin

Prepare the items required for your workflow:

- referral processing: a folder containing CCRS `.json` files
- LEIE processing: an Excel file or folder containing `.xlsx`, `.xls`, `.xlsm`, or `.xlsb` files
- an output folder where processed files can be saved
- `WinSCP.ini` or a supported credentials JSON file if upload is required

## Main Areas

The app has three main tabs:

- `Referral Files`
- `LEIE Data Processing`
- `More Features Coming Soon`

`Referral Files` contains two modes:

- `Edit Existing Files`
- `Generate New Files`

## Consistent Controls and Keyboard Use

Text boxes, dropdowns, and date fields use the same 48-pixel control height throughout the application. Related fields share the available row width. Upload User remains compact beside the wider Remote Directory field on the same row, while narrow windows automatically stack them without changing their control height.

Use `Tab` and `Shift+Tab` to move between controls. In a dropdown, use `Arrow Up` or `Arrow Down` to open and move through choices, `Home` or `End` to jump to the first or last choice, `Enter` or `Space` to select, and `Escape` to close the list and return focus to the field. A visible focus outline identifies the active control.

## Workflow Progress and Large Files

The workflow stepper shows `Select`, `Configure`, `Validate`, `Process`, and `Upload`. The status card remains visible near the bottom of the application and identifies the current action, the file or server being handled, and what happens next. When totals are known, it shows completed items and a percentage. Scanning, packaging, connection testing, configuration imports, and diagnostics show visible in-progress feedback even when a numeric percentage is not available.

File processing, LEIE work, gzip creation, upload tests, and uploads run in background workers so the window remains responsive. Select `Cancel` to stop a running process. Referral work is isolated in temporary staging, so cancellation does not alter completed output from earlier runs; stale app-created staging folders are cleaned automatically.

Before any process or generation run starts, the Safety Review displays the workflow, source, output folder, output behavior, expected archive, station plan, and upload destinations. Choose `Go Back` to correct a setting or `Start Safely` to continue. A LEIE upload that includes PROD remains blocked until `PROD` is typed into the confirmation field.

Before processing, the source summary reports available file size and row information. The application protects the computer with configurable safety limits for:

- one source file and the combined source selection
- LEIE worksheet rows
- generated JSON file count
- referrals per generated file
- total referrals in one generated batch

If a source exceeds a safety limit, split it into smaller approved batches or ask the application maintainer to adjust the corresponding `CCRS_MAX_*` environment setting after reviewing available memory and disk space.

## LEIE Data Processing

Use `LEIE Data Processing` to inspect, clean, save, upload, and validate LEIE Excel data.

The `LEIE Data Upload and Validation Guide` button opens the separate detailed LEIE manual from the app.

### Step 1: Select the Source

Choose either:

- one LEIE Excel file
- a folder containing one or more LEIE Excel files

Supported extensions are `.xlsx`, `.xls`, `.xlsm`, and `.xlsb`.

The app scans the source and reports the number of files and rows it can read.

### Step 2: Resolve Duplicate Rows

LEIE duplicate detection always uses strict full-row matching. A row is considered a duplicate only when every column value matches another row after whitespace is trimmed and text is compared without case differences.

The duplicate area shows scan progress, the final result, and duplicate row details.

If duplicates are found, choose one action:

- `Remove duplicates automatically (keep first)` keeps the first matching row and removes later matches
- `Review and fix manually` blocks processing until the source is corrected and rescanned
- `Cancel Process` stops the LEIE workflow

Use `Rescan` after changing the source file manually.

### Step 3: Choose the Output

Select the output folder.

`Output File Name` defaults to the original source file name. The app does not add a `Processed_` prefix or otherwise change the source base name by default.

You may enter a different base name when needed. The saved output is an `.xlsx` workbook, and the live preview shows the final name.

### Step 4: Configure LEIE Upload

Enable `Upload the .xlsx file after processing` only when the processed workbook should be sent to one or more servers.

Supported targets are `DEV`, `PPD`, `SQA`, and `PROD`.

Every LEIE server defaults to this remote directory:

```text
/in/manual_process/
```

This LEIE default is separate from the referral default `/CCRA_Uploads`. Switching workflows changes only a standard default path. A custom remote directory entered by the user is preserved.

For every selected server:

- choose the upload user
- confirm or edit the remote directory
- use `Test Connection` before processing when possible

### Step 5: Save and Upload

Select `Save Processed File` after the duplicate check is complete.

When upload is enabled, the app processes selected servers in order. For each server it:

- shows an `Uploading` state
- transfers the processed `.xlsx` file
- verifies that the remote file exists and has the expected byte size
- marks that server complete only after verification
- closes the connection with a bounded timeout so a stalled disconnect cannot block the workflow
- retries transient failures up to three times with increasing delay
- moves to the next selected server

If one server fails, the app records the error and continues with the remaining selected servers. The final status identifies failed targets. A successfully saved local workbook remains available even when an upload target fails.

### Step 6: Find the ETL Batch ID

After the server processes the uploaded file, use the latest batch log entry to identify the correct `etl_batch_id`.

The in-app example batch ID is:

```text
LEIE0731202606153013
```

Replace it with the actual batch ID for the environment and file being validated.

### Step 7: Run the LEIE Validation SQL

The LEIE Upload area contains an `ETL Batch ID` field and a `Validation SQL` box. Entering a batch ID updates all three batch-ID references automatically.

The SQL box uses color-coded SQL keywords, quoted values, numbers, and comments. It remains selectable, and `Copy SQL` copies the complete plain-text query set.

The current query set is:

```sql
Use ccrsdb;

select * from CLAIM_BATCH_LOG order by last_updated_date desc;-- First get the etl_batch_id

Select File_Name, *
from CLAIM_BATCH_LOG
where etl_batch_id = 'LEIE0731202606153013'
order by Start_date_time desc;

select count(*)
from dbo.LKUP_PROVIDER_SANCTION
where etl_batch_id = 'LEIE0731202606153013';

Select count(*)
from dbo.LKUP_PROVIDER_SANCTION
where etl_batch_id <> 'LEIE0731202606153013'
  and is_current = 'Y';

select * from dbo.LKUP_PROVIDER_SANCTION;
```

Run the SQL in `ccrsdb` for the selected environment. Confirm the file name, timestamps, batch status, loaded row count, and current-record state.

### Step 8: Validate in CCRS UI

Open the CCRS Table Viewer for the same environment, select `CLAIM_BATCH_LOG`, and confirm that the file name, `etl_batch_id`, timestamps, and load status match the database results.

Complete validation in one environment before moving to the next required environment.

## Edit Existing Referral Files

Use `Edit Existing Files` when referral JSON files already exist.

### Source

Choose the folder containing the input `.json` files. The app:

- reads JSON files and ignores unrelated files
- reports the number of source files found
- loads available defaults from the first source file
- displays the current source `ListDate`

### Referral Details

Set the starting referral number, `ListDate`, and any optional overrides. Preview lines update before the workflow runs.

### Output

Choose the output folder and, when needed, a processed JSON base name. Archive naming uses the same selectable option-card design as Referral Number and ICN modes:

- **Referral Number** creates `<ReferralNumber>_Final`.
- **Network Name** creates `<Network>_<ReferralNumber>_Final`.
- **Referral DateTime** adds a filesystem-safe referral date and time.
- **Prefix** adds the selected Referral Number prefix.
- **Custom** accepts a reusable pattern built from the displayed friendly values.

The live preview shows both `.json` and `.gz` names. The app removes illegal Windows filename characters, trailing spaces and periods, and repeated extensions, then adds exactly one extension matching each output format.

The source and output folders must be separate and cannot be nested. Under **If the save folder already has files**, choose **Keep existing files** to preserve unrelated files and stop safely if a new result would reuse an existing name. Choose **Replace folder contents after success** only when the existing contents should be removed after the new batch has processed and packaged successfully in isolation. The selected card is highlighted, and the pre-run review repeats the choice before processing begins.

Examples:

- `batch101` becomes `batch101.json`
- multiple files become `batch101_1.json`, `batch101_2.json`, and so on
- Referral Number mode produces `VA12345_Final.json` and `VA12345_Final.gz`.
- Network Name mode can produce `CCN1_VA12345_Final.json`.
- Referral DateTime mode can produce `VA12345_2026-08-31_162500_Final.gz`.
- A custom pattern can produce `CCRS_VA12345_2026-08-31_Final.json`.

### Run

Select `Run Processing`. The app applies changes, creates processed JSON files, builds the final `.gz`, and uploads the archive when upload is enabled.

If any source file is malformed or cannot be processed, the full batch stops. No incomplete referral archive is created or uploaded. Correct the reported file and run the workflow again.

Each successful archive includes a matching `.manifest.json` file. The manifest records counts, Referral Number uniqueness, station distribution, source and archive SHA-256 hashes, and upload outcomes.

## Generate New Referral Files

Use `Generate New Files` to create referrals from the bundled templates.

Choose:

- the number of JSON files
- the number of referrals per file
- referral details and optional overrides
- output naming

This mode does not require a source folder. It can optionally upload the completed archive to the selected Referral environments. Select `Generate Files` to review and run it.

## Referral Number and ICN

### Referral Number

Choose how generated Referral Numbers should start, then enter the starting number or body once:

- **VA** uses `VA` for every referral.
- **iFAMS** uses `iFAMS` for every referral.
- **VA + iFAMS** alternates the two prefixes across the batch while incrementing one shared sequence.
- **Custom** uses a user-entered prefix containing up to 24 letters, numbers, or underscores.

Numeric bodies are zero-padded; alphanumeric bodies keep the characters the user entered. The live preview shows the first result, and the pre-run review confirms the selected prefix behavior.

Rules:

- letters, numbers, and underscores are allowed in a custom prefix
- the live preview shows the first value
- generated referral numbers remain unique within the run

Examples:

- `1` becomes `VA0000000001`
- `26S600001` becomes `VA26S600001`
- with iFAMS, `26S600001` becomes `iFAMS26S600001`
- with VA + iFAMS, the same sequence alternates `VA26S600001`, `iFAMS26S600002`, and so on
- with the custom prefix `CCRS`, `26S600001` becomes `CCRS26S600001`
- with the custom prefix `VA_TEST_`, `12345` begins with `VA_TEST_`

### ICN

Open `Show Additional Fields` to configure ICN generation. ICN modes use the same option-card styling as Referral Number and Archive naming.

Available modes are:

- keep `TEST` and generate the remaining characters
- keep `TEST` and enter a custom alphanumeric suffix
- enter a custom full ICN base and generate the remaining characters
- build each ICN directly from its Referral Number by removing the selected `VA`, `iFAMS`, or custom prefix and adding `TEST`; for example, `VA26S600001` becomes `TEST26S600001`

Generated ICNs remain unique. Choose `3`, `4`, or `5` to make the ending of each ICN match the ending of its Referral Number.

## Patient Identity Controls

### SSN and DOB

Random generation is enabled by default. Each patient receives a different random test SSN and random DOB. Every generated SSN starts with `999`; only the remaining six digits change.

Uncheck the corresponding random option only when a fixed value must be applied. Fixed SSNs must also begin with `999` and use the displayed `999-99-0001` format. Dates must use `YYYY-MM-DD`.

### Stations

Stations is one searchable multi-select dropdown. Leave it in automatic mode to keep the source StationID unchanged, select one station to apply it throughout the batch, or select several stations to mix them across the generated referrals. The separate all-stations option uses the complete selectable catalog.

The dropdown is driven by `config/stations.json`, the structured conversion of the approved Excel sheet. Every spreadsheet row and all source columns are retained. The menu clearly displays and searches these five values:

- `station_key`
- `station_id`
- `visn_id`
- `station_name`
- `parent_station_id`

Type any part of those values, then select each matching station. Selected stations appear as removable chips below the search field. A source row without `station_id` remains visible for completeness but is disabled because it cannot provide a StationID.

For faster searching, the dropdown displays at most 60 rows at once while searching the complete station catalog. Continue typing when the result summary indicates that more matches are available.

Rules:

- a selected Station ID is never padded or extended
- a Station ID is not rejected solely because of its length; exact source-backed values such as `675GB01` and `595GF01` remain unchanged
- every selected value must exactly match `station_id` in `config/stations.json`
- subset mode assigns only the stations selected by the user
- all-stations mode uses only rows that contain `station_id`
- randomized IDs change between referrals without repeating until the selected set or full reference list is exhausted
- the shipped structured source is refreshed during app upgrades

### SEOC Number - SEOC ID

The regular and red-labeled **Situational SEOC Number - SEOC ID** controls share the Stations selector's search, menu, chip, focus, and scroll behavior. Leave either selector in automatic mode to preserve existing values, select one pair, select several pairs to mix them across referrals, clear chips, or choose the independent use-all option.

Each displayed record combines its logical name and source Number, for example `PMR_ACUPUNCTURE INITIAL - 1`. The exact latest versioned SEOC ID remains paired with that Number and is written to referral data; the app never combines the Number from one record with the ID from another.

The bundled `config/seoc_options.json` contains 761 deterministic logical records converted from `SEOC.xlsx`. Search covers the display name, source Number, and exact versioned ID. At most 60 results are rendered at once; keep typing to narrow a larger result set.

Selections and use-all choices are saved independently for regular and Situational SEOC. When the app reopens, valid selections return. A saved record that no longer exists in a refreshed catalog is removed safely and that selector falls back to automatic behavior.

## Other Optional Referral Fields

Supported optional fields include:

- Payment Authority Code
- Network
- Referral Category
- Referral Date
- Referral Date Time
- Referral Expiration Date
- Referral Last Update Date
- Referral Period
- Referral Consult ID

Payment Authority Code accepts up to five numeric digits. Later generated referrals increment the value so it remains unique.

Network values are `CCN1`, `CCN2`, `CCN3`, `CCN4`, and `CCN5`.

If an optional field is blank, the app keeps the source value unless that field's selected mode explicitly generates a value.

## Referral Upload

Referral processing uploads the final `.gz` archive. Enable `Upload the .gz file after processing`, select one or more targets, choose the user, and confirm the remote directory.

Referral Files can be uploaded only to these servers:

- `DEV`
- `PPD`
- `SQA`

`PROD` is not displayed and is rejected by the Referral backend. It remains available only for the separate LEIE Data workflow.

The standard referral remote directory is:

```text
/CCRA_Uploads
```

This location is specific to CCRS Referral uploads. LEIE Data uploads use the separate default `/in/manual_process/`.

Target toggles remain disabled until the main upload option is enabled.

If one destination fails after the local artifact is complete, the app records the failed target and continues recording the completed ones. Select `Retry Failed Uploads` to resend the existing artifact only to the failed destinations. Do not rerun generation or processing unless the underlying data must change.

## Current Run Result Actions

After the current run completes, the app shows the actions that apply to that result:

- `Open Output Folder`
- `View Batch Manifest` for referral runs
- `Copy Output Path`
- `Retry Failed Uploads` when a target still needs attention

## Upload Credentials

The app uses runtime copies of:

- `config\upload_profiles.json`
- `config\upload_credentials.json`

Use `Import To Config` to import `WinSCP.ini` or a supported credentials JSON file. The app does not automatically search arbitrary machine locations for credentials.

Importing WinSCP settings reads the saved sessions, resolves servers and users, and writes the active credentials configuration under the app's runtime data location.

On Windows, imported passwords are encrypted using operating-system-protected Electron safe storage. Existing plaintext credential files are migrated automatically when the application can access Windows encryption. The original JSON or INI file selected for import is preserved.

Each upload target includes `Test Connection`. Use it to verify the selected account and remote directory before a full workflow.

## Validation and Status Messages

The app validates fields before running and displays messages next to invalid inputs.

Validation includes:

- SSN `999` prefix and format
- Referral Number format
- Station ID reference match
- Payment Authority Code range
- date and date-time format
- generator counts
- selected upload user
- remote upload directory
- LEIE duplicate resolution

Status messages use specific action names instead of a generic idle or working message. Common statuses include:

- `Ready`
- `Scanning Referral Files`
- `Scanning LEIE`
- `Testing Connection`
- `Processing`
- `Packaging`
- `Archive Ready`
- `Duplicates Found`
- `Ready to Save`
- `Uploading`
- `Uploaded`
- `Upload Complete`
- `Upload Warning`
- `Failed`

During a long operation, the progress area reports the current file or server, completed count, and percentage when the backend supplies a total. An animated indeterminate bar confirms that work is continuing during steps such as archive creation. `Cancel` remains available even though editing controls are temporarily disabled. Referral and LEIE uploads report each server independently and continue through later selected servers after an individual failure.

## Diagnostic Report

Select `Export Diagnostics` in the application header and choose a folder. The generated JSON report contains the application version, runtime versions, processing limits, non-sensitive workflow preferences, reference-data counts, and upload server/user counts. It does not contain passwords, credential values, input paths, output paths, or source file contents.

## Referral Output Format

The final `.gz` contains one combined JSON object:

```json
{
  "ListDate": "YYYY-MM-DD hh:mm:ss",
  "Referrals": [
    {}
  ]
}
```

## Files and Cleanup

The packaged app opens `docs\USER_GUIDE.pdf` when the User Guide is requested.

General behavior:

- generated JSON files use lowercase `.json`
- one `.gz` archive is created per referral-processing run
- existing `.gz` files are not deleted automatically
- processed JSON files may be kept or removed after archive creation
- app-created staging folders and temporary upload helper files are cleaned after a run or when the app closes
- release binaries are distributed through GitHub Releases rather than stored in the source repository

## Troubleshooting

### LEIE Output Name Is Unexpected

Select or rescan the source. The default should match the original source base name. Clear a custom value if you want the original name restored.

### LEIE Upload Appears Stuck

Check the individual server status. The app verifies the remote file and limits disconnect waiting time. If a server reports an error, review its user, path, and connection test; later selected servers are still attempted.

### A Large File Is Rejected

Review the displayed file size or row count. Split the source into smaller approved batches. Do not raise a safety limit without confirming that the workstation has enough memory and disk space.

### A Job Was Cancelled

Check the output folder for an incomplete workbook, JSON file, or gzip archive. Remove incomplete output before running the same job again.

### Upload Target Is Disabled

Enable the main upload checkbox first, then enable each required server.

### No Upload Profiles Are Available

Use `Import To Config` and select the approved `WinSCP.ini` or credentials JSON file.

### LEIE Processing Is Blocked

Resolve duplicates automatically, or correct them in the source and select `Rescan` before saving.

### SQL Uses the Example Batch ID

Paste the actual `etl_batch_id` into the in-app field before selecting `Copy SQL`.
