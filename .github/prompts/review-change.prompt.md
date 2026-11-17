---
name: review-change
description: Review the current change against this repository's safety rules
agent: ask
---

Review the current change (working tree, or the branch diff against `main`) for this repository. Report findings ordered by severity with file and line; do not edit files.

Check for correctness bugs first, then these project rules:

- Credentials, WinSCP imports, logs, or source contents committed, logged, or written to run history or manifests.
- Environment authorization enforced only in the renderer instead of `electron/backend/workflowPolicy.js`; PROD reachable for Referral Files; upload order other than SQA, DEV, PPD, PROD.
- Anything that could send the same file to the same destination twice, including automatic retries.
- Output deleted before the current run is validated and packaged; partial referral batches produced after a file error.
- Long-running work on the main thread instead of the worker and cancellation paths.
- Version edited anywhere other than `config/app_version.json`; generated files edited by hand.
- A portable executable or non-NSIS target added.
- Tests skipped or weakened; behavior changed without test coverage or without the matching `README.md` / `docs/` update.
- Accessibility regressions: missing labels, focus, keyboard operation, or control sizing that bypasses the `styles.css` tokens.

End with whether `pnpm verify` is enough or the Windows `test:e2e` / `dist` checks are also needed.
