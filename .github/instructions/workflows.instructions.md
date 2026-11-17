---
name: GitHub Actions workflows
description: Rules for CI and release workflows
applyTo: ".github/workflows/**"
---

# Workflow rules

- Pin every action to a full commit SHA with the version in a trailing comment, as the existing workflows do.
- Keep `permissions` minimal (`contents: read` unless a job must write).
- Use Node.js 24 and `corepack enable` followed by `pnpm install --frozen-lockfile`.
- `scripts/smoke-test.js` asserts on the contents of `release.yml` and `smoke-tests.yml`; update those assertions with any intentional change.
- The release workflow is the only publishing path. Do not add jobs that create tags, publish releases, or upload to CCRS targets, and do not expose signing secrets to pull-request jobs.
- `copilot-setup-steps.yml` must keep a single job named `copilot-setup-steps`; Copilot ignores other job names.
