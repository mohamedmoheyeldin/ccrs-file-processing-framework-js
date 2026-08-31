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
- Treat `config/seoc_options.json` as generated data. Refresh it with `pnpm data:seoc -- /path/to/SEOC.xlsx`; keep SEOC Number and SEOC ID paired, preserve the selected exact versioned ID, and run `pnpm verify` after a refresh.
- Keep automatic SSNs in the `999-00-0000` through `999-99-9999` test range and preserve uniqueness across the supported generated batch.
- Keep regular and Situational SEOC assignment in the shared catalog-resolution path so UI selections cannot create mismatched pairs.
- Use the renderer control tokens in `styles.css` for form sizing. Standard text inputs, selects, compact dropdown shells, and date composites must use `--control-height`; interactive buttons and options must meet `--control-touch-target`.
- Keep form rows responsive with flexible grid columns. Preserve the upload-target row's 2:3 Upload User-to-Remote Directory proportion and its narrow-screen stacking behavior. Do not introduce one-off field heights or fixed control widths that diverge from the shared control system.
- Preserve native labels, accessible names, visible focus, disabled state, invalid state, and keyboard operation when enhancing a form control.
- Keep source/output validation and staging in `batchSafety.js`; never delete output before the current run has successfully processed and packaged.
- Keep upload-environment authorization in `workflowPolicy.js`; renderer filtering is a usability layer, not the security boundary.
- Treat a referral file error as a batch failure. Do not add partial referral archives or uploads without an explicit approved business requirement.
- Keep run history and manifests free of credentials and source contents. Hashes, names, counts, destinations, and outcomes are allowed.
- Emit structured progress events for new work using `phase`, `state`, `current`, `total`, and `message`.

## Windows-only work

From native Windows, run `pnpm run test:e2e` to launch the Electron UI. Use `pnpm run dist` only when validating the Setup build. The GitHub release workflow is the authoritative publishing path.
