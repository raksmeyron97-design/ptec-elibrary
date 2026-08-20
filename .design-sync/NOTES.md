# design-sync notes — PTEC e-Library

- **The converter needs an explicit entry**: `ptec-e-library` is a virtual package (this is an app repo, nothing installed under `node_modules/ptec-e-library`). Always pass `--entry .design-sync/ptec-e-library.ts`. Full re-sync command:
  ```sh
  node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules \
    --entry .design-sync/ptec-e-library.ts --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
  ```
- **`buildCmd` (`node .ds-sync/compile-css.mjs`) does two things**: compiles `app/globals.css` (Tailwind v4) AND prepends `.design-sync/fonts.css` (remote Google Fonts `@import` + the `--font-var-*` custom properties next/font normally sets on `<html>`). Run it before the converter whenever `app/globals.css`, the Tailwind theme, or `app/fonts.ts` changed. `compile-css.mjs` is repo-owned, not a skill script — the `cp -r` re-stage never overwrites it.
- **Raw Khmer regex broke bundle evaluation** (2026-08: `[BUNDLE_EXPORT] 19/19 not a component`, pageerror `SyntaxError: Invalid regular expression: Range out of order`): a literal `[ក-៿]` in `GeneratedBookCover.tsx` breaks when `_ds_bundle.js` is evaluated in a non-UTF-8 document. Fixed with `ក-៿` escapes in the source. If it recurs, `grep -c 'ក' ds-bundle/_ds_bundle.js` — any hit means a new raw Khmer literal entered the bundle.
- **ThemeToggle needs next-intl context** (`useTranslations("nav")` throws without it). Handled by `.design-sync/preview-provider.tsx` (`PreviewIntlProvider`), wired via `extraEntries` + `provider`. The two aria-label strings are **inlined copies** of `messages/en.json` → `nav.switchToDark`/`nav.switchToLight` (full en.json is 260 KB — too big to bundle).
- **All 19 `.d.ts` props bodies are hand-written in `cfg.dtsPropsFor`** — the extractor only parses shipped `.d.ts` files, and this app repo has none (`[DTS] parsed 0 .d.ts files`). When a component's props change in source, update its `dtsPropsFor` entry or the design agent gets a stale contract.
- **`guidelinesGlob` is pinned to `docs/ACCESSIBILITY-FOCUS.md`** — the default glob swept 33 engineering/ops docs (RLS matrix, runbooks, DDoS, privacy inventory) into `guidelines/`, which are useless-to-harmful for the design agent.
- **Fonts are all Google-hosted** (matches `app/fonts.ts`: Inter, Hanuman, Crimson Pro, Angkor, Koulen; Kantumruy Pro appears in fallback stacks). No font files ship; `[FONT_REMOTE]` on validate is the expected OK state.
- **Project history**: the original project (`90fa38b0-…`) was deleted on claude.ai/design; a fresh "PTEC Digital Library" (`644eff15-f7e9-4adb-86f0-19acb1265cfa`) was created and fully synced 2026-08-19. 19 components, 12 with authored previews (all graded good), 7 skeletons render-check-gated.

## Known render warns

- `[TOKENS_MISSING] --dash-* / --pill / …` (15 vars): admin-dashboard arbitrary-value utilities compiled into globals from `app/admin.css` consumers. None of the 19 synced components reference them. Non-blocking, expected on every sync.

## Re-sync risks

- `preview-provider.tsx` inlines two `nav.*` strings — silently stale if those keys change in `messages/en.json` (cosmetic only: aria-labels).
- `cfg.dtsPropsFor` duplicates source prop types for all 19 components — drifts silently when props change; spot-check against sources on component edits.
- `.design-sync/fonts.css` must track `app/fonts.ts` (families and `--font-var-*` names) by hand.
- `conventions.md` enumerates utility classes that exist only because the app uses them — if the app drops a class, the compiled CSS drops it too; re-run the conventions validation pass each sync (the skill does this by default).
- The build assumed Node 26 / esbuild+ts-morph installed in `.ds-sync/node_modules`; playwright-core pinned chromium 1228 (present in `~/.cache/ms-playwright`).
