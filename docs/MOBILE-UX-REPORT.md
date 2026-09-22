# Mobile app-feel — report (MUX-01 … MUX-11)

Branch `mobile/app-feel`, cut from `main` @ `77fcf16`, 2026-09-21. Phones
(below `lg`) only: the desktop layout is unchanged, measured, not assumed.
The shell was already strong (`docs/MOBILE-GLASS-UI.md`); this pass closes the
gaps *between* screens and gestures — getting back, dismissing a sheet,
reading with a finger — fixes one real reader bug, and adds polish.

Every claim below carries an evidence class:
**VERIFIED_EMULATED** (Playwright with touch against the local stack),
**VERIFIED_LOCAL** (a unit test or the source), **NEEDS_DEVICE** (only a
physical phone can prove it). Nothing here was run on a real phone.

## 1. Summary

| ID | What changed on a phone | Commit | Evidence |
|---|---|---|---|
| MUX-03 | **Bug:** reader HUD buttons obey `hidden` / `md:hidden` / `md:inline-flex` again | `81e8b8a` | EMULATED + LOCAL |
| MUX-04 | Reader: a tap toggles the bars, a finger scroll down hides them, page-edge taps turn pages | `db05953` | EMULATED + LOCAL |
| MUX-05 | Reader: a page scrubber in the phone bottom bar | `4c4f481`, `49765eb` | EMULATED + LOCAL |
| MUX-06 | Reader: the screen stays awake while reading | `99e2627` | LOCAL · NEEDS_DEVICE |
| MUX-01 | ‹ Back and the page title in the top bar on pushed screens | `9c423e7` | EMULATED + LOCAL |
| MUX-02 | Every sheet pulls down to close | `016cb66` | EMULATED + LOCAL |
| MUX-07 | Tapping the current tab scrolls to the top; no long-press menu | `cbd3455` | EMULATED |
| MUX-08 | Share opens the phone's own share sheet; Khmer accessible names | `c3a677e` | LOCAL + EMULATED (names) · NEEDS_DEVICE |
| MUX-09 | Scroll reveal per item, CSS only | `c5f1793` | EMULATED + LOCAL |
| MUX-10 | Reader focus mode on Android: real fullscreen, rotation unlocked | `eae20b9` | LOCAL + EMULATED · NEEDS_DEVICE |
| MUX-11 | Store-style install sheet (manifest screenshots); quieter footer in the installed app | `d0416ae`, `91d7128` | LOCAL + EMULATED (cascade) · NEEDS_DEVICE |

A reference patch series existed for all eleven. **Every patch was read
against the spec before use, and eleven defects in them were fixed** — none
visible to the harness the patches were tested in, all pinned by a test now:

| Where | Defect in the reference patch | Fix |
|---|---|---|
| MUX-03 unit scan | Did not strip comments; the fix's own comment quoted the forbidden rule | Brace-tracked, comment-stripped scan |
| MUX-04 | Go to page, the panel and menus render INSIDE the reader root, so a finger on "Go" counted as reading and the jump hid the bars | Overlays (`[data-reader-overlay]`) count as controls |
| MUX-04 | A PageDown or wheel scroll after a touch could hide the bars | A key or mouse move resets "last input was touch" |
| MUX-04 | A deferred tap-hide toggled blindly — if the idle timer hid the bars inside the 300 ms window, the tap SHOWED them | The deferred hide re-reads visibility |
| MUX-05 | Committed on `pointerup`/`pointercancel`/`blur`; the spec says only `change` | Those events only clear a no-op drag |
| MUX-05 | A scrub longer than 3 s hid (and made inert) the bar under the finger on iOS | A drag or `input` on the controls is activity |
| MUX-01 | The title observer attached to the first `<h1>` once; a replaced heading left it on a removed node, which reads as "scrolled away" | Follows main's first `<h1>`, ignores disconnected nodes |
| MUX-02 | A second finger mid-pull left the sheet hanging with its transition off; `touchcancel` could close it | Both spring back |
| MUX-09 | `view()` follows the nearest scroll container; `BrowseBooksSection` was `overflow: hidden`, so **7 of the homepage's 11 reveals never played** | `overflow-clip` (same clipping, no scroll container) + an e2e invariant |
| MUX-10 | Cleanup exited whatever was fullscreen, someone else's video included | Exits only the reader's own fullscreen |
| MUX-11 | The screenshot capture script drove production without aborting non-GET requests | Every non-GET request is aborted |

## 2. Per task

Screenshots are local artefacts under `reports/mobile/` (git-ignored by
design): `shots-before/` (Phase 0, production build, local seed),
`shots-after-prod/` (same build setup, Phase 3 head), `shots-reader/`
(reader, before/after), `shots-after/` (dev-server crops).

**MUX-03 — reader HUD breakpoints (bug).** An unlayered
`.reader-btn { display: inline-flex }` beat every Tailwind utility (they live
in `@layer utilities`). Phones drew the desktop-only Search, Panel, Theme and
Bookmark in the top bar — six controls where the design has "← 1/40 ⋯";
desktops drew the phone-only page pill, Bookmark and Panel. The base rule is
now in `@layer components`. The side effect is wider than "flex-1 now
applies": every utility that collided with the base rule now applies as
written — `px-2`…`px-5` on dialog and error buttons, `min-w-[4.25rem]` on the
zoom pill, `text-[12px]` in the selection popup. The Go-to-page sheet was
checked at 390 px; the settings sheet is pixel-identical.

**MUX-04 — the reader on touch.** A finger on the page is no longer
"activity". A tap toggles the bars (shown at once; hidden after the 300 ms
double-tap window, so a double-tap zoom never blinks them); a finger scroll
down more than 24 px hides them; scrolling up never brings them back; in
single-page mode at fit width the outer fifth of the page turns it, with no
double-tap zoom there. A scroll the controls caused — the scrubber, Go to
page, a scroll within 600 ms of touching the HUD — never hides them. Mouse,
pen and keyboard are unchanged.

**MUX-05 — page scrubber.** The phone bottom bar's middle is a native range
input (🔖 · ━━●━━ 17 % · ☰). A bubble names the page under the thumb and the
percentage follows it; the reader moves once, on `change` — also what a
keyboard arrow and a screen reader's adjust gesture send. `ZoomControl`'s
`compact` variant (its only caller) is deleted; phones zoom by pinch, double
tap, the +/− keys and Page sizing. Three existing reader specs read the zoom
level from the phone zoom control and were updated (`49765eb`).

**MUX-06 — wake lock.** The full reader (`layout="fill"`) and focus mode hold
a Screen Wake Lock; the embedded preview never asks. Released after 5 min
without a touch, scroll or key; re-taken on the next and on becoming visible.

**MUX-01 — pushed screens.** One level down the bar puts ‹ Back before the
brand; once the `<h1>` is above the bar the brand crossfades to the heading's
first line ("Library Team", not both languages). Back is a history Back when
the previous entry is this site (`navigation.canGoBack`, or a count of client
navigations without it) and goes UP to `backTarget()` when the reader landed.
Desktop header boxes were measured identical at 1280 and 1024 px.

**MUX-02 — pull to close.** Every `GlassSheet` (Explore, Saved, More, the
search filters). Claimed on the first `touchmove` while cancelable and only
when the list is at its top; closes past a quarter of its height or on a
≥ 0.5 px/ms flick; a finger that paused before lifting is not a flick.

**MUX-07 — tab bar.** Home on Home scrolls to the top with no request; a
modified click is left to the browser; the bar blocks selection, the touch
callout and the context menu.

**MUX-08 — share.** On a coarse pointer, `navigator.share({ title, url })`;
a dismissal is an answer, any other failure opens the grid. The three
hard-coded English names now come from `share.title` and `nav.close`
(verified on `/km`: "ចែករំលែក", dialog "ចែករំលែក", close "បិទ").

**MUX-09 — scroll reveal.** `.reveal` is a scroll-driven animation: each
element fades up over the first 140 px of its own entry, inset by the tab
bar; behind `@supports (animation-timeline: view())` and
`prefers-reduced-motion: no-preference`. The wrappers are server components
with no JavaScript. See the `overflow-clip` fix above.

**MUX-10 — Android fullscreen.** `useFocusFullscreen` (extracted): focus mode
on a coarse pointer requests fullscreen with the navigation UI hidden and
unlocks rotation; the system Back out of fullscreen leaves focus mode.

**MUX-11 — install sheet and footer.** The manifest lists three narrow
780×1688 screenshots (captured from production, GET-only, and looked at), only
the files on disk, never precached. In `display-mode: standalone` on a phone
the footer's brand row and mission line step out; every link stays. The rule
is unlayered on purpose — it must beat the elements' utilities.

## 3. Tests added, with negative controls

Every new invariant was broken on purpose and seen to fail, then restored.

| Test | Pins | Negative controls run |
|---|---|---|
| `components/ui/reader/reader-css.test.ts` | reader component classes set `display` only from a layer (`.reader-btn`, `.reader-scrubber`) | 5: unlayer `.reader-btn`; delete the rule; delete the HUD classes; unlayer `.reader-scrubber`; plus a comment quoting the rule, which must NOT fail · e2e: unlayered, the 390/1280 check fails |
| `hooks/useAutoHideControls.test.ts` (12) | the touch rules of §2 MUX-04/05 | 6 · e2e: all four touch tests fail on the pre-change code |
| `hooks/useReaderGestures.test.ts` (10) | tap/double-tap/edge classification | 2 |
| `ReaderScrubber.test.tsx` (6) | draft, commit on `change` only, Khmer digits | 2 · e2e: a commit-per-step scrubber fails the one-jump check |
| `hooks/useScreenWakeLock.test.ts` (6) + `PDFViewer.test.tsx` (2) | the lock's lifecycle; which readers ask | 5 |
| `components/layout/TopBarBack.test.tsx` (6) + `backTarget` cases | Back and the title observer | 4 unit + 3 e2e |
| `lib/hooks/useSheetDrag.test.ts` (11) | the pull-to-close decision rules | 5 unit + 2 e2e |
| `components/ui/books/ShareButton.test.tsx` (7) | native share and its fallbacks, Khmer names | 4 |
| `components/ui/animations/reveal-css.test.ts` | `.reveal` hides only behind both guards, layered, opacity/transform only | 4 · e2e: restoring `overflow-hidden` fails 2 |
| `hooks/useFocusFullscreen.test.ts` (8) | fullscreen + rotation, only its own exit | 4 unit + 1 e2e |
| `app/manifest.test.ts` (4) | screenshots exist, declare their REAL size (PNG IHDR), Chrome's ratio rules | 2 + 1 sw-policy · e2e: a layered standalone rule fails the footer check |

e2e (Playwright, local stack): `reader-ux` (breakpoints at 390/1280; touch:
tap toggles, a real finger scroll hides, edge taps; scrubber drag lands near
¾ with ONE page change; ArrowRight commits; fullscreen), `mobile-shell`
(pushed screens, both Back branches incl. no Navigation API, Khmer; pull to
close; current-tab to top), `mobile-motion` (reveal timing, the
no-scroll-container invariant, reduced motion), `footer-mobile` (the served
standalone rule applied inside its own layers). Real touch input is
`e2e/utils/touch.ts` — CDP `Input.dispatchTouchEvent`, **stamped**
(`timestamp`), because on this machine each dispatch took 30–75 ms to land
and a "fast" flick otherwise arrived at 0.45 px/ms.

## 4. Verification

| Gate | Result |
|---|---|
| `npx vitest run` (after each phase) | Phase 3: 373 files / 7,686 tests passed, 0 failed |
| `tsc --noEmit`, eslint on every changed file | clean (one pre-existing ShareButton warning) |
| e2e gate per phase (the five §5 specs; + `reader-performance` after Phases 1 and 3) | Phase 3: 127 passed / 19 skipped (by design) / 2 failed at 2 workers; both pass re-run (the tab-transition test 8/8 at load 7–18). Every gate failure this pass was load (averages up to 77) and passed serially — except three Phase 1 reader specs, which were real (fixed in `49765eb`). |
| `npm run build` | passes (clean `.next`, isolated worktree, Phase 3 head) |
| Page weight `--budget` (vs the base rebuilt in the same pipeline) | all pages ok. Document: home −0.8 KB, `/books` +0.8 KB, a book +1.6 KB. First-load JS: +0.6–0.9 KB gz per page |
| react-doctor (pinned 0.2.16, full scan, base vs HEAD) | errors unchanged (375 / 3 / 5). Two new warnings: a chained array iteration (fixed, `91d7128`) and the deliberate non-passive `touchmove` in `useSheetDrag`. `npm run doctor` (`@latest`) crashes on `components/about/DdcExplorer.tsx` at base and HEAD alike — its counts are not usable |

**Found in passing, not fixed:**
- `scripts/measure-page-weight.ts` parses only `--book /path` (space form);
  the documented `--budget` invocation measures `/books` twice and labels
  the second "book detail". Every measurement here passed `--book`.
- `InfiniteBookGrid` is imported by nothing, so `/books` does not reveal.
- `GoogleSearchModal`, `AdvancedSearchModal` and the posts `ImageGallery`
  hard-code English accessible names (a separate task was proposed).

## 5. Not verified

Nothing ran on a physical phone. The native share sheet, the real wake lock,
Android fullscreen and rotation, the install sheet and the standalone footer
are NEEDS_DEVICE; `display-mode` cannot be emulated by Playwright or by this
Chromium's CDP. WebKit (Mobile Safari) e2e was not run (`PW_WEBKIT=1`
opt-in). iOS rubber-banding under a pulled sheet is a device check.

## 6. Device walk (NEEDS_DEVICE)

Gestures and layout (MUX-01, 02, 04, 05, 07, 09): `npm run dev -- -H 0.0.0.0`,
open `http://<LAN-IP>:3000` on a phone on the same Wi-Fi. If the terminal logs
"Blocked cross-origin request", add the IP to `allowedDevOrigins` in
`next.config.ts` for the session and never commit it. Secure-context features
(wake lock, native share) need `localhost`: Android over USB with
`chrome://inspect/#devices` → Port forwarding 3000 → `localhost:3000`; iPhone
after deploy. The installed app (fullscreen inside it, the install sheet, the
standalone footer) needs the service worker: a production build through the
same port-forward, or production.

1. Search → open a book → scroll → tap ‹. You return to the results where you were.
2. Open Explore and pull it down; a short pull springs back; a flick closes.
3. Open the reader, scroll with a finger: the bars step aside.
4. Tap: the bars return. Tap again: they go.
5. Double-tap: it zooms, and the bars do not blink.
6. Single-page mode (⋯ → Single page): tap the page edges.
7. Scrub to the end and back: one jump each, bars stay up.
8. Leave one page open for 60 s: the screen stays on (secure context).
9. Tap Share on a book: the phone's own sheet (secure context).
10. Android: enter focus mode, turn the phone sideways.
11. Android: "Install app" shows the screenshot sheet; in the installed app the footer has no brand block.

## 7. Future work (Phase 5, not started)

- A cover morph from card to book page with React `<ViewTransition name>`,
  the name set on the tapped cover at click time, behind a flag.
- Move the hand-rolled sheets onto `GlassSheet` (the `/books` and `/posts`
  filters, Share — which also gives its close button 44 px — and the
  reader's phone panel); they gain pull-to-close for free.
- A page turn that follows the finger in single-page mode.
- A haptic tick (`navigator.vibrate(8)`, Android) on bookmark and tab change.
- `.reveal` on the real `/books` grid, theses, paths and posts (a product call).
