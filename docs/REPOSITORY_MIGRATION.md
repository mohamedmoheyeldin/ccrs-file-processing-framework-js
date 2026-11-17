# Repository Migration

Use this when the project moves to a new GitHub repository, for example from a personal account to a VA GitHub organization or a GitHub Enterprise host. Given the new repository URL, the steps below are scripted so GitHub Copilot or Claude Code can carry them out.

## Quick path

In Copilot Chat (VS Code, agent mode):

```text
/migrate-repo https://github.com/<org>/<repo>
```

Or from a terminal:

```bash
corepack pnpm run migrate:repo https://github.com/<org>/<repo> --dry-run   # preview
corepack pnpm run migrate:repo https://github.com/<org>/<repo>
corepack pnpm verify
git commit -am "chore: point repository references at the new GitHub repository"
git push -u origin main
```

HTTPS, `git@host:org/repo.git`, and `ssh://` URLs are accepted. Use the form your work laptop authenticates with.

## What the script does

`scripts/migrate-repo.js`:

- Detects the current repository from the workflow badge in `README.md` (override with `--from <old-repo-url>`).
- Rewrites every hardcoded reference to it in tracked text files: web URLs, SSH URLs, and bare `owner/repo` slugs. Today that is only the two badges at the top of `README.md`. `pnpm-lock.yaml` and binary files are left alone.
- On a host other than `github.com`, replaces the shields.io release badge with a plain Releases link, because shields.io cannot read a GitHub Enterprise host.
- Renames the existing `origin` remote to `personal` (change with `--keep-remote-as <name>`) and adds the new repository as `origin`, so the personal copy stays reachable. Skip remote changes with `--no-remote`.
- Lists any file that still mentions the old repository.

It never pushes, creates tags, publishes a release, or uploads anything. Running it again with the same URL changes nothing.

## What needs no change

- Both workflows use `${{ github.token }}` and `$env:GITHUB_REPOSITORY`, so CI and the release workflow follow the repository they run in.
- The application has no update URL or repository link compiled in, and `package.json` has no `repository` field.
- `AGENTS.md`, `.github/copilot-instructions.md`, the path-scoped instructions, prompts, and `.vscode/` settings contain no repository name.

## Pushing safely

- Push branches only. Do not use `git push --tags`, `--mirror`, or `--all`: a tag matching `v*` starts the release workflow in the new repository and would publish a release there.
- Push the history you want. The `UntitledUi` branch and other work branches stay on the personal remote unless you push them deliberately.
- Before the first push, confirm the repository contains nothing that should not enter the organization. `config/upload_credentials.json`, `upload_import/WinSCP.ini`, `.env` files, and logs are already ignored by Git.

## Settings the maintainer must add

These live in the new repository's or organization's settings and cannot be set from the code.

| Item | Where | Why |
|---|---|---|
| GitHub Actions enabled, with Linux and Windows runners available | Settings, Actions | "Smoke Test" runs on `ubuntu-latest`; "Electron E2E (Windows)" and the release build run on `windows-latest`. If the organization uses its own runner labels, change `runs-on` in the three workflows. |
| The pinned actions are allowed | Organization Actions policy | Workflows use `actions/checkout` and `actions/setup-node` pinned by commit SHA. |
| `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` secrets | Settings, Secrets and variables, Actions | Code-signing certificate for the Setup installer. Add them only if this repository will publish signed releases. |
| Workflow permissions allow `contents: write` for the release workflow | Settings, Actions, General | The release workflow creates the GitHub release with the built-in token. |
| Branch protection on `main` requiring "Smoke Test" and "Electron E2E (Windows)" | Settings, Branches or Rulesets | Matches the checks used today. |
| Network access to `registry.npmjs.org`, `cdn.sheetjs.com`, and the Electron download host | Runner or proxy configuration | `pnpm install --frozen-lockfile` downloads the SheetJS tarball and the Electron binary. |
| Copilot access for the repository, and the cloud agent if wanted | Organization Copilot policies; repository Settings, Copilot | Instructions and prompts work as soon as Copilot is enabled. `copilot-setup-steps.yml` takes effect once it is on the default branch. |
| Copilot cloud agent MCP servers and firewall allowlist | Repository Settings, Copilot, cloud agent | Optional. Dependencies are installed by the setup workflow before the firewall applies. |
| Dependabot or other dependency scanning | Settings, Code security | None is configured in this repository; add it if the organization requires it. |

### GitHub Enterprise hosts

If the new repository is not on `github.com`:

- Actions referenced from `github.com` must be available through GitHub Connect or mirrored into the enterprise.
- The release workflow uses the `gh` CLI, which reads the host from the runner; self-hosted runners need `gh` installed.
- `.vscode/mcp.json` points at the `github.com` Copilot MCP endpoint. Remove the entry or replace it with the endpoint your organization provides.

## Verify

1. `corepack pnpm verify` passes locally.
2. `git remote -v` shows the new repository as `origin`.
3. After the push, the "Smoke tests" workflow passes in the new repository and the README badge renders.
4. Copilot Chat lists the prompts (`/verify-change`, `/migrate-repo`, and the rest) and cites `.github/copilot-instructions.md` in its references.

## Keeping both repositories

The personal repository stays available as the `personal` remote. To carry a change across, fetch it and merge or cherry-pick onto a branch, then open a pull request in the destination. The README badges can only point at one repository; re-run the script with the other URL and `--no-remote` if a branch needs the other set.
