---
name: Documentation
description: Rules for README and docs
applyTo: "README.md,docs/**/*.md"
---

# Documentation rules

- Update `README.md` and the relevant file under `docs/` in the same change as the behavior, setup, or architecture change.
- Generated, do not edit by hand: `docs/RELEASE_UPDATE.md` (from `config/app_version.json`) and the PDFs under `docs/` (from `scripts/generate-user-guide-pdf.js`). Do not commit a PDF rendered on Linux; the Windows fonts differ.
- `scripts/smoke-test.js` asserts on headings and phrases in `docs/RELEASE_NOTES.md`. Keep the existing `## Version X.Y.Z Release Notes` heading pattern, newest first.
- Describe only delivered behavior. Label ideas as proposed, keep reported timings distinct from measured benchmarks, and do not imply a plugin mechanism exists.
- Never include real credentials, hostnames of protected environments, or patient data in examples. Use the `999-00-0000` to `999-99-9999` SSN test range.
