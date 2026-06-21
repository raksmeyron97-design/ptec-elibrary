"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveal — tiny scroll-triggered animation island.
 *
 * Pass entrance classes via `className` using the `[&.is-visible]:` arbitrary
 * variant for the "shown" state, e.g.:
 *
 *   <Reveal className="opacity-0 translate-y-3 transition-all duration-700
 *                      [&.is-visible]:opacity-100 [&.is-visible]:translate-y-0" />
 *
 * Reduced-motion users get the final state immediately (no transition).
 * Animates once, then disconnects.
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children?: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`${className}${shown ? " is-visible" : ""}`}
    >
      {children}
    </div>
  );
}