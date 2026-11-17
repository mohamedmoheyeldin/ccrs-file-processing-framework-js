---
name: Configuration and reference data
description: Rules for version metadata, generated catalogs, and upload configuration
applyTo: "config/**,upload_import/**,package.json,pnpm-lock.yaml,pnpm-workspace.yaml"
---

# Configuration and data rules

- `config/app_version.json` is the single source for version, release tag, and release notes. Do not hand-edit the version in `package.json`, the NSIS display name, or `docs/RELEASE_UPDATE.md`; `scripts/sync-build-version.js` synchronizes them.
- `announcementId` must be unique for every release.
- `config/stations.json` and `config/seoc_options.json` are generated. Refresh them with `pnpm data:stations -- <stations.xlsx>` and `pnpm data:seoc -- <SEOC.xlsx>`; do not edit them by hand. `config/situational_seoc_options.json` is the authoritative nine-value manual catalog. Keep each SEOC Number paired with its exact versioned ID.
- Never commit `config/upload_credentials.json`, `upload_import/WinSCP.ini`, `.env` files, logs, or anything containing a password, key, or host secret. `config/upload_profiles.json` holds non-secret targets only.
- Use the pnpm version in `packageManager` through Corepack and install with `--frozen-lockfile`. Dependency changes must update `pnpm-lock.yaml` in the same change and keep the `overrides` and `allowBuilds` entries in `pnpm-workspace.yaml` intact unless the change is about them.
- Keep the `build` block Setup-only (NSIS, x64). Do not add portable targets.
- Run `pnpm verify` after any change here.
