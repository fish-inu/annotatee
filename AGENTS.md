# AGENTS.md

Guidance for coding agents working in this repository.

## Project Snapshot

Annotatee is a Manifest V3 Chrome extension for annotating readable article text.
It has two main surfaces:

- A Vue 3 + Vite popup UI loaded from `index.html`.
- Extension scripts bundled separately with Rolldown for the background service worker and content script.

The extension detects an article-like root on the current page, lets users annotate selected text, stores annotations in `chrome.storage.local`, and exports annotations as Markdown.

## Repository Map

- `package.json`: npm scripts and dependency list.
- `public/manifest.json`: Chrome extension manifest. Vite copies this into `dist/`.
- `public/assets/contentScript.css`: CSS injected by the content script through the manifest.
- `src/main.ts`: popup app mount point.
- `src/App.vue`: popup UI, settings, active-tab messaging, Markdown copy flow.
- `src/styles.css`: popup-only styles.
- `src/extension/background.ts`: context-menu registration and selection annotation trigger.
- `src/extension/contentScript.ts`: page-side annotation controller, popover UI, state updates, and storage calls.
- `src/extension/readability.ts`: readable article detection using `@mozilla/readability` plus local fallback scoring.
- `src/extension/storage.ts`: annotation/settings persistence with localStorage fallbacks for non-extension contexts.
- `src/extension/messages.ts`: runtime message type guards.
- `src/extension/types.ts`: shared extension contracts, defaults, limits, and normalization helpers.
- `src/extension/url.ts`: canonical URL and page-key helpers.
- `src/domain/annotationContext.ts`: pure text-span context extraction.
- `src/domain/markdown.ts`: Markdown export formatting.
- `rolldown.config.mjs`: builds `dist/assets/background.js` and `dist/assets/contentScript.js`.

## Environment And Package Management

- This repo currently has `package-lock.json`; use npm commands unless the user explicitly asks to switch package managers.
- `package.json` has a `devEngines` entry mentioning pnpm, but there is no `pnpm-lock.yaml`. Do not create a new lockfile or migrate package managers casually.
- If dependencies are missing, run `npm install`.
- `node_modules/` and `dist/` are intentionally ignored.

## Commands

- `npm run dev`: start the Vite dev server for the popup UI.
- `npm run build`: primary validation command. Runs `vue-tsc --noEmit`, builds the Vite popup, then bundles extension scripts with Rolldown.
- `npm run build:extension-scripts`: rebuild only `background.ts` and `contentScript.ts` into `dist/assets/`.
- `npm run preview`: preview the built popup UI with Vite.

There is no dedicated lint or test script at the moment. For most changes, run `npm run build` before handing work back. If a change is isolated to docs only, mention that the build was not necessary.

To test the full extension manually:

1. Run `npm run build`.
2. Open Chrome Extensions.
3. Enable Developer mode.
4. Load the `dist/` directory as an unpacked extension.
5. Visit an article page, select readable article text, and use the "Annotate selection" context menu or double-click/selection popover.

## Coding Practices

- Keep TypeScript strict-clean. `npm run build` includes `vue-tsc --noEmit`.
- Prefer small, local changes that preserve the current extension architecture.
- Keep shared data contracts and defaults in `src/extension/types.ts`.
- Update `src/extension/messages.ts` when adding or changing runtime message shapes.
- Keep pure text/formatting logic in `src/domain/` so it can stay independent of Chrome and DOM APIs.
- Keep Chrome API access guarded when code may execute outside the extension context; existing fallbacks are used for popup/dev contexts.
- Preserve Manifest V3 constraints. Background code runs as a service worker and content script UI must avoid leaking page styles.
- When changing persisted annotation or settings data, add normalization/backward compatibility in `types.ts` or `storage.ts`.
- When changing content-script UI, update `public/assets/contentScript.css`; it is copied into `dist/assets/` by Vite from `public/`.
- When changing popup UI, update `src/App.vue` and `src/styles.css` together.

## Style Notes

- Existing code uses single quotes, semicolons, two-space indentation, and explicit TypeScript interfaces/types.
- Vue code uses `<script setup lang="ts">` with Composition API refs/computed helpers.
- CSS uses compact class-based selectors, fixed popup dimensions around `390px`, and 7-8px radii.
- Avoid unrelated formatting churn; there is no formatter script configured.
- Keep comments sparse and useful. Prefer clear function names and small helpers over narration.

## Verification Expectations

Run the narrowest useful check, then summarize it:

- Docs-only change: no build required.
- Type, message, storage, popup, content script, manifest, or bundling change: run `npm run build`.
- UI behavior change: run `npm run build` and, when feasible, manually load `dist/` in Chrome to verify popup/content-script behavior.
- Dependency change: update `package.json` and `package-lock.json` together, then run `npm run build`.

If you cannot run a relevant command because of sandboxing, missing dependencies, or environment limits, say exactly what blocked it and what should be run next.
