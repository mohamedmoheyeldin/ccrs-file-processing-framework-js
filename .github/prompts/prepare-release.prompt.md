---
name: prepare-release
description: Prepare version metadata and notes for a release without publishing it
agent: agent
argument-hint: "version, for example 1.5.5"
---

Prepare release ${input:version:new version, for example 1.5.5} of the CCRS File Processing Framework. Do not create a tag, publish a release, or upload anything.

1. Read the "Versioning" section of `README.md` and "Team announcement for every release" in `docs/DEVELOPMENT.md`.
2. Summarize the commits since the previous release tag and draft user-facing release notes from them.
3. Edit only `config/app_version.json`: `version`, `releaseTag`, `label`, a new unique `announcementId`, `releaseNotes`, and optional `teamHighlights`. Do not hand-edit `package.json` or `docs/RELEASE_UPDATE.md`.
4. Add the new section at the top of `docs/RELEASE_NOTES.md` using the existing heading pattern, and update the version references in `README.md`.
5. Update the version assertions in `scripts/smoke-test.js` that pin the current version.
6. Run `corepack pnpm verify` so the synchronized files regenerate, and include them in the change. Do not commit a PDF regenerated on Linux.
7. Stop and list what the maintainer must do next: review, merge, and run the release workflow.
