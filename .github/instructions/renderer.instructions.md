---
name: Renderer UI
description: Rules for the Electron renderer React application
applyTo: "electron/renderer/**"
---

# Renderer rules

`docs/DEVELOPMENT.md` (Change rules) is authoritative; these are the points most often missed.

- The renderer is a React application in `electron/renderer/src/`, built from the vendored Untitled UI React components in `src/ui/` and bundled by `scripts/build-renderer.js` into the gitignored `electron/renderer/dist/`. Use the existing components before adding new ones, and do not add another UI framework or runtime dependency.
- The page runs under a Content-Security-Policy with context isolation. Do not add inline scripts, remote resources, or `eval`. Reach the backend only through the API exposed by `electron/preload.js`.
- Style with the Untitled UI theme tokens and Tailwind utilities; `src/app.css` holds the few global rules. Text inputs, selects, and date fields share one control height. No one-off field heights or fixed control widths, and keep the layout fluid from 640 by 480 up to 4K.
- Keep form rows responsive with flexible grid columns. Preserve the upload-target row's 2:3 Upload User to Remote Directory proportion and its narrow-screen stacking.
- Preserve native labels, accessible names, visible focus, disabled and invalid states, and keyboard operation on every control. Dialogs must stay usable at 150%, 200%, and 300% zoom.
- Hiding an environment in the UI is not authorization. `electron/backend/workflowPolicy.js` enforces it.
- Do not force user-entered text to upper or lower case; searches may stay case-insensitive.
- `scripts/smoke-test.js` asserts on specific ids and strings in these files, and `scripts/electron-e2e-test.js` drives the real window by element id. When you rename an id, class, token, or message, update the assertions in the same change.
- Renderer changes require `pnpm verify` plus `pnpm run test:e2e` on Windows (or the Windows CI job). Update `docs/USER_GUIDE.md` when a user-visible workflow changes.
