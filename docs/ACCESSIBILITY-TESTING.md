# Accessibility Testing — Manual Checklist

_Automated coverage: axe-core runs in Playwright (`e2e/a11y.spec.ts`, light +
dark, EN + KM, including the PDF reader) and Lighthouse CI asserts
accessibility ≥ 95 on core routes weekly. Automation catches ~40% of WCAG
issues — run this manual pass before any major UI release and quarterly
otherwise. Last full pass: 2026-07-10 (WCAG AA)._

## Keyboard (no pointer)

- [ ] Tab from the address bar: first stop is "Skip to content"; it works.
- [ ] Navbar: every dropdown (Digital Library, About, More) opens with
      Enter/Space, closes with Escape, arrow keys move within.
- [ ] Mobile drawer (narrow window): opens from the menu button, focus moves
      inside, Tab cycles within (trap), Escape closes, focus returns to the
      menu button.
- [ ] Books mobile filter sheet: same contract as the drawer; every filter
      pill reachable; Clear all / Done reachable; Escape closes.
- [ ] `/books`: reach and operate search, category pills, sorts, pagination.
- [ ] Book detail → open reader: "/" focuses nav search (capture-phase
      listener), reader shortcuts work, Escape exits fullscreen.
- [ ] Forms (login, contact): every field, error, and submit reachable;
      errors are announced and focus moves to the first invalid field.
- [ ] No focus ever lands on an invisible/offscreen control; the focus ring
      is visible on every stop (dark AND light theme).

## VoiceOver (macOS/iOS Safari)

- [ ] Rotor lists a sane heading outline on /home, /books, /theses
      (one h1; cards are h3 under an h2).
- [ ] Filter changes on /books announce the new result count (aria-live).
- [ ] Thesis cards read: title → author → advisor → abstract, and the
      Download/Cite buttons have distinct names (not "button button").
- [ ] Images: covers announce the title; decorative hero images are silent.
- [ ] The language switcher announces current + target language.
- [ ] PDF reader: page navigation announces page numbers; toolbar buttons
      have names.

## NVDA (Windows/Firefox or Chrome)

- [ ] Repeat the VoiceOver list; NVDA is stricter about aria-owns and live
      regions (pdf.js aria-owns was stripped for a reason — verify no
      regression: reader pages must not double-announce).
- [ ] Browse mode reads listing pages linearly without focus jumps.

## Zoom & reflow (WCAG 1.4.4 / 1.4.10)

- [ ] 200% browser zoom at 1280px: no clipped controls, navbar collapses
      into More/mobile layout gracefully.
- [ ] 400% zoom (=320px reflow): single-column, no horizontal scrolling
      (automated guard: `e2e/overflow.spec.ts`), filter sheet still usable.
- [ ] iOS text-size increase (Settings → Display): body text scales, no
      overlap in cards.

## Khmer-specific

- [ ] Khmer headings/labels never clip vertically (Khmer script has taller
      ascenders/descenders — watch `line-clamp` and fixed heights on cards,
      navbar labels, drawer items).
- [ ] `/km` pages: `<html lang="km">`; mixed-language elements (English
      titles inside Khmer UI) still readable.
- [ ] Khmer text in the PDF reader search highlights correctly.
- [ ] Voice output: VoiceOver Khmer voice reads Khmer labels (spot-check the
      nav + a thesis card); no romanized gibberish.

## Reduced motion & color

- [ ] OS "reduce motion": drawer/sheet appear without slide animation,
      hero constellation stays calm, no parallax.
- [ ] Windows High Contrast / forced-colors: controls keep visible borders.
- [ ] Spot-check contrast in BOTH themes after any token change — the pill
      navbar overrides tokens and has bitten before (see
      NavbarStickyWrapper).

## Sign-off

Record date, tester, browser/AT versions, and any exceptions in this file's
history. Blocking bar for release: no keyboard traps, no unreachable
functionality, no unannounced result updates, no horizontal overflow.
