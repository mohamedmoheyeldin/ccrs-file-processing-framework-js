---
name: update-docs
description: Bring README and docs in line with the current change
agent: agent
---

Update the documentation for the current change.

1. Read `git diff` (or the branch diff against `main`) and decide what changed for users, developers, and architecture.
2. Update only what the change affects: `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md`, and `docs/USER_GUIDE.md` for user-visible workflow changes.
3. Do not edit `docs/RELEASE_UPDATE.md` or any PDF by hand. Release notes come from `config/app_version.json`.
4. Describe delivered behavior only, in the existing tone. No credentials, protected hostnames, or real patient data in examples.
5. Run `corepack pnpm verify` and report which documents changed and why.
