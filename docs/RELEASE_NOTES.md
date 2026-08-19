# CCRS File Processing Framework Version 1.2

## Release Summary

Version 1.2 is the final consolidated Windows release of the current CCRS referral and LEIE processing application.

The GitHub Release contains:

- `CCRS File Processing Framework Setup Version 1.2.exe`
- `SHA256SUMS.txt`

Portable executables are not generated. Release binaries are built in temporary GitHub Actions storage and are not committed to the repository.

## LEIE Data Processing

- Process one LEIE Excel file or a folder containing `.xlsx`, `.xls`, `.xlsm`, or `.xlsb` files.
- Detect duplicates using strict full-row matching.
- Review duplicates manually or remove later matches automatically while keeping the first row.
- Keep the original source base name as the default output file name.
- Save the processed output as `.xlsx`.
- Default every LEIE upload target to `/in/manual_process/` while preserving custom paths.
- Upload to `DEV`, `PPD`, `SQA`, and `PROD`.
- Verify the remote file size before marking a server complete.
- Prevent a stalled SFTP disconnect from blocking the next server.
- Continue through remaining selected servers after an individual target failure.

## LEIE Validation

- Enter an `etl_batch_id` once and update every query reference automatically.
- Copy the complete database validation query set.
- Read SQL with color-coded keywords, quoted values, numbers, and comments.
- Follow the bundled database and CCRS Table Viewer validation guidance.

## Referral Data Controls

- Preserve an exact selected Station ID without padding or adding characters.
- Optionally use random Station IDs restricted to the bundled reference table.
- Match the final 3, 4, or 5 characters of Referral Numbers and ICNs.
- Generate random test SSNs and DOBs for each patient by default.
- Apply fixed SSN and DOB values when random generation is disabled.
- Select a synchronized SEOC Number and SEOC ID pair from bundled reference data.
- Generate unique Payment Authority Code values within the supported five-digit range.

## Packaging and Reliability

- Full per-user NSIS Setup installer with selectable installation directory.
- No portable build.
- No repository-local `dist-electron` or `release` output.
- Runtime configuration and credentials remain under the user's AppData location.
- Upload credentials activate only after `Import To Config`.
- App-created temporary staging and upload-helper files are cleaned automatically.
- Electron 43, electron-builder 26.15, and SheetJS 0.20.3.

## Quality Gates

- A smoke-test workflow runs for pull requests targeting `main` and for updates to `main`.
- The release workflow runs the smoke suite again before creating the installer.
- The release workflow validates the executable header and minimum size.
- The published installer is accompanied by a SHA-256 checksum.
- Release authentication is isolated from electron-builder so only the intentional final GitHub Release is created.
