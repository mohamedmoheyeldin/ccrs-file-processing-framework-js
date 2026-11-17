---
name: verify-change
description: Run the right checks for the current change and report the result
agent: agent
---

Verify the current working-tree change in this repository.

1. Run `git status` and `git diff` to see what changed.
2. Run `corepack pnpm verify`. If it fails, show the failing output, fix the cause (never skip or weaken a test), and re-run only what failed until it passes.
3. Decide whether Windows-only checks apply, using `docs/TESTING.md`:
   - renderer, IPC, window, or worker change: `pnpm run test:e2e` on native Windows;
   - packaging or release change: `pnpm run dist` on native Windows.
   Run them if this machine is Windows; otherwise say they are left to the Windows CI jobs.
4. Check that `README.md` and the relevant `docs/` file were updated if behavior, setup, or architecture changed.
5. Confirm no credentials, WinSCP imports, logs, packages, or Linux-rendered PDFs are staged.

Finish with a short report: what ran, what passed or failed, and what still needs Windows.
