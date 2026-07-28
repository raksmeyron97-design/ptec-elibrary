import { PWA_INK } from "@/lib/pwa/launch";

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
// WHY THERE IS NO EMBLEM HERE. There was, and it was measured out. Every byte
// on this screen is paid for at first paint, because FCP is gated by a 41 KB
// render-blocking stylesheet already contending with a 100 KB hero preload:
//
//   <img fetchpriority="high">, 17 KB → FCP 2.37 s (stole stylesheet bandwidth)
//   inlined as a 224px data URI       → FCP 2.21 s (no request, fatter document)
//   inlined as a 128px data URI       → FCP 2.18 s
//   typography only                   → FCP 1.94 s, equal to having no boot screen
//
// (throttled Pixel 7, slow-4G + 4x CPU, median of five cold loads.) The RSC
// flight payload serialises this markup a second time, so anything added here
// costs roughly double. Repeating the emblem would also be redundant: the
// platform splash renders it at full resolution in the frame immediately
// before this one, so the startup sequence reads as one continuous screen that
// gains a wordmark rather than as two logo screens in a row.
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
#ptec-boot{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;
align-items:center;justify-content:center;gap:1.25rem;
padding:calc(2rem + env(safe-area-inset-top)) 1.5rem calc(2rem + env(safe-area-inset-bottom));
background:${PWA_INK};color:#EEF2FB;text-align:center;
font-family:var(--font-var-serif),Georgia,"Times New Roman",serif;
animation:ptec-boot-failsafe 1ms linear 8s forwards}
#ptec-boot-name{font-size:1.75rem;line-height:1.2;font-weight:600;letter-spacing:-.01em;margin:0;
animation:ptec-boot-breathe 2.4s ease-in-out infinite}
#ptec-boot-org{font-size:.8125rem;line-height:1.4;color:#A9B6D4;margin:0;max-width:22rem;
font-family:var(--font-var-sans),system-ui,sans-serif}
#ptec-boot-rule{width:2.5rem;height:2px;border-radius:2px;background:#DDB022;opacity:.85}
#ptec-boot-status{display:flex;flex-direction:column;align-items:center;gap:.375rem;
font-size:.8125rem;color:#A9B6D4;font-family:var(--font-var-sans),system-ui,sans-serif}
#ptec-boot-status .km{font-family:var(--font-var-hanuman),system-ui,sans-serif;line-height:1.8}
#ptec-boot-dots{display:flex;gap:.3125rem}
#ptec-boot-dots i{width:6px;height:6px;border-radius:50%;background:#DDB022;
animation:ptec-boot-dot 1.2s ease-in-out infinite}
#ptec-boot-dots i:nth-child(2){animation-delay:.16s}
#ptec-boot-dots i:nth-child(3){animation-delay:.32s}
@keyframes ptec-boot-breathe{0%,100%{opacity:.82;transform:scale(1)}50%{opacity:1;transform:scale(1.035)}}
@keyframes ptec-boot-dot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
@keyframes ptec-boot-failsafe{to{opacity:0;visibility:hidden}}
body:has([data-ptec-shell-ready]) #ptec-boot{
opacity:0;visibility:hidden;transition:opacity .2s ease,visibility 0s linear .2s}
@media (prefers-reduced-motion:reduce){
#ptec-boot-name,#ptec-boot-dots i{animation:none}
#ptec-boot-dots i{opacity:.7}
body:has([data-ptec-shell-ready]) #ptec-boot{transition:none}}
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
}: {
  libraryName: string;
  organizationName: string;
}) {
  return (
    <div id="ptec-boot" role="status" aria-live="polite">
      <div>
        <p id="ptec-boot-name">{libraryName}</p>
        <p id="ptec-boot-org">{organizationName}</p>
      </div>
      <div id="ptec-boot-rule" />
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
