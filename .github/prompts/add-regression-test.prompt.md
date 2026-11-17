---
name: add-regression-test
description: Add cross-platform test coverage for a behavior or bug
agent: agent
argument-hint: "the behavior or bug to cover"
---

Add automated coverage for: ${input:behavior:the behavior or bug to cover}

1. Read `docs/TESTING.md` and find the closest existing test in `scripts/smoke-test.js`, `scripts/workflow-regression-test.js`, or `scripts/upload-sftp-test.js`.
2. Add the test in that file, following its `test(name, callback)` helper and assertion style. No new dependencies or frameworks.
3. Exercise the backend module directly, without launching Electron. Use temporary directories, the `999-00-0000` to `999-99-9999` SSN range, and local test doubles for uploads. Never contact a real CCRS environment.
4. For a bug, make the test fail first against the current code, then fix the code, then show it passing.
5. Run the single suite you changed, then `corepack pnpm verify`.
6. Add a line to `docs/TESTING.md` if the new coverage is worth knowing about.
