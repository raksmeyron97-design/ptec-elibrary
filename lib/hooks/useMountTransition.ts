"use client";

// CSS-only replacement for framer-motion's AnimatePresence: keeps an element
// mounted long enough to play its exit transition, then removes it.
// `mounted` drives rendering; `shown` drives the transition classes/styles.
import { useEffect, useState } from "react";

export function useMountTransition(open: boolean, durationMs = 240) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two rAFs so the initial (offscreen) styles paint before transitioning in.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(id);
  }, [open, durationMs]);

  return { mounted, shown };
}
