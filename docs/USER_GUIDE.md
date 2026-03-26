# CCRS File Processing Framework User Guide

## Purpose
This application is an internal team tool that helps staff work with CCRS files more efficiently. Today it supports referral JSON processing, value updates, output packaging, and optional upload workflows, and it is designed to expand over time to support additional CCRS file types and internal use cases.

## What The App Can Do
- Read any source file that ends with `.json`
- Generate new referral JSON files without needing a source folder
- Save processed JSON files using a user-chosen output name
- Create one `.gz` file using a user-chosen archive name
- Update referral-related JSON values
- Show live previews for `Referral Number`, `Station ID`, `Payment Authority Code`, output JSON names, and the final `.gz` name
- Keep or remove processed JSON files after the `.gz` file is created
- Optionally upload the `.gz` file to `DEV`, `PPD`, or `SQA`

## Before You Start
Make sure you have:
- a source folder containing CCRS `.json` files for the workflow you are running
- an output folder where processed files should be saved
- a valid `WinSCP.ini` file or a ready-to-use `config\upload_credentials.json` file if you plan to use upload

## How To Run The App
This guide assumes users are running the packaged Windows application.

To start the app:
- open the folder that contains `CCRS File Processing Framework.exe`
- double-click `CCRS File Processing Framework.exe`

On first run, the app creates local folders next to the `.exe`, including:
- `config`
- `logs`
- `upload_import`

Users should update the files in that generated `config` folder next to the `.exe`, not the source-code folder.

## Main Workflow
The main `Referral Files` area now has two sub-tabs:
- `Edit Existing Files` for updating existing JSON files from a source folder
- `Generate New Files` for creating new referral JSON files from scratch

### 1. Choose Source Folder
Use the `Source` section to choose the folder that contains the input `.json` files.

The app:
- reads any `.json` filename
- ignores non-JSON files
- loads defaults from the first JSON file it finds
- updates the output-name preview based on how many source files were found

### Generate New Files
Use the `Generate New Files` tab when you want the app to create files from scratch.

In that tab you can:
- choose how many files to generate
- choose how many `Referrals` each file should contain
- use the same output naming and JSON value update options as the normal referral-processing workflow

This workflow does not require a source folder and does not include upload options.

### 2. Choose Output Folder
Use the `Output` section to pick where processed files should be saved.

### 3. Enter Full Output JSON Name
In `Full output JSON name`, enter only the actual name you want to use for processed JSON files.

The app adds `.json` automatically.

Examples:
- if you enter `test101` and there is one file, the app creates `test101.json`
- if you enter `test101` and there are multiple files, the app creates `test101_1.json`, `test101_2.json`, `test101_3.json`

The preview line under the textbox shows the exact filename pattern that will be used.

### 4. Enter Final GZ File Name
In `Name for the final .gz file`, enter only the actual name you want to use for the final archive.

The app adds `.gz` automatically.

Example:
- if you enter `referrals_batch_20260323`, the app creates `referrals_batch_20260323.gz`

The gzip payload also uses the matching internal JSON name:
- `referrals_batch_20260323.json`

The preview line under the textbox shows the exact archive filename that will be created.

### 5. Choose File Retention
After creating the `.gz` file, choose whether to:
- keep the processed JSON files
- keep only the `.gz` file

## Referral Number
Use the `Referral Number` textbox to enter only the user-controlled part of the value.

Important rules:
- the app adds `VA` automatically
- the final value always stays 12 characters total, including `VA`
- the app accepts letters and numbers
- the app keeps lowercase or uppercase exactly as typed
- if you enter fewer characters, the app fills the remaining space automatically
- the preview line shows the first generated value live while you type
- every updated `ReferralNumber` is unique, even when one JSON file contains multiple items in `Referrals`

Examples:
- input `1` becomes `VA0000000001`
- the next referral record becomes `VA0000000002`
- input `eldin` becomes `VA00000eldin`
- later values keep the user text as long as possible by removing leading zeros first

## List Date
Use the `List Date` section to change the generated `ListDate` value.

If you do not change it, the app keeps the value loaded from the source JSON.

## Optional Fields
Click `Show Optional Fields` to reveal additional editable values.

If a field is left blank, the app keeps the original value from each JSON file unless the field says it auto-generates.

Optional fields include:
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

### Network Dropdown
`Network` is a dropdown with these options:
- `CCN1`
- `CCN2`
- `CCN3`
- `CCN4`
- `CCN5`

If you do not select a `Network`, the existing value in each JSON file is left unchanged.

### Station ID
- `Station ID` accepts letters and numbers only
- users can enter up to 5 characters
- if users enter fewer than 5 characters, the app fills the rest automatically
- if users leave it blank, the app generates all 5 characters
- the preview stays stable after the field finishes generating
- each referral inside the same JSON file gets a unique `StationID`
- if the last entered character is a letter, later referrals switch the changing tail to numbers
- if the last entered character is a number, later referrals switch the changing tail to letters
- if users enter all 5 characters, the app still adjusts later referrals automatically so values stay unique inside the file

### Payment Authority Code
- `Payment Authority Code` accepts numbers only
- users can enter up to 5 digits
- if users leave it blank, the existing value in the source file stays unchanged
- the preview stays stable after the field finishes generating
- each referral inside the same JSON file gets a unique `PaymentAuthorityCode`
- if users enter a starting value, later referrals increment from that value automatically so codes stay unique inside the file

## Upload
Turn on upload only if you want the app to send the final `.gz` file to a server after processing.

Supported environments:
- `DEV`
- `PPD`
- `SQA`

### Default Remote Path
Each environment starts with this default remote upload location:
- `/CCRA_Uploads`

### Upload Credentials
The app uses this file as the main upload credential source:
- `config\upload_credentials.json`

Users can edit that file directly in the same folder as the `.exe`.

Expected format:
```json
[
  {
    "Environment": "DEV",
    "Session": "C-DEV/ccrauser@DEV",
    "UserName": "ccrauser",
    "Host": "dev-dropzone.ccrs.va.gov",
    "Password": ""
  }
]
```

### Import To Config
If you do not already have `config\upload_credentials.json`, use the `Import To Config` button.

You can choose either:
- a credentials JSON file
- `WinSCP.ini`

If you choose `WinSCP.ini`, the app:
- copies the selected INI into `upload_import`
- converts the saved WinSCP sessions in the backend
- saves the final credentials into `config\upload_credentials.json`

Important notes:
- after import, `config\upload_credentials.json` is the only credentials file users need
- temporary `winscp_credentials.json` files are backend-only and are cleaned up by the app
- uploads to `PROD` remain disabled in the app

## Output Format
The final `.gz` contains one combined JSON object, not an array of files.

Top-level structure:
```json
{
  "ListDate": "YYYY-MM-DD hh:mm:ss",
  "Referrals": [
    {}
  ]
}
```

This format is required by the receiving referral application.

## Common Notes
- Generated JSON filenames always use lowercase `.json`
- The app creates one `.gz` file for the current run based on the name entered by the user
- Older `.gz` files in the folder are not deleted automatically
- The app can keep the generated `.json` files or keep only the `.gz`, depending on the selected option
