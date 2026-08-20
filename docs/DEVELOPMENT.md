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

## Windows-only work

From native Windows, run `pnpm run test:e2e` to launch the Electron UI. Use `pnpm run dist` only when validating the Setup build. The GitHub release workflow is the authoritative publishing path.
