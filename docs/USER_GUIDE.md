# CCRS File Processing Framework User Guide

## Purpose
This app helps CCRS users process referral JSON files, process LEIE Excel files, generate new referral files, build the final `.gz` package, and optionally upload the finished archive to the configured CCRS environments.

## Quick Start
Before you run the app, make sure you have:
- a source folder with CCRS `.json` files if you are editing existing files
- an output folder where processed files should be saved
- a `WinSCP.ini` file or a ready-to-use `config\upload_credentials.json` file if you plan to upload

To start the packaged app:
- open the folder that contains the `.exe`
- run either `CCRS File Processing Framework Setup Production V1.2.exe` or `CCRS File Processing Framework Production V1.2.exe`

When you use the Setup installer, choose the install folder you want for the app.

The installed app keeps its shipped `.exe`, docs, assets, templates, and bundled files inside that app folder.

On first run, the app creates or updates runtime folders for config, logs, docs, and upload helper files.

If you install the app with the Setup installer, those runtime folders are stored under the current user's AppData location so the app can run without administrator rights.

If you use the portable `.exe`, those runtime folders stay next to the portable app.

Typical runtime folders include:
- `config`
- `docs`
- `logs`
- `upload_import`

Use the files in that generated runtime folder next to the `.exe`, not the source-code repo folder.

## Main Areas
The app currently has three main workflow tabs:
- `Referral Files`
- `LEIE Data Processing`
- `More Features Coming Soon`

Inside `Referral Files`, there are two working modes:
- `Edit Existing Files`
- `Generate New Files`

## LEIE Data Processing
Use this tab when you need to process LEIE Excel files and detect duplicate rows.

At the top of the LEIE Source section, use `LEIE Data Upload and Validation Guide` to open the full manual:
- `docs\LEIE_UPLOAD_VALIDATION_GUIDE.md`

### 1. Source
Choose either:
- a single LEIE Excel file (`.xlsx`, `.xls`, `.xlsm`, `.xlsb`)
- a folder that contains LEIE Excel files

### 2. Duplicate Detection
The app runs strict duplicate detection using full-row matching only.

A row is treated as duplicate only when all column values match another row after:
- trimming whitespace
- converting to lowercase

The `Current Result` field shows:
- scan progress while detection runs
- final result when completed (for example, duplicate rows found or no duplicates found)

### 3. Output
Choose where the processed LEIE file should be saved and optionally set the output file name.
The app always shows a live output preview in this section.

### 4. Save
Use `Save Processed File` after duplicate checks are complete.

## Edit Existing Files
Use this mode when you already have referral JSON files and want to update them.

### 1. Source
Choose the folder that contains the input `.json` files.

The app will:
- read `.json` files only
- ignore non-JSON files
- load defaults from the first JSON file it finds
- show how many source files were found
- show the current default `ListDate`

### 2. Referral Details
Use this section to control the first referral number, `ListDate`, and optional field overrides.

The preview lines update live so you can see what the app will generate before you run it.

### 3. Output
Use `Save To` to choose the output folder.

Then enter:
- the full output JSON base name
- the final `.gz` archive name
- optional archive naming add-ons such as `Network` and `Referral DateTime`

The app adds `.json` and `.gz` automatically.

Examples:
- `batch101` becomes `batch101.json`
- if multiple source files are processed, the app creates `batch101_1.json`, `batch101_2.json`, and so on
- `ccra_referrals_20260326` becomes `ccra_referrals_20260326.gz`
- `customname` with archive add-ons can become `customname_CCN1_20260401_134500.gz`

### 4. Run
Use `Run Processing` when you are editing existing files.

The app will:
- apply the requested changes
- create processed `.json` files
- build the final `.gz` archive
- optionally upload the archive if upload is enabled

## Generate New Files
Use this mode when you want the app to create referral files from scratch.

In this mode you can:
- choose how many JSON files to create
- choose how many referrals should be in each file
- use the same referral details and naming rules as the edit flow

This mode does not require a source folder and does not include upload.

Use `Generate Files` to run this workflow.

## Referral Details
### Referral Number
Enter only the user-controlled portion of the referral number.

Rules:
- the app adds `VA` automatically
- the final value is always 12 characters total, including `VA`
- letters and numbers are allowed
- the preview shows the first generated value live
- each generated `ReferralNumber` stays unique within the run

Examples:
- `1` becomes `VA0000000001`
- `eldin` becomes `VA00000eldin`

### List Date
If you do not edit the date and time fields, the app keeps the source `ListDate` or the current live time, depending on the workflow.

### Optional Fields
Click `Show Optional Fields` to open the additional override fields.

If a field is blank, the app keeps the original value unless that field is designed to auto-generate from your starting input.

Supported optional fields:
- `SSN`
- `ICN`
- `Station ID`
- `Payment Authority Code`
- `DOB`
- `Network`
- `Referral Category`
- `Referral Date`
- `Referral Date Time`
- `Referral Expiration Date`
- `Referral Last Update Date`
- `Referral Period`
- `Referral Consult ID`

### ICN
The `ICN` controls are inside `Show Optional Fields`.

You can choose one of three formats:
- keep `TEST` and let the app generate the remaining characters automatically
- keep `TEST` and enter your own letters and numbers for the custom portion
- enter a custom full ICN base and let the app generate the remaining characters automatically

Rules:
- the `TEST` custom value accepts letters and numbers
- the app keeps each generated ICN unique within the run
- if you leave ICN on the default option, the app still generates a different `TEST...` ICN for each referral

### Station ID
Rules:
- choose from the dropdown suggestions powered by `station_key` and `station_name`, or type your own value
- when you choose a suggestion, the saved value is the `station_key`
- accepts letters and numbers only
- accepts up to 5 characters
- later referrals auto-adjust to stay unique
- the preview shows the first generated value

### Payment Authority Code
Rules:
- accepts numbers only
- accepts up to 5 digits
- blank means keep the source value
- later referrals increment automatically so values stay unique

### Network
Available values:
- `CCN1`
- `CCN2`
- `CCN3`
- `CCN4`
- `CCN5`

## Validation
The app now validates important fields before the workflow runs and shows inline messages next to the field.

Examples of what is checked:
- SSN format
- referral number format
- station ID format
- payment authority code length and range
- date and date-time format
- generator counts
- required upload selections

If something is invalid, fix the highlighted field and run again.

## Upload
Turn on upload only if you want the app to send the final `.gz` file after processing.
If `Upload the .gz file after processing` is not selected, `Upload to ...` target toggles are disabled.

Supported upload targets:
- `DEV`
- `PPD`
- `SQA`
- `PROD`

Default remote path:
- `/CCRA_Uploads`

### Upload Credential Files
The app uses:
- `config\upload_profiles.json`
- `config\upload_credentials.json`

### Import To Config
Use `Import To Config` to load upload credentials from:
- `WinSCP.ini`
- a supported credentials JSON file

When you import `WinSCP.ini`, the app:
- reads the saved WinSCP sessions
- extracts host, username, password, and related connection details
- writes the final data into `config\upload_credentials.json`

After import, `config\upload_credentials.json` is the main file the app uses for uploads.
The app no longer auto-loads upload profiles from arbitrary machine paths; profiles are activated only through `Import To Config`.

### Test Connection
Each upload target now includes a `Test Connection` button.

Use it to verify:
- the selected user exists
- the remote directory is filled in
- the app can connect before you run the full workflow

This is the fastest way to confirm upload settings before you process files.

### LEIE Upload Validation
When the `LEIE Data Processing` tab is active, the Upload area includes:
- `Step 4: Validate the LEIE Load in the Database`
- `Step 5: Validate in CCRS UI`

For Step 4:
- paste the `etl_batch_id` from `CLAIM_BATCH_LOG`
- use `Copy SQL`
- run the SQL in `ccrsdb` and validate row counts/batch status

For Step 5:
- open the correct CCRS Table Viewer environment
- validate the same LEIE batch values in the UI
- confirm the load is successful before moving to the next environment

## Output Format
The final `.gz` contains one combined JSON object with this shape:

```json
{
  "ListDate": "YYYY-MM-DD hh:mm:ss",
  "Referrals": [
    {}
  ]
}
```

## User Guide File
The packaged app opens this guide file:
- `docs\USER_GUIDE.pdf`

If you share the app with other users, make sure the `docs` folder stays next to the `.exe`.

## Common Notes
- generated JSON files always use lowercase `.json`
- the app creates one `.gz` file per run
- older `.gz` files are not removed automatically
- you can keep the processed `.json` files or keep only the `.gz`
- app-created temporary staging folders and temporary upload helper files are cleaned automatically after the run or when the app closes
