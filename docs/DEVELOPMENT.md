# Development

## Setup

```bash
corepack enable
corepack pnpm install --frozen-lockfile
```

Node.js 24 and the pnpm version declared in `package.json` match CI.

## Common workflow

```bash
pnpm start
pnpm verify
```

`pnpm start` regenerates the user-guide PDF and synchronizes version metadata before opening Electron. `pnpm verify` performs the same generated-file preparation and then runs the cross-platform syntax and smoke suites.

## Change rules

- Edit `config/app_version.json` for version and release-note changes; do not hand-edit synchronized versions elsewhere.
- Keep backend processing independent from renderer DOM code so it remains testable without launching Electron.
- Use the existing background-worker and cancellation paths for long-running work.
- Do not use real credentials or production upload targets during development.
- Keep release output outside the repository; the build script enforces this boundary.
- Treat `config/stations.json` as generated data. Refresh it with `pnpm data:stations -- /path/to/stations.xlsx`, preserve every source row and column, and run `pnpm verify` after any station-source change.
- Treat `config/seoc_options.json` as generated regular data and `config/situational_seoc_options.json` as the authoritative nine-value manual catalog. Refresh the regular data with `pnpm data:seoc -- /path/to/SEOC.xlsx`; the importer excludes every Situational Number/name identity. Keep SEOC Number and exact versioned ID paired, and run `pnpm verify` after either catalog changes.
- Keep automatic SSNs in the `999-00-0000` through `999-99-9999` test range and preserve uniqueness across the supported generated batch.
- Keep regular and Situational SEOC assignment in the shared resolver but require the caller to select the correct catalog so a key cannot cross between them or create a mismatched pair.
- Use the renderer control tokens in `styles.css` for form sizing. Standard text inputs, selects, compact dropdown shells, and date composites must use `--control-height`; interactive buttons and options must meet `--control-touch-target`.
- Keep form rows responsive with flexible grid columns. Preserve the upload-target row's 2:3 Upload User-to-Remote Directory proportion and its narrow-screen stacking behavior. Do not introduce one-off field heights or fixed control widths that diverge from the shared control system.
- Preserve native labels, accessible names, visible focus, disabled state, invalid state, and keyboard operation when enhancing a form control.
- Keep source/output validation and staging in `batchSafety.js`; never delete output before the current run has successfully processed and packaged.
- Keep upload-environment authorization in `workflowPolicy.js`; renderer filtering is a usability layer, not the security boundary.
- Keep the upload order SQA, DEV, PPD, then PROD. Referral Files must exclude PROD; only LEIE may expose it. Test concurrent upload behavior with injected local test doubles rather than live environments.
- Keep Network assignment automatic when no values are selected. One selected value applies to every referral; multiple selected values are shuffled and cycled across referrals.
- Referral Number bodies and Custom prefixes accept letters, numbers, hyphens, and underscores. Preserve these separators in generated Referral Numbers; Referral-derived ICNs remain alphanumeric and continue enforcing their fixed length.
- Do not force user-entered text to uppercase or lowercase. Searches and fixed option matching may remain case-insensitive; generated constants such as `TEST` and canonical catalog values may retain their defined case.
- Treat a referral file error as a batch failure. Do not add partial referral archives or uploads without an explicit approved business requirement.
- Keep run history and manifests free of credentials and source contents. Hashes, names, counts, destinations, and outcomes are allowed.
- Emit structured progress events for new work using `phase`, `state`, `current`, `total`, and `message`.

## Windows-only work

From native Windows, run `pnpm run test:e2e` to launch the Electron UI. Use `pnpm run dist` only when validating the Setup build. The GitHub release workflow is the authoritative publishing path.

## Local development candidate

Use Node 24 and Corepack pnpm 11.22.0. Install with `corepack pnpm install --frozen-lockfile`, run `corepack pnpm start`, verify with `corepack pnpm verify`, and build with `corepack pnpm run dist`. The local working branch is `local/1.5-workflow-improvements`. No automatic remote upload or publishing is performed.


## Team announcement for every release

Update `version`, `releaseTag`, `releaseNotes`, and optional concise `teamHighlights` in `config/app_version.json`. Version synchronization automatically regenerates `docs/RELEASE_UPDATE.md` during start, test, and release build. Commit this file with each release. Copy its entire contents into Teams only after the release and installer are published and verified. Do not edit the generated message directly.
