# LEIE upload: live server check (pending)

Status as of 2026-11-17: **the upload code is fixed and covered by automated tests, but it has not yet been run against the real CCRS servers.** That check can only be done from a computer on the work network. This note is the handoff for whoever (a person or an AI assistant such as GitHub Copilot) picks it up there.

## What changed

Reported problem: LEIE uploads reached the same endpoint more than once, the app could not say whether an upload passed or failed, and a run could wait on a server.

| Change | Pull request | Released in |
| --- | --- | --- |
| Exactly-once uploads, stall and timeout handling, failover to the next server, per-server Upload results list | #28 | 1.5.4 |
| Random end-to-end test failure fixed, version 1.5.4 | #30 | 1.5.4 |
| Upload log (`logs\uploads.log`), Open Upload Log button, WinSCP session tests | #31 | on `main`, not yet released |

Root causes found:

- LEIE files go to `/in/manual_process/`, an inbound folder. When the server's job picked a file up right after the transfer, the size check found no file and reported a delivered upload as failed. Retrying then sent a second copy.
- Retry always re-sent the file, even when it had already arrived.
- A server that stopped responding could hold a run for up to 10 minutes.
- WinSCP ran with automatic reconnect on, which can re-send a file.

## Rules the upload code must keep

All of this lives in `electron/backend/uploader.js`.

1. Each file is sent to each endpoint exactly once. An endpoint is host + port + account + remote folder. A repeated endpoint is reported as `skipped`.
2. No automatic re-send, ever. A failed upload is reported and the next server starts.
3. A missing remote file after a successful transfer means the inbound job consumed it. That is `picked-up` and counts as delivered. A size mismatch is still a failure.
4. Retry Failed Uploads passes `skipIfPresent`, which checks the server first and does not re-send a file already there with the same size.
5. Nothing may hang: connect timeout 30 s, stall timeout 60 s with no data accepted, a hard per-server deadline, and a forced disconnect on any failure.
6. WinSCP scripts start with `option batch abort`, `option confirm off`, `option reconnecttime off`.
7. Only one uploading job runs at a time (`electron/main.js`).
8. Passwords are never written to `logs\uploads.log`.

## What is and is not tested

Covered automatically by `pnpm run test:upload` (`scripts/upload-sftp-test.js`), which runs in `pnpm verify` and in CI on Windows:

- The real SFTP client against in-process SFTP servers: normal, frozen mid-transfer, unreachable, and one that consumes the file immediately.
- Duplicate endpoints, two accounts on one host, retry without re-send, the per-server deadline.
- The WinSCP session path through a stand-in WinSCP program: one run and one `put`, failure reporting, hang timeout, script cleanup.
- The upload log contents, including that no password is written.

**Not covered:** the real CCRS servers, real accounts, the real WinSCP program, and the work network (firewall, proxy, host keys). Nothing in this repository can prove those.

## Live check to run on the work computer

Prerequisites: the repository cloned, Node.js 24, `corepack pnpm install --frozen-lockfile`, and upload settings imported in the app (WinSCP.ini or credentials JSON). To test with the upload log, run from source (`pnpm start`) or build a release newer than 1.5.4. Version 1.5.4 has every upload fix but not the log.

Do these in order and stop at the first surprise.

1. Run `pnpm verify`. It must pass before touching a server.
2. In the app, open LEIE Data, enable upload, and press **Test Connection** for SQA only. Expect "Connected successfully and confirmed ...". This sends no file.
3. **First real send, low risk.** Select SQA only and change its remote folder from `/in/manual_process/` to a scratch folder that no job watches. Process a small LEIE workbook. Expect in the Upload results list: `SQA  PASSED  ... Verified N bytes on the server`. Confirm on the server that the file exists once with that size.
4. **Real inbound folder.** Put the SQA folder back to `/in/manual_process/` and process the workbook again. Expect `PASSED`, with either "Verified N bytes" or "its inbound job picked the file up right away". Then confirm in the database that the batch loaded once, using `docs/LEIE_UPLOAD_VALIDATION_GUIDE.md`.
5. **Several servers.** Select SQA, DEV, and PPD. Expect one result line per server and servers handled one at a time.
6. **Failure handling.** Give one server a wrong folder or account and run again. Expect that server `FAILED` with the server's message, the others `PASSED`, and the run finishing without waiting.
7. **Retry.** Fix the setting and press Retry Failed Uploads. Expect only the failed server to be contacted and a single copy on it.
8. Leave PROD for last and only with approval. The app asks you to type PROD to confirm.

After each run open `logs\uploads.log` (Open Upload Log). A healthy run looks like:

```
=== Upload run started: <file>.xlsx (<size> bytes) to 1 server
START    SQA | host <host>:22 | account <user> | folder /in/manual_process/ | SFTP
PASSED   SQA | /in/manual_process/<file>.xlsx | check: size-match | 1420 ms | Verified <size> bytes on the server.
=== Upload run finished: 1 passed, 0 failed, 0 skipped
```

The `SFTP` or `WinSCP session` label at the end of the START line shows which code path the account uses. Accounts with a saved password use SFTP. Accounts that rely on a saved WinSCP session use WinSCP.

## If something goes wrong

Collect before changing anything: the `logs\uploads.log` lines for the run, a screenshot of the Upload results list, the app version, and what is actually on the server (file present, how many copies, size).

| Symptom | Likely cause | Where to look |
| --- | --- | --- |
| `FAILED ... SFTP connection timed out` | Host or port blocked on this network, or wrong host | Test Connection; compare with a manual WinSCP login |
| `FAILED ... stalled` | Server stopped accepting data mid-transfer | `putWithStallGuard` and `SFTP_STALL_TIMEOUT_MS` in `uploader.js` |
| `FAILED ... Upload verification failed ... expected X bytes, found Y` | File changed on the server during the check, or a partial write | `uploadFileWithSftp` verification block |
| `PASSED` but two copies on the server | A rule above was broken; this is the original bug | Check for two START lines for the same server in the log |
| WinSCP failure text | WinSCP's own message is included in the result | `runWinscpScript` and `buildWinscpScript` |
| Server shown as `SKIPPED` | Two selected servers resolve to the same host, account, and folder | `buildUploadEndpointKey` |

When fixing, keep the rules above, add a case to `scripts/upload-sftp-test.js` that reproduces the problem first, and run `pnpm verify`.

## When the live check passes

- Record the date, app version, and servers checked at the top of this file and change the status line.
- If the upload log should ship to the team, bump `config/app_version.json` and publish a new release (see the Versioning section of `README.md`).

## Other open items

- The committed PDFs in `docs/` still show Version 1.5.3 because they render with Windows fonts. Running `pnpm verify` on Windows regenerates them; commit the result. The guide inside the 1.5.4 installer is already current.
- One dependency advisory remains: `picomatch` (high), used only by the installer build tool and not shipped in the app. Its fix, 4.0.8, was not yet published on 2026-11-17. When it is, raise the `picomatch` override in `pnpm-workspace.yaml`.
