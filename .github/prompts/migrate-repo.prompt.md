---
name: migrate-repo
description: Connect this project to a new GitHub repository and update every reference
agent: agent
argument-hint: "new repository URL"
---

Move this project to the repository at: ${input:url:new repository URL, for example https://github.com/<org>/<repo>}

Follow `docs/REPOSITORY_MIGRATION.md`. In short:

1. Confirm the working tree is clean (`git status`). Stop and ask if it is not.
2. Preview with `corepack pnpm run migrate:repo ${input:url} --dry-run` and show the output.
3. Run `corepack pnpm run migrate:repo ${input:url}`. It rewrites hardcoded references, keeps the old remote as `personal`, and makes the new repository `origin`.
4. If the script lists files that still mention the old repository, fix them by hand.
5. Run `corepack pnpm verify` and fix any failure without weakening a test.
6. Commit as `chore: point repository references at the new GitHub repository`.
7. Push branches only: `git push -u origin main` (plus any other branch the maintainer names). Never use `--tags`, `--mirror`, or `--all`; a `v*` tag starts the release workflow. Ask before pushing if the new repository is not empty.
8. Check on the new repository that the "Smoke tests" workflow started and report its result.
9. Finish with the checklist of items only the maintainer can do, from "Settings the maintainer must add" in the migration guide: Actions enabled and runners, secrets, branch protection, Copilot agent access and firewall allowlist, and anything specific to a GitHub Enterprise host.

Never write tokens, passwords, or certificate contents into a file or the chat.
