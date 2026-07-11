"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";

type ScrollPhase = "top" | "fading" | "pill";

export default function NavbarStickyWrapper({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<ScrollPhase>("top");
  const ticking = useRef(false);

  useEffect(() => {
    const update = () => {
      ticking.current = false;
      const y = window.scrollY;
      setPhase(y < 10 ? "top" : y < 60 ? "fading" : "pill");
    };
    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [isLg, setIsLg] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    setIsLg(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsLg(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

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
            ? "hidden lg:flex fixed top-0 inset-x-0 z-50 justify-center items-start pt-2.5 px-5 pointer-events-none"
            : "relative w-full z-40"
        }
      >
        {/* ── Pill / bar — CSS transition (was a framer spring; the ~35 KB
             library isn't worth a bounce on a navbar) ── */}
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
                  isTop
                    ? "bg-transparent"
                    : "bg-bg-surface/90 backdrop-blur-md shadow-sm",
                ].join(" "),
          ].join(" ")}
        >
          {children}
        </div>
      </div>
    </>
  );
}
