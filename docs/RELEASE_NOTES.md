# CCRS File Processing Framework Version 1.2.5

## Release Summary

Version 1.2.5 is the reliability, security, large-file, and user-experience update for the Version 1.2 product line.

The GitHub Release contains:

- `CCRS File Processing Framework Setup Version 1.2.5.exe`
- `SHA256SUMS.txt`

Portable executables are not generated. Build output stays in temporary GitHub Actions storage and is not committed to the repository.

## Performance and Large Files

- File processing, generation, LEIE work, upload tests, compression, and uploads run in background workers instead of blocking the window.
- A visible progress bar and Cancel control keep long operations understandable and interruptible.
- LEIE worksheets use SheetJS dense mode for more efficient large-sheet processing.
- Source file size, combined size, LEIE rows, generated files, referrals per file, and total generated referrals have explicit safety limits.
- Source summaries display file size and row information before processing.
- Referral gzip output is streamed to disk instead of constructing the entire combined archive in memory.

## Upload Reliability and Security

- Referral and LEIE uploads retry transient failures with exponential backoff.
- Every selected server is attempted even when another target fails, with independent status reporting.
- Remote file size remains verified before an upload is considered complete.
- Imported upload credentials are encrypted with Electron safe storage on Windows.
- Existing plaintext credential files migrate automatically when encryption is available.
- Importing a credentials JSON file no longer removes or modifies the original source file.

## Desktop Security

- Electron renderer sandboxing is enabled with a restrictive Content Security Policy.
- IPC is limited to the trusted application window, external links require HTTPS, and unexpected navigation, windows, and permission requests are denied.
- Settings and release acknowledgement files use atomic writes.
- Logs rotate at a bounded size and redact common secret patterns.
- A sanitized diagnostic report can be exported without credential values or user file paths.

## User Experience and Accessibility

- A Select, Configure, Validate, Process, and Upload stepper makes workflow position clear.
- The action and status card remains visible near the bottom of the window.
- Status updates use an accessible live region, with improved tab, theme, and date-control semantics.
- The minimum window size is reduced and narrow layouts reorganize into readable columns.
- Release notes continue to use the full application window with independent scrolling and a Start Using The App button.

## Existing Workflow Features

- Original LEIE source name remains the default output name.
- Strict full-row duplicate detection and optional automatic removal remain available.
- LEIE uploads default to `/in/manual_process/`; referral uploads default to `/CCRA_Uploads`.
- Station IDs stay exact or use valid reference entries, Referral Number and ICN endings can match by 3, 4, or 5 characters, SSNs and DOBs randomize by default, and SEOC fields remain synchronized.
- Batch-ID-aware, syntax-highlighted SQL validation remains available.

## Quality Gates and Dependencies

- Functional smoke tests, production dependency auditing, and a Windows Playwright Electron test run before merge and release.
- Release CI silently installs and launches the generated Setup application before publishing.
- Windows signing is used automatically when `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` repository secrets are configured.
- Electron is updated to 43.4.1, ssh2-sftp-client to 12.1.1, Playwright to 1.62.1, and pnpm to 11.22.0.
