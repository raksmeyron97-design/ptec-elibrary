"use client";

// components/layout/NavbarStickyWrapper.tsx
// The header's scroll behaviour, in two shapes that never overlap:
//
//   ≥ lg (desktop, unchanged): after 60 px the bar re-forms as a floating
//   light "pill"; it slides away on scroll-down and back on scroll-up.
//
//   < lg (phones and tablets): the whole <header> is sticky — the rules are
//   `.site-header` in app/globals.css. This component only WRITES the state,
//   as attributes on <html>, and CSS does the rest:
//     data-topbar="hidden"       scrolled down past the bar — slide it away
//     data-topbar-scrolled       off the very top — give it a solid surface
//     data-topbar-mode="static"  the reading route — not sticky at all
//   Attributes rather than React state because the bar is a SERVER-rendered
//   element this client component sits inside, and a scroll handler that
//   re-renders is the jank this work removes. The same attribute switches
//   --ptec-sticky-top, so the page-level sticky bars (About sub-navigation,
//   thesis tabs, a learning path's progress card) sit under the top bar while
//   it is shown and at the top edge while it is not.
//
// No animation library. The pill's slide is the same 300 ms ease it had under
// framer-motion — now a CSS transition on transform — and the phone bar's is
// 200 ms ease-out in CSS; both are off under reduced motion.

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { isImmersiveReaderRoute } from "@/lib/nav/shell-routes";

type ScrollPhase = "top" | "fading" | "pill";

/** Phones: the bar never hides while it still sits over the page's own top. */
const PHONE_HIDE_AFTER = 80;
/** Phones: px of travel before a change of direction counts. Momentum
 *  scrolling jitters by a few px, and a bar that flickers is worse than one
 *  that never hides. */
const PHONE_SLOP = 6;

const LG_QUERY = "(min-width: 1024px)";
function subscribeLg(onChange: () => void) {
  const media = window.matchMedia(LG_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function readLg() {
  return window.matchMedia(LG_QUERY).matches;
}

export default function NavbarStickyWrapper({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<ScrollPhase>("top");
  const [hidden, setHidden] = useState(false);
  const ticking = useRef(false);
  const lastY = useRef(0);
  const anchorY = useRef(0);
  /** False for the first mount, true for every later pathname change. */
  const navigated = useRef(false);
  const pathname = usePathname() ?? "/";
  // `true` on the server and through hydration — what the old
  // useState(true) + effect gave — then the real answer, with no effect that
  // sets state.
  const isLg = useSyncExternalStore(subscribeLg, readLg, () => true);

  useEffect(() => {
    const root = document.documentElement;
    const setBar = (state: "shown" | "hidden") => {
      if (root.dataset.topbar !== state) root.dataset.topbar = state;
    };
    const update = () => {
      ticking.current = false;
      const y = Math.max(0, window.scrollY);

      // ≥ lg: the floating pill, exactly as before.
      setPhase(y < 10 ? "top" : y < 60 ? "fading" : "pill");
      // Hide on scroll-down (once the pill has fully formed), reveal the
      // moment the user scrolls back up. Only visible while the header is
      // actually fixed (pill phase).
      setHidden(y > lastY.current && y > 80);
      lastY.current = y;

      // < lg: the sticky top bar (CSS reads these; see the note at the top).
      root.toggleAttribute("data-topbar-scrolled", y >= 10);
      if (y <= PHONE_HIDE_AFTER) {
        setBar("shown");
        anchorY.current = y;
        return;
      }
      const travel = y - anchorY.current;
      if (travel > PHONE_SLOP) {
        // Keyboard focus inside the bar keeps it on screen.
        if (!document.activeElement?.closest(".site-header")) setBar("hidden");
        anchorY.current = y;
      } else if (travel < -PHONE_SLOP) {
        setBar("shown");
        anchorY.current = y;
      }
    };
    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    };
    // A keyboard user tabbing into a hidden bar brings it back.
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest(".site-header")) setBar("shown");
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocusIn);
      delete root.dataset.topbar;
      root.removeAttribute("data-topbar-scrolled");
    };
  }, []);

  // A new page starts with the bar on screen. On the reading route it is not
  // sticky at all: the reader fills the viewport below the header and carries
  // its own top bar, which a header sliding back in would cover.
  //
  // "A new page" means a NAVIGATION, which scrolls to the top. The first mount
  // is not one: a refresh partway down, a Back, or a link to a #fragment all
  // restore a scroll position, and forcing "shown" there overrides the answer
  // the scroll effect just computed — leaving the bar contradicting the page
  // until the reader happens to scroll again, because nothing re-fires.
  //
  // This was invisible while the announcement banner mounted after hydration:
  // the page grew by the banner's height, the browser's scroll anchoring
  // nudged scrollY, and THAT spurious scroll event corrected the state. The
  // bar's own correctness was resting on a layout shift.
  useEffect(() => {
    const root = document.documentElement;
    anchorY.current = window.scrollY;
    if (navigated.current || window.scrollY <= PHONE_HIDE_AFTER) {
      root.dataset.topbar = "shown";
    }
    navigated.current = true;
    if (isImmersiveReaderRoute(pathname)) root.dataset.topbarMode = "static";
    else delete root.dataset.topbarMode;
    return () => {
      delete root.dataset.topbarMode;
    };
  }, [pathname]);

  const isPill = phase === "pill" && isLg;
  const isTop  = phase === "top";

  return (
    <>
      <style>{`
        /* ── Pill mode: force light-mode token overrides ──
           The pill is always a light glass surface (bg-white/82), so ALL
           tokens must flip to their light values together — forcing only the
           text tokens left dark-theme surfaces (bg-bg-surface, bg-paper)
           under light-theme text, which failed WCAG contrast. Muted is
           #59677E (not the old #64748B, which was itself a contrast fail). */
        .is-pill {
          --ptec-text-heading: #0B1530 !important;
          --ptec-text-body: #334155 !important;
          --ptec-text-muted: #59677E !important;
          --ptec-brand: #1E3A8A !important;
          --ptec-brand-hover: #182E6E !important;
          --ptec-brand-contrast: #FFFFFF !important;
          --ptec-accent: #DDB022 !important;
          --ptec-bg-surface: #FFFFFF !important;
          --ptec-bg-body: #F3F4F6 !important;
          --ptec-bg-app: #F3F4F6 !important;
          --ptec-paper: #F3F4F6 !important;
          --ptec-border: #E5E7EB !important;
          --ptec-border-strong: #D6DAE0 !important;
          --ptec-divider: #E5E7EB !important;
          --ptec-focus-ring: #3A5FC4 !important;
          color: #1e293b !important;
        }
        .is-pill .dark\\:text-brand  { color: #1E3A8A !important; }
        .is-pill .dark\\:text-white  { color: #0f172a !important; }
        .is-pill .text-gold-200      { color: #806211 !important; }

        /* ── Slimmer inner row when pill ── */
        .is-pill > div {
          height: 3.25rem !important;   /* 52px — tighter than before */
          padding-left: 1.25rem !important;
          padding-right: 1.25rem !important;
          transition: height 0.18s ease, padding 0.18s ease;
        }
      `}</style>

      {/* Layout spacer so content doesn't jump when we go fixed */}
      {isPill && <div className="hidden lg:block h-[72px] w-full" aria-hidden="true" />}

      {/* ── Outer shell ─────────────────────────────────────── */}
      <div
        className={
          isPill
            ? "hidden lg:flex fixed top-0 inset-x-0 z-50 justify-center items-start pt-2.5 px-5 pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none"
            : "relative w-full z-40"
        }
        style={isPill && hidden ? { transform: "translateY(-100%)" } : undefined}
      >
        {/* ── Pill / bar shape morph — plain CSS transition ── */}
        <div
          style={{
            borderRadius: isPill ? 9999 : 0,
            boxShadow: isPill
              ? "0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)"
              : "none",
            transition:
              "border-radius 0.22s cubic-bezier(.3,1.4,.6,1), box-shadow 0.22s ease",
          }}
          className={[
            "pointer-events-auto relative",
            isPill
              ? [
                  "is-pill",
                  "w-fit max-w-[calc(100vw-2.5rem)]",
                  "bg-white/82 backdrop-blur-md saturate-150",
                  "border border-white/55",
                ].join(" ")
              : [
                  "w-full border-b-2 border-accent",
                  // Below lg the <header> itself carries the scrolled
                  // surface (app/globals.css `.site-header`) — and no blur.
                  isTop
                    ? "bg-transparent"
                    : "lg:bg-bg-surface/90 lg:backdrop-blur-md lg:shadow-sm",
                ].join(" "),
          ].join(" ")}
        >
          {children}
        </div>
      </div>
    </>
  );
}
