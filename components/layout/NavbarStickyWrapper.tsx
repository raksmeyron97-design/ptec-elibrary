"use client";

import { useMotionValueEvent, useScroll, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

type ScrollPhase = "top" | "fading" | "pill";

export default function NavbarStickyWrapper({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<ScrollPhase>("top");
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => {
    if (y < 20)       setPhase("top");
    else if (y < 120) setPhase("fading");
    else              setPhase("pill");
  });

  const isPill = phase === "pill";
  const isTop  = phase === "top";

  return (
    <>
      <style>{`
        .is-pill {
          --ptec-text-heading: #0B1530 !important;
          --ptec-text-body: #334155 !important;
          --ptec-text-muted: #64748B !important;
          --ptec-brand: #1E3A8A !important;
          --ptec-brand-hover: #182E6E !important;
          --ptec-accent: #DDB022 !important;
          color: #1e293b !important;
        }
        .is-pill .dark\\:text-brand {
          color: #1E3A8A !important;
        }
        .is-pill .dark\\:text-white {
          color: #0f172a !important;
        }
        .is-pill .text-gold-200 {
          color: #806211 !important;
        }
        /* Make the inner content slimmer */
        .is-pill > div {
          height: 3.5rem !important; /* h-14 */
          padding-left: 1.5rem !important; /* px-6 */
          padding-right: 1.5rem !important; /* px-6 */
          transition: all 0.5s ease-out;
        }
      `}</style>

      {/* Layout spacer — prevents page-content jump when we go position:fixed */}
      {isPill && <div className="h-[72px] w-full" aria-hidden="true" />}

      {/* ── Outer positioning shell ─────────────────────────────── */}
      <div
        className={
          isPill
            ? "fixed top-0 inset-x-0 z-50 flex justify-center items-start pt-3 px-6 pointer-events-none"
            : "relative w-full z-40"
        }
      >
        {/* ── The navbar pill / bar itself ────────────────────────── */}
        <motion.div
          initial={false}
          animate={{
            borderRadius: isPill ? 9999 : 0,
            boxShadow: isPill
              ? "0 8px 30px rgba(0,0,0,0.06)"
              : "none",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 35, mass: 0.85 }}
          className={[
            "pointer-events-auto transition-all duration-500 ease-out relative",
            isPill
              ? [
                  "is-pill",
                  "w-fit max-w-[calc(100vw-3rem)]",
                  // Ultra-Premium Frosted Glass
                  "bg-white/70 backdrop-blur-xl saturate-150",
                  // Crisp Borders
                  "border border-white/50"
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
