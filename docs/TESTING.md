# Testing

## Standard verification

```bash
pnpm verify
```

This regenerates packaged documentation, synchronizes version metadata, checks JavaScript syntax, and runs the functional smoke suite.

## Test layers

- `pnpm run test:syntax` parses the application and automation JavaScript.
- `pnpm run test:smoke` verifies the complete 1,573-row station JSON conversion, reference-only Station ID assignment, processing and validation, `999`-prefixed unique SSNs, selection-only SEOCs, security boundaries, temporary-file cleanup, and release helpers without opening the UI.
- `pnpm run test:e2e` launches the real Electron application, measures visible controls across Referral and LEIE workflows, checks accessible names and minimum interaction targets, verifies the 2:3 Upload User-to-Remote Directory width proportion and top alignment, exercises keyboard dropdown selection, and verifies a background referral-generation workflow. It is a native Windows check.
- `pnpm run dist` builds the NSIS Setup installer. Release CI additionally installs and launches that package, validates its executable, and generates its checksum.

## When to run more

- Backend, validation, configuration, or release-script change: run `pnpm verify`.
- Renderer, IPC, window, or worker integration change: also run `pnpm run test:e2e` on Windows.
- Packaging or release change: also run the Windows release workflow or `pnpm run dist`; do not treat a WSL-only result as installer validation.
