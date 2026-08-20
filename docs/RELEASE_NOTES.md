# CCRS File Processing Framework Version 1.3.2

## Release Summary

Version 1.3.2 corrects the Station ID catalog so referral output uses real `DIM_VA_STATION.station_id` values instead of synthetic catalog row numbers.

The GitHub Release contains:

- `CCRS File Processing Framework Setup Version 1.3.2.exe`
- `SHA256SUMS.txt`

## Correct DIM_VA_STATION IDs

- Catalog row number `2242` is replaced by the actual Tremont VA Clinic Station ID `614GA01`.
- All 1,577 source rows were re-evaluated; the app now exposes 1,570 unique valid Station IDs after removing duplicates, test records, and an obsolete `_OLD` entry.
- Manual and random Station ID modes use the corrected catalog.
- Valid VA Station IDs from three through seven characters are supported.
- Upgrades refresh the shipped Station ID catalog so an older installed catalog cannot continue producing synthetic values.

## Compact Dropdowns

- Referral / ICN Match, Network, SEOC Number, SEOC ID, and every other dropdown now use one consistent design.
- Long lists remain inside a 260-pixel scrollable menu instead of expanding across the application window.
- Selected values are shortened visually with an ellipsis when needed; the stored value remains unchanged.
- Dropdowns retain keyboard access, disabled states, and the existing field behavior.

## Separate Referral and LEIE Upload Workflows

- CCRS Referral processing uploads the final `.gz` archive and defaults every Remote Directory field to `/CCRA_Uploads`.
- LEIE Data processing uploads the processed `.xlsx` file and defaults every Remote Directory field to `/in/manual_process/`.
- Each Remote Directory note identifies its workflow's default and explicitly contrasts it with the other workflow.
- Switching workflows changes recognized standard defaults without replacing a custom remote directory entered by the user.
- Smoke and Windows Electron end-to-end tests verify both visible defaults and workflow switching behavior.

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
