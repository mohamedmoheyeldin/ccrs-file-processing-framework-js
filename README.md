# CCRS File Processing Framework (CFPF)

CFPF is an internal team utility for working with CCRS files. It already supports referral JSON processing and upload workflows, and it is intended to grow into a broader tool for additional CCRS file operations over time.

## End User Run
For a Windows end user, use the packaged application:
- `CCRS File Processing Framework.exe`

On first run, the app creates local folders next to the `.exe` for:
- `config`
- `upload_import`
- `logs`

The app now supports:
- any source file ending with `.json`
- generating new referral JSON files without needing a source folder
- a main `Referral Files` area with separate `Edit Existing Files` and `Generate New Files` workflows
- user-chosen output JSON names
- a user-chosen final `.gz` name
- live previews for `Referral Number`, `Station ID`, `Payment Authority Code`, output JSON names, and the final `.gz` name
- `Referral Number` values that start with `VA` and stay unique across referrals
- `Station ID` values that accept alphanumeric input, auto-complete to 5 characters, and stay unique inside each JSON file
- `Payment Authority Code` values that accept numeric input, auto-complete to 10 digits, and stay unique inside each JSON file
- optional upload to `DEV`, `PPD`, and `SQA`

## Upload Setup
The app uses:
- [config/upload_credentials.json](/c:/across_file_systems/projects/coding/ccrs-file-processing-framework/config/upload_credentials.json)

Users can either:
- edit that credentials file directly, or
- click `Import To Config` in the app and choose `WinSCP.ini`

When `WinSCP.ini` is imported, the app converts the saved WinSCP sessions in the backend and stores the final result in `config\upload_credentials.json`.

## Developer Run
Run CLI:
- `python src/main.py`

Run GUI:
- `python src/gui.py`

Helper launcher:
- [run_app.bat](/c:/across_file_systems/projects/coding/ccrs-file-processing-framework/run_app.bat)

## Share With Other PCs
To package everything into a shareable Windows app:

1. Run [build_release.bat](/c:/across_file_systems/projects/coding/ccrs-file-processing-framework/build_release.bat)
2. Wait for the build to finish
3. Share:
   `dist\CCRS File Processing Framework.exe`

The `.exe` includes:
- the Python runtime
- the app code
- installed dependencies
- bundled default config files
- bundled upload import support

The other PC does not need Python installed separately.

## User Guide PDF
End-user documentation lives here:
- [USER_GUIDE.md](/c:/across_file_systems/projects/coding/ccrs-file-processing-framework/docs/USER_GUIDE.md)
- [CCRS_File_Processing_Framework_User_Guide.pdf](/c:/across_file_systems/projects/coding/ccrs-file-processing-framework/docs/CCRS_File_Processing_Framework_User_Guide.pdf)

To rebuild the PDF after documentation changes:
- `python scripts/generate_user_guide_pdf.py`
