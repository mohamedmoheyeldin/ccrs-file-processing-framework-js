# Improvement recommendations (proposed)

Reviewed on 2026-11-17 against `main` at version 1.5.4 and the `UntitledUi` branch. Every item below is a **proposal**. None of it is implemented yet. When an item is delivered, remove it from this file and describe the behavior in the relevant guide.

Effort key: Small is under half a day, Medium is one to two days, Large is more.

## Summary

The app is already well built, so this list is short on emergencies and long on hardening.

Already strong: sandboxed renderer with a strict Content Security Policy, IPC that rejects untrusted senders, credentials encrypted with Windows DPAPI, background workers with cancel, CI actions pinned by commit, a Windows E2E job, and a release job that installs and launches the real Setup package.

Suggested order for the first five:

1. Stop a second copy of the app from running (item 1).
2. Verify SFTP server host keys before sending a password (item 2).
3. Stop keeping a readable copy of `WinSCP.ini` in app data (item 3).
4. Log crashes so Export Diagnostics can show what happened (item 10).
5. Add linting and a real test runner with coverage (items 13 and 14).

## Decisions already made

- **Never fail or block a release because the installer is unsigned** (Eldin, 2026-11-17). Former item 7 was dropped. Do not add a signing gate to `release.yml`.

## Priority 1: security and data safety

These protect passwords and the upload-once guarantee.

| # | Change | Impact | Effort | Why |
|---|---|---|---|---|
| 1 | Single-instance lock | High | Small | `electron/main.js` never calls `requestSingleInstanceLock`. The "one upload at a time" guard lives in one process, so opening the app twice allows two parallel uploads of the same file. |
| 2 | Verify SFTP host keys | High | Medium | `buildSftpConnectOptions` in `electron/backend/uploader.js` sets no host key check, so the app sends the password to any server that answers at that address. Remember each server's fingerprint on first use and stop with a clear warning if it changes. |
| 3 | Remove the stored `WinSCP.ini` copy | Medium | Small to Medium | Import copies the file into app data and leaves it there. WinSCP's password scrambling is reversible (the app decodes it itself), so this copy defeats the DPAPI encryption of the JSON beside it. Delete it once every session is converted, or point WinSCP at the user's own file. |
| 4 | No plain-text credential fallback | Medium | Small | `saveCredentialEntries` in `secureCredentials.js` writes passwords as plain JSON when encryption is unavailable. In the installed app it should refuse and explain instead. |
| 5 | Limit what Open Path can open | Low to Medium | Small | The `shell:open-path` handler opens any existing path it is given, including programs. Restrict it to folders, logs, PDFs, and the output files the app created. |
| 6 | CodeQL, secret scanning, Dependabot config | Medium | Small | There is no `.github/dependabot.yml` and no code scanning workflow. A config file also keeps the pinned GitHub Actions current. |

Open question: `config/upload_profiles.json` commits the upload server names and account names. That is acceptable in a private repository. If the repository becomes public or is shared more widely, move them out of Git.

## Priority 2: reliability and releases

| # | Change | Impact | Effort | Why |
|---|---|---|---|---|
| 8 | Protect published releases | Medium | Small | A manual run of the release workflow replaces the installer of an existing version (`--clobber`). People who already downloaded that version would then hold a different file under the same number. Require an explicit "replace" input. |
| 9 | Update notice in the app | Medium | Medium | The app has no update check, so people learn about releases from a team message. A check on start that shows "Version X is available" with a download link would close that gap. A private repository needs a different source for the version. |
| 10 | Log crashes | Medium | Small | There are no handlers for uncaught errors, rejected promises, or a crashed renderer, so a crash leaves nothing in `process.log` for Export Diagnostics. |
| 11 | Ship support files once | Low | Small | `package.json` lists `config`, `docs`, `assets`, `templates`, and `upload_import` under both `extraResources` and `extraFiles`. The installer carries two copies and they can drift. Keep the one the app reads. |
| 12 | Recent runs panel | Medium | Medium | The backend already saves the last 20 runs with upload results (`runHistory.js`), but no screen lists them. A panel could reopen the folder, export the manifest, or retry failed uploads for an earlier run. |

## Priority 3: code quality, tests, and CI

| # | Change | Impact | Effort | Why |
|---|---|---|---|---|
| 13 | ESLint and Prettier in `pnpm verify` | Medium | Small | Today the only static check is a syntax parse. A linter catches unused variables, missing awaits, and undefined names before they reach a tester. |
| 14 | Real test runner with coverage | Medium | Medium | `scripts/smoke-test.js` is one 1,793-line script, so the first failure hides every later one and nothing reports coverage. Node's built-in `node:test` needs no new dependency and gives per-test results and a coverage number. |
| 15 | Split the largest backend files | Medium | Medium | `uploader.js` (1,350 lines) mixes credential import, WinSCP parsing, SFTP transfer, and run orchestration. `contentEditor.js` is 1,233 lines. Smaller modules make the upload rules easier to protect. |
| 16 | Type checking through JSDoc | Medium | Medium | `tsc --checkJs` on the backend finds wrong payload shapes between renderer, main, and worker without converting any file to TypeScript. |
| 17 | Screenshots when E2E fails | Low | Small | The Windows E2E job saves a screenshot only when an environment variable asks for one. Saving one on failure and uploading it as a workflow artifact makes a red run diagnosable. |
| 18 | Stop depending on the SheetJS download site | Low to Medium | Small | `xlsx` installs from `cdn.sheetjs.com`, which is blocked in restricted networks and already breaks installs in cloud sessions. Keep the tarball in the repository or a mirror. |

## UntitledUi branch

These apply to the redesign and are best done before it merges.

| # | Change | Impact | Effort | Why |
|---|---|---|---|---|
| 19 | Bring in the latest `main` | High | Small | The branch was behind `main` at review time. Its `test` script lacks the agent-instructions check, so `package.json` will conflict at merge. |
| 20 | Type check the components | Medium | Small | The branch adds 35 `.tsx` component files but no TypeScript compiler or `tsconfig`. The bundler strips types without checking them, so type errors pass CI. |
| 21 | Split the controller | Medium | Medium | `useController.js` is 1,335 lines and `sections.jsx` is 1,233. The old single `app.js` has moved into one hook. Splitting by workflow (Referral, LEIE, uploads) now is cheaper than after more features land. |
| 22 | Unit tests for `logic.js` | Medium | Small | Its 539 lines are plain functions with no screen dependency, so they can be tested on every platform instead of only through the Windows E2E run. |
| 23 | Remove unused copied components | Low | Small | Component folders such as avatar are in the branch but the app screens do not use them. They do not reach the bundle, but they add review and upkeep cost. |

## Lower priority: performance, docs, and housekeeping

| # | Change | Impact | Effort | Why |
|---|---|---|---|---|
| 24 | Stream large files | Medium for big runs | Medium to Large | Source JSON files are read and parsed whole (`processor.js`, `zipper.js`), up to 250 MB each, which costs several times that in memory. It matters most once the redesign allows generate runs over 1 GB. |
| 25 | Tidy the developer docs | Low | Small | `ARCHITECTURE.md` and `TESTING.md` carry leftover "Local 1.5.1 update" sections, and the test layer bullets are single paragraphs of over 1,000 characters. Release notes are spread over `RELEASE_NOTES.md` and one `RELEASE_UPDATE_x.y.z.md` per version. |
| 26 | Add `SECURITY.md` and `CONTRIBUTING.md` | Low | Small | A short statement of how credentials are stored and how to report a problem helps stakeholder and security reviews. |
| 27 | Delete stale branches | Low | Small | The repository had 17 remote branches at review time, including `V1.2`, `production-v1`, and three `feature/v1.3.9-*`. Deleting needs the owner's approval per branch, since unmerged work could be lost. |
| 28 | Share settings between teammates | Low to Medium | Medium | An export and import of upload targets and preferences, without passwords, would replace the manual OneDrive steps in `TEAM_SHARING_CHECKLIST.md`. |

## Not checked

The app and test suites were not run for this review. Repository secrets and branch protection settings were not visible.
