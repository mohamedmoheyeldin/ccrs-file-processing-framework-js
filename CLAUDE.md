# Claude Code guidance

Follow [AGENTS.md](AGENTS.md); it is the source of truth for scope, working agreements, and platform checks.

## Additional rules for Claude Code

- Start from `README.md`, then `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and `docs/TESTING.md`.
- Use the Graphify map (`graphify-out/`) for orientation before multi-file changes; read the real files before editing.
- Run `pnpm verify` after source, configuration, documentation-generation, or test changes; run `pnpm run test:e2e` on Windows for renderer, IPC, window, or worker changes.
- Keep documentation current in the same change. Do not edit generated files (`docs/RELEASE_UPDATE.md`, synchronized versions); change `config/app_version.json` instead.
- Never commit credentials, WinSCP imports, logs, generated packages, release binaries, or `graphify-out/`.
- Do not publish releases, create tags, or upload to CCRS targets unless explicitly asked.
