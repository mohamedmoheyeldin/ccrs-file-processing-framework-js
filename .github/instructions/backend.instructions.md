---
name: Backend processing
description: Rules for the Electron main process and backend modules
applyTo: "electron/main.js,electron/preload.js,electron/backend/**/*.js"
---

# Backend and main-process rules

`docs/DEVELOPMENT.md` (Change rules) and `docs/ARCHITECTURE.md` are authoritative; these are the points most often missed.

- CommonJS only (`require` / `module.exports`). Do not introduce ES modules, TypeScript, or a bundler.
- Keep backend processing independent from renderer DOM code so it stays testable without launching Electron.
- Long-running work goes through the existing background-worker and cancellation paths (`jobWorker.js`, `leieWorker.js`). Emit structured progress events with `phase`, `state`, `current`, `total`, and `message`.
- Source/output validation and staging belong in `batchSafety.js`. Never delete output before the current run has processed and packaged successfully. A referral file error fails the whole batch; no partial archives or uploads.
- Upload-environment authorization belongs in `workflowPolicy.js`. Renderer filtering is a usability layer, not the security boundary. Upload order is SQA, DEV, PPD, then PROD; Referral Files exclude PROD and only LEIE may expose it.
- Uploads are exactly-once per destination. Do not add automatic retries that could deliver a file twice.
- Never log, persist, or return credentials or source file contents. Run history and manifests may hold hashes, names, counts, destinations, and outcomes only. Credentials go through `secureCredentials.js`.
- Write settings and outputs with the atomic helpers in `atomicFile.js`.
- Do not force user-entered text to upper or lower case.
- Any IPC change needs a matching `preload.js` surface and renderer update, and requires `pnpm run test:e2e` on Windows (or the Windows CI job).
- Add or update coverage in `scripts/smoke-test.js` or `scripts/workflow-regression-test.js` for every behavior change, then run `pnpm verify`.
