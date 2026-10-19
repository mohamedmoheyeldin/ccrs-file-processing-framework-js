# Repository guidance

## Scope

This is a CommonJS Electron application that processes CCRS referral and LEIE files and produces a Windows Setup installer.

## Working agreements

- Use Node.js 24 and the pnpm version declared in `package.json`.
- Install with `corepack pnpm install --frozen-lockfile`.
- Run `pnpm verify` after source, configuration, documentation-generation, or test changes.
- Treat `config/app_version.json` as the release-version source of truth.
- Keep credentials, imported WinSCP settings, logs, generated packages, and release binaries out of Git.
- Preserve the Setup-only NSIS release contract; do not add portable executables.
- Do not publish releases, create tags, or upload to configured CCRS targets unless explicitly requested.

## Platform checks

- `pnpm verify` is the safe cross-platform gate: generated documentation/version sync, syntax checks, and smoke tests.
- The real Electron UI test and Setup build require native Windows: run `pnpm run test:e2e` and `pnpm run dist` there or rely on the Windows CI jobs.

## Documentation

- Start with `README.md`.
- Keep `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and `docs/TESTING.md` aligned with behavior.
- Update `docs/USER_GUIDE.md` and generated PDF output when user-visible workflows change.

## Code map (Graphify)

- If `graphify-out/` exists, read `graphify-out/GRAPH_REPORT.md` or run `graphify query "..."` / `graphify affected "..."` before planning multi-file changes. Open the real files before editing.
- Never commit `graphify-out/`.
- Update README.md and the relevant `docs/` file in the same change when behavior, setup, or architecture changes.
