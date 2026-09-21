# Testing

## Standard verification

```bash
pnpm verify
```

This regenerates packaged documentation, synchronizes version metadata, checks JavaScript syntax, and runs the functional smoke suite.

## Test layers

- `pnpm run test:syntax` parses the application and automation JavaScript.
- `pnpm run test:smoke` verifies the complete 1,573-row station conversion, exact long Station IDs through JSON/gzip, the separate 752-record regular and nine-record Situational SEOC catalogs with zero logical overlap, paired assignment, unique Referral/ICN generation, VA/iFAMS/mixed/custom Referral prefixes, shared Archive naming modes and filename safety, settings persistence, authoritative environment policy, path and schema safety, fail-closed processing, manifest hashes, protected credentials, cleanup, and release helpers without opening the UI.
- `pnpm run test:e2e` launches the real Electron application, measures visible controls across Referral and LEIE workflows, checks accessible names and minimum interaction targets, verifies the shared compact option-card dimensions, expandable contextual help, live-preview markers, and two-column/one-column responsive layouts, then exercises the exact ID/Number option layout, separate regular and Situational results, manual-selection warning, use-all, clear, missing-saved-value fallback, and filename previews. It finishes by verifying a background generation job creates only the expected JSON, gzip, and manifest artifacts. PR CI runs the full smoke suite on Windows immediately before this test so Windows path behavior is verified before release tagging.
- `pnpm run dist` builds the NSIS Setup installer. Release CI additionally installs and launches that package, validates its executable, and generates its checksum.

## When to run more

- Backend, validation, configuration, or release-script change: run `pnpm verify`.
- Renderer, IPC, window, or worker integration change: also run `pnpm run test:e2e` on Windows.
- Packaging or release change: also run the Windows release workflow or `pnpm run dist`; do not treat a WSL-only result as installer validation.

## Version 1.5 regressions

`pnpm verify` includes `test:regression`: 1,200 referrals across three files; selected Station, PA, Network and both SEOC catalogs; master/gzip equality; repeat-run overwrite; JSON retention combinations; sequential uploads with duplicate target and middle-target failure; copy failure rollback. `pnpm run test:e2e` exercises Electron controls and scrollable dialogs at 150%, 200%, and 300% zoom. External CCRS uploads require separately authorized environment access and are not part of these local tests.


### Local 1.5.1 update

Payment Authority Code uses the same searchable, multi-select chip control as SEOC. Selecting all clears the subset; selections are saved between sessions. New referrals default to current local dates and an expiration based on Referral Period (990 days by default). Editing a date switches to custom dates; checking Use current dates restores automatic dates. Existing source files are not rewritten by this default. Master JSON is formatted with four-space indentation and combines numbered files in natural numeric order. Regression coverage checks current and custom dates, leap-year expiration, selection persistence, master equality, and ordering beyond nine files.


### Optional manifest export (1.5.3)

Jobs validate output automatically but no longer write a manifest into the output folder. After a referral job finishes, Generate Manifest exports batch details from the saved run history. Export checks retained files against their original hashes and rejects changed or missing files. Existing manifests are not deleted. The current-dates control uses a compact title and helper line.
