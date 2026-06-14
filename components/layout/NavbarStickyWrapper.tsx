"use client";

import { useMotionValueEvent, useScroll, motion } from "framer-motion";
import { useState, useEffect, type ReactNode } from "react";

type ScrollPhase = "top" | "fading" | "pill";

export default function NavbarStickyWrapper({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<ScrollPhase>("top");
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => {
    if (y < 10)       setPhase("top");
    else if (y < 60) setPhase("fading");
    else              setPhase("pill");
  });

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
        /* ── Pill mode: force light-mode token overrides ── */
        .is-pill {
          --ptec-text-heading: #0B1530 !important;
          --ptec-text-body: #334155 !important;
          --ptec-text-muted: #64748B !important;
          --ptec-brand: #1E3A8A !important;
          --ptec-brand-hover: #182E6E !important;
          --ptec-accent: #DDB022 !important;
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
        {/* ── Pill / bar ──────────────────────────────────── */}
        <motion.div
          initial={false}
          animate={{
            borderRadius: isPill ? 9999 : 0,
            /*
             * FIXED: was 300/35 — felt sluggish because high damping killed
             * the snap. New values: higher stiffness + lower damping =
             * quicker settle with a tiny satisfying bounce.
             */
            boxShadow: isPill
              ? "0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)"
              : "none",
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 32,
            mass: 0.7,
          }}
          className={[
            "pointer-events-auto relative",
            isPill
              ? [
                  "is-pill",
                  "w-fit max-w-[calc(100vw-2.5rem)]",
                  /*
                   * FIXED blur: added saturate(150%) so the frosted-glass
                   * effect is visible even on light/white backgrounds.
                   * Reduced from backdrop-blur-xl to backdrop-blur-md to improve scroll performance on desktop.
                   */
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
        </motion.div>
      </div>
    </>
  );
}