---
name: Renderer UI
description: Rules for the Electron renderer HTML, CSS, and JavaScript
applyTo: "electron/renderer/**"
---

# Renderer rules

`docs/DEVELOPMENT.md` (Change rules) is authoritative; these are the points most often missed.

- Plain HTML, CSS, and browser JavaScript. No framework, bundler, or new runtime dependency.
- The page runs under a Content-Security-Policy with context isolation. Do not add inline scripts, remote resources, or `eval`. Reach the backend only through the API exposed by `electron/preload.js`.
- Use the control tokens in `styles.css`. Text inputs, selects, compact dropdown shells, and date composites use `--control-height`; buttons and options meet `--control-touch-target`. No one-off field heights or fixed control widths.
- Keep form rows responsive with flexible grid columns. Preserve the upload-target row's 2:3 Upload User to Remote Directory proportion and its narrow-screen stacking.
- Preserve native labels, accessible names, visible focus, disabled and invalid states, and keyboard operation on every control. Dialogs must stay usable at 150%, 200%, and 300% zoom.
- Hiding an environment in the UI is not authorization. `electron/backend/workflowPolicy.js` enforces it.
- Do not force user-entered text to upper or lower case; searches may stay case-insensitive.
- `scripts/smoke-test.js` asserts on specific markup, CSS, and strings in these files. When you rename an id, class, token, or message, update the assertions in the same change.
- Renderer changes require `pnpm verify` plus `pnpm run test:e2e` on Windows (or the Windows CI job). Update `docs/USER_GUIDE.md` when a user-visible workflow changes.
