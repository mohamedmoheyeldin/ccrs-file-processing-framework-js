---
name: Tests and automation scripts
description: Rules for test suites and build, release, and data-import scripts
applyTo: "scripts/**"
---

# Test and script rules

`docs/TESTING.md` is authoritative for test layers and when to run them.

- Scripts are CommonJS run directly with Node.js 24. Each suite uses its own small `test(name, callback)` helper with `node:assert`; follow the pattern in the file and do not add a test framework or new dependencies.
- `pnpm verify` is the cross-platform gate. `scripts/electron-e2e-test.js` and `scripts/build-release.js` only run on native Windows.
- Never skip, weaken, or delete an assertion to get a passing run. Fix the behavior, or update the assertion together with the intended behavior change and say so.
- Tests must not touch real CCRS environments or real credentials. Exercise uploads with the injected local test doubles and the local SFTP test server, including duplicate-target and failing-middle-destination cases.
- Keep generated SSNs in the `999-00-0000` to `999-99-9999` test range.
- Write test output to temporary directories and clean it up; never write into the repository.
- Release scripts must keep the Setup-only NSIS contract (no portable executable) and keep release output outside the repository.
- `scripts/sync-agent-instructions.js` generates `.github/copilot-instructions.md` from `AGENTS.md`; `pnpm verify` fails when they differ.
- `scripts/migrate-repo.js` repoints the project at a new GitHub repository; it must never push, tag, or publish. Its coverage is `scripts/migrate-repo-test.js`.
