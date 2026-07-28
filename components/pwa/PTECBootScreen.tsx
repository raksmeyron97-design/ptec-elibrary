import { PWA_SPLASH, PWA_SPLASH_DARK } from "@/lib/pwa/launch";

// ─────────────────────────────────────────────────────────────────────────────
// The PTEC startup screen.
//
// WHAT PROBLEM THIS SOLVES. A cold launch of the installed app used to paint a
// solid near-black frame with nothing on it for ~1.8 s (measured on a throttled
// Pixel 7, slow-4G + 4x CPU) before the first pixel of UI appeared. The platform
// splash is supposed to cover that window, and on Android it now does — but on
// a streamed render the shell arrives well before the page content, and that
// second gap is this component's job.
//
// WHY IT IS NOT A REACT COMPONENT WITH STATE. Three constraints, all of which a
// `useEffect`-driven loader violates:
//
//   1. It must be visible in the FIRST painted frame. Anything that waits for
//      hydration is by definition too late — hydration is one of the things the
//      user is waiting through.
//   2. It must disappear the instant there is something better to look at, with
//      no timer. A `setTimeout` that keeps the splash up for a fixed period is
//      a lie about how long the app took to start.
//   3. It must be impossible for it to get stuck covering the app.
//
// So it is plain server-rendered markup plus one CSS rule. RootShell renders
// `<div data-ptec-shell-ready hidden />` immediately after {children}; during a
// streamed response the browser parses that marker only once the shell above it
// exists, and `:has()` re-evaluates live against the growing DOM. The overlay
// therefore uncovers itself at exactly the right moment, driven by nothing but
// the HTML arriving. No script, no state, no timer, no CSP hash.
//
// HOW THE EMBLEM IS DELIVERED IS LOAD-BEARING. Three ways were measured on a
// throttled Pixel 7 (slow-4G + 4x CPU, median of five cold loads):
//
//   <img fetchpriority="high">  → FCP 2.37 s — preempted the stylesheet
//   inlined as a 144px data URI → FCP 2.21 s — +21 KB gzipped on the document,
//                                 because React serialises the head into the
//                                 RSC flight payload too, so base64 costs DOUBLE
//   plain <img>, no priority hint → FCP 1.98 s — what ships
//
// Default priority is the whole trick: an in-viewport image is fetched AFTER
// the render-blocking CSS instead of against it, so the wordmark paints exactly
// when it did without an emblem and the emblem lands a beat later. Every launch
// after the first serves it from the precache, so it is instant. Do not add
// fetchpriority, and do not inline it "to save a request".
//
// SAFETY. The whole thing is inside `@supports selector(body:has(*))`, so a
// browser that cannot evaluate the hiding rule never renders the overlay in the
// first place — it cannot be trapped behind it. A failsafe keyframe uncovers
// the app after 8 s in the one remaining bad case (the response dies mid-stream
// and the marker never arrives), so a broken load shows the partial page rather
// than an eternal splash.
// ─────────────────────────────────────────────────────────────────────────────

/** Inline, so it is parsed with the document instead of waiting on the
 *  render-blocking stylesheet to define the overlay. `style-src` already
 *  carries 'unsafe-inline' in both policies (lib/csp.ts SHARED_DIRECTIVES), so
 *  this needs no nonce and no hash. */
const BOOT_STYLES = `
#ptec-boot{display:none}
@supports selector(body:has(*)){
/* NOTE — do not add an html background rule here to "fix" the white frame a
   screencast shows at ~20ms. It was tried and measured: that frame is painted
   at navigation commit, BEFORE the parser reaches this stylesheet, so no CSS
   in the document can reach it. First paint then waits on the render-blocking
   stylesheet, so there is never a frame where this rule would be the thing on
   screen. In the installed PWA that pre-parse canvas comes from the manifest
   background_color (ink, app/manifest.ts); in a browser tab it is hidden by
   paint holding. */
/* 100dvh, not 100vh: on mobile the visual viewport shrinks when browser chrome
   appears, and 100vh would leave the bottom row of this screen underneath it.
   inset:0 handles the installed app; dvh handles the browser tab. */
#ptec-boot{position:fixed;inset:0;z-index:9999;min-height:100dvh;
display:grid;grid-template-rows:1fr auto;justify-items:center;
padding:calc(2.5rem + env(safe-area-inset-top)) 1.5rem calc(2.5rem + env(safe-area-inset-bottom));
background:${PWA_SPLASH};color:#0B1530;text-align:center;
animation:ptec-boot-failsafe 1ms linear 8s forwards}

/* A whisper of the brand navy at the top and gold at the foot. Two very low
   alpha radials rather than a gradient across the whole surface, so there is
   no banding on 6-bit phone panels. */
#ptec-boot::before{content:"";position:absolute;inset:0;pointer-events:none;
background:radial-gradient(120% 55% at 50% 0%,rgba(30,58,138,.05),transparent 70%),
radial-gradient(90% 45% at 50% 100%,rgba(221,176,34,.06),transparent 70%)}

/* Brand block: centred in the space above the indicator. */
#ptec-boot-brand{position:relative;align-self:center;display:flex;flex-direction:column;
align-items:center;gap:1.125rem;max-width:22rem}
/* Sized in CSS as well as via width/height so the box is reserved before the
   file lands — the emblem fades into a space that already exists, so nothing
   below it moves. */
#ptec-boot-emblem{width:116px;height:116px;object-fit:contain;
animation:ptec-boot-breathe 3.2s ease-in-out infinite}
@media (min-height:700px){#ptec-boot-emblem{width:132px;height:132px}}
@media (max-width:340px){#ptec-boot-emblem{width:96px;height:96px}}

#ptec-boot-km{margin:0;font-size:.9375rem;line-height:1.9;font-weight:700;color:#1E3A8A;
font-family:var(--font-var-hanuman),system-ui,sans-serif}
#ptec-boot-name{margin:.125rem 0 0;font-size:1.5rem;line-height:1.15;font-weight:700;
letter-spacing:.06em;text-transform:uppercase;color:#0B1530;
font-family:var(--font-var-serif),Georgia,"Times New Roman",serif}
#ptec-boot-rule{width:2.25rem;height:2px;border-radius:2px;background:#DDB022;margin:.875rem auto .75rem}
#ptec-boot-org{margin:0;font-size:.8125rem;line-height:1.5;color:#59677E;
font-family:var(--font-var-sans),system-ui,sans-serif}

/* Indicator + label sit low, as a quiet footer rather than the subject. */
#ptec-boot-status{position:relative;display:flex;flex-direction:column;align-items:center;
gap:.625rem;font-size:.75rem;color:#59677E;
font-family:var(--font-var-sans),system-ui,sans-serif}
#ptec-boot-status .km{font-family:var(--font-var-hanuman),system-ui,sans-serif;line-height:1.8}
#ptec-boot-dots{display:flex;gap:.375rem}
#ptec-boot-dots i{width:6px;height:6px;border-radius:50%;background:#1E3A8A;opacity:.25;
animation:ptec-boot-dot 1.3s ease-in-out infinite}
#ptec-boot-dots i:nth-child(2){animation-delay:.18s}
#ptec-boot-dots i:nth-child(3){animation-delay:.36s}

/* Dark readers get the same composition on the app's own dark surface, so the
   startup screen never flashes bright at someone who chose dark. The class is
   already on <html> — THEME_INIT_SCRIPT sets it before first paint. */
.dark #ptec-boot{background:${PWA_SPLASH_DARK};color:#EEF2FB}
.dark #ptec-boot::before{background:
radial-gradient(120% 55% at 50% 0%,rgba(138,164,228,.07),transparent 70%),
radial-gradient(90% 45% at 50% 100%,rgba(244,222,138,.05),transparent 70%)}
.dark #ptec-boot-km{color:#B3C5EF}
.dark #ptec-boot-name{color:#EEF2FB}
.dark #ptec-boot-org,.dark #ptec-boot-status{color:#A9B6D4}
.dark #ptec-boot-rule{background:#F4DE8A}
.dark #ptec-boot-dots i{background:#8AA4E4}

@keyframes ptec-boot-breathe{0%,100%{opacity:.9;transform:scale(1)}50%{opacity:1;transform:scale(1.025)}}
@keyframes ptec-boot-dot{0%,100%{opacity:.22;transform:translateY(0)}50%{opacity:.95;transform:translateY(-3px)}}
@keyframes ptec-boot-failsafe{to{opacity:0;visibility:hidden}}

/* The hand-off. Scale is on the brand block, not the full-screen overlay: a
   transform on a fixed element that size forces a large layer repaint. */
body:has([data-ptec-shell-ready]) #ptec-boot{
opacity:0;visibility:hidden;transition:opacity .22s ease,visibility 0s linear .22s}
body:has([data-ptec-shell-ready]) #ptec-boot-brand{
transform:scale(.99);transition:transform .22s ease}

@media (prefers-reduced-motion:reduce){
#ptec-boot-emblem,#ptec-boot-dots i{animation:none}
#ptec-boot-dots i{opacity:.55}
body:has([data-ptec-shell-ready]) #ptec-boot{transition:none}
body:has([data-ptec-shell-ready]) #ptec-boot-brand{transform:none;transition:none}}
}
`;

/** Goes in <head>, before the stylesheet link, so the overlay is fully styled
 *  the moment it can paint. */
export function PTECBootStyles() {
  return <style id="ptec-boot-style" dangerouslySetInnerHTML={{ __html: BOOT_STYLES }} />;
}

/**
 * The overlay itself. Must be the FIRST child of <body> so the HTML parser
 * reaches it before anything else.
 *
 * Bilingual by construction rather than by lookup: the locale is knowable here
 * (RootShell has it), but showing both lines means the startup frame is
 * identical for every visitor and never waits on a message bundle. It also
 * matches how the library signs itself everywhere else.
 *
 * The two names are PROPS, not literals. They are the published organization
 * identity (lib/system-settings), which RootShell has already resolved for the
 * JSON-LD graph — hardcoding them here would make the startup screen a second
 * source of truth that publishing a new library name never reaches.
 * lib/settings-consistency.test.ts enforces that.
 */
export default function PTECBootScreen({
  libraryName,
  organizationName,
  organizationNameKm,
}: {
  libraryName: string;
  organizationName: string;
  organizationNameKm: string;
}) {
  return (
    // aria-busy rather than aria-live: this text never changes, so announcing it
    // as a live region would make a screen reader re-read the whole screen on
    // any surrounding mutation. role="status" alone conveys "loading".
    <div id="ptec-boot" role="status" aria-busy="true">
      <div id="ptec-boot-brand">
        {/* Decorative: the institution is named in text directly below, so an
            alt here would make a screen reader say it twice.
            A plain <img>, deliberately — see the note at the top of this file
            about why fetchpriority and data URIs both cost FCP. width/height
            reserve the box so nothing shifts when it lands. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image
            needs JS to resolve a srcset; this must be parser-discoverable and
            must not be upgraded to a priority fetch. */}
        <img id="ptec-boot-emblem" src="/pwa/boot-emblem.webp" alt="" width={132} height={132} decoding="async" />
        <div>
          <p id="ptec-boot-km" lang="km">
            {organizationNameKm}
          </p>
          <p id="ptec-boot-name">{libraryName}</p>
          <div id="ptec-boot-rule" />
          <p id="ptec-boot-org">{organizationName}</p>
        </div>
      </div>

      <div id="ptec-boot-status">
        <div id="ptec-boot-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>Opening PTEC Library…</span>
        <span className="km" lang="km">
          កំពុងបើកបណ្ណាល័យ…
        </span>
      </div>
    </div>
  );
}

/**
 * The marker that dismisses the overlay. Rendered immediately after {children}
 * so the parser only reaches it once the app shell above it exists.
 *
 * It carries no styling and is `hidden`; `:has()` matches on DOM structure, not
 * on rendering, so being display:none is fine and keeps it out of the layout
 * and the accessibility tree.
 */
export function PTECShellReadyMarker() {
  return <div data-ptec-shell-ready hidden />;
}
