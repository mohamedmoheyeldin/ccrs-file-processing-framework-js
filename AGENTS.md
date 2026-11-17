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
- Update README.md and the relevant `docs/` file in the same change when behavior, setup, or architecture changes.

## Agent instruction files

- This file is the single source of repository rules for every coding agent. `CLAUDE.md` points here, and `.github/copilot-instructions.md` is generated from it.
- After editing this file, run `pnpm run sync:instructions` and commit the regenerated Copilot file; `pnpm verify` fails when they differ.
- Path-scoped Copilot rules live in `.github/instructions/` and reusable prompts in `.github/prompts/`. Keep them consistent with `docs/DEVELOPMENT.md`.
