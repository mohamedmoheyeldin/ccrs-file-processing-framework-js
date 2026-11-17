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

## Open work

- The LEIE upload live check against real CCRS servers is pending. Read `docs/LEIE_UPLOAD_LIVE_TEST.md` before changing `electron/backend/uploader.js` or diagnosing an upload problem.

## Documentation

- Start with `README.md`.
- Keep `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and `docs/TESTING.md` aligned with behavior.
- Update `docs/USER_GUIDE.md` and generated PDF output when user-visible workflows change.
- Update README.md and the relevant `docs/` file in the same change when behavior, setup, or architecture changes.
- `docs/IMPROVEMENT_RECOMMENDATIONS.md` is the ranked backlog of proposed improvements and recorded owner decisions. Check it before proposing new work, and remove an item when it is delivered.

## Agent instruction files

- This file is the single source of repository rules for every coding agent. `CLAUDE.md` points here, and `.github/copilot-instructions.md` is generated from it.
- After editing this file, run `pnpm run sync:instructions` and commit the regenerated Copilot file; `pnpm verify` fails when they differ.
- Path-scoped Copilot rules live in `.github/instructions/` and reusable prompts in `.github/prompts/`. Keep them consistent with `docs/DEVELOPMENT.md`.

## Moving to another GitHub repository

- When asked to connect or move this project to a new repository and given its URL, follow `docs/REPOSITORY_MIGRATION.md`: run `pnpm run migrate:repo <new-repo-url>`, then `pnpm verify`, commit, and push branches only.
- Do not push tags during a move; a `v*` tag starts the release workflow. Do not copy secrets into files; list the secrets and settings the maintainer must add in the new repository.
