# CCRS File Processing Framework User Guide

## Purpose
This app helps CCRS users process referral JSON files, generate new referral files, build the final `.gz` package, and optionally upload the finished archive to the configured CCRS environments.

## Quick Start
Before you run the app, make sure you have:
- a source folder with CCRS `.json` files if you are editing existing files
- an output folder where processed files should be saved
- a `WinSCP.ini` file or a ready-to-use `config\upload_credentials.json` file if you plan to upload

To start the packaged app:
- open the folder that contains the `.exe`
- run either `CCRS File Processing Framework Setup <version>.exe` or `CCRS File Processing Framework <version>.exe`

On first run, the app creates local folders next to the `.exe`:
- `config`
- `docs`
- `logs`
- `upload_import`

Use the files in that generated runtime folder next to the `.exe`, not the source-code repo folder.

## Main Areas
The app currently has two main workflow tabs:
- `Referral Files`
- `Other CCRS File Types`

Inside `Referral Files`, there are two working modes:
- `Edit Existing Files`
- `Generate New Files`

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

The app adds `.json` and `.gz` automatically.

Examples:
- `batch101` becomes `batch101.json`
- if multiple source files are processed, the app creates `batch101_1.json`, `batch101_2.json`, and so on
- `ccra_referrals_20260326` becomes `ccra_referrals_20260326.gz`

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

### Station ID
Rules:
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

Supported upload targets:
- `DEV`
- `PPD`
- `SQA`

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

### Test Connection
Each upload target now includes a `Test Connection` button.

Use it to verify:
- the selected user exists
- the remote directory is filled in
- the app can connect before you run the full workflow

This is the fastest way to confirm upload settings before you process files.

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
- `docs\USER_GUIDE.md`

If you share the app with other users, make sure the `docs` folder stays next to the `.exe`.

## Common Notes
- generated JSON files always use lowercase `.json`
- the app creates one `.gz` file per run
- older `.gz` files are not removed automatically
- you can keep the processed `.json` files or keep only the `.gz`
- upload to `PROD` is not enabled in the app
