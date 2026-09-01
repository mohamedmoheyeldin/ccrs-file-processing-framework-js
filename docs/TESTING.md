# Testing

## Standard verification

```bash
pnpm verify
```

This regenerates packaged documentation, synchronizes version metadata, checks JavaScript syntax, and runs the functional smoke suite.

## Test layers

- `pnpm run test:syntax` parses the application and automation JavaScript.
- `pnpm run test:smoke` verifies the complete 1,573-row station conversion, exact long Station IDs through JSON/gzip, the separate 752-record regular and nine-record Situational SEOC catalogs with zero logical overlap, paired assignment, unique Referral/ICN generation, VA/iFAMS/mixed/custom Referral prefixes, shared Archive naming modes and filename safety, settings persistence, authoritative environment policy, path and schema safety, fail-closed processing, manifest hashes, protected credentials, cleanup, and release helpers without opening the UI.
- `pnpm run test:e2e` launches the real Electron application, measures visible controls across Referral and LEIE workflows, checks accessible names and minimum interaction targets, verifies the shared compact option-card dimensions, expandable contextual help, live-preview markers, and two-column/one-column responsive layouts, then exercises the exact ID/Number option layout, separate regular and Situational results, manual-selection warning, use-all, clear, missing-saved-value fallback, and filename previews. It finishes by verifying a background generation job creates only the expected JSON, gzip, and manifest artifacts. PR CI runs the full smoke suite on Windows immediately before this test so Windows path behavior is verified before release tagging.
- `pnpm run dist` builds the NSIS Setup installer. Release CI additionally installs and launches that package, validates its executable, and generates its checksum.

## When to run more

- Backend, validation, configuration, or release-script change: run `pnpm verify`.
- Renderer, IPC, window, or worker integration change: also run `pnpm run test:e2e` on Windows.
- Packaging or release change: also run the Windows release workflow or `pnpm run dist`; do not treat a WSL-only result as installer validation.
