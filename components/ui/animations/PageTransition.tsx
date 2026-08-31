"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "@/i18n/navigation";

/**
 * Cross-fades <main> on route change.
 *
 * ── Why the `mounted` gate ───────────────────────────────────────────────────
 * useReducedMotion() is a client-only signal: it has no answer during SSR and
 * resolves after hydration. Branching the RENDERED ELEMENT on it therefore made
 * the server emit `<main>` while the client's first render wanted
 * `<div style="opacity:0; transform:translateY(10px)">`, and React reported
 *
 *   Hydration failed because the server rendered HTML didn't match the client
 *
 * on every public page. The cost is not cosmetic: React discards the
 * server-rendered tree and re-renders the whole thing on the client, which
 * throws away the benefit of prerendering these pages at all, and it made the
 * focus-system e2e assertions flaky because they run against a tree that is
 * being regenerated underneath them.
 *
 * Rendering `children` bare until mounted makes the server output and the first
 * client render identical by construction, so there is nothing to mismatch. The
 * wrapper appears in the commit after hydration, and every subsequent route
 * change animates normally — the transition a reader can actually perceive is
 * the one BETWEEN pages, which is unaffected.
 *
 * Do not "simplify" this back to an early `if (reduceMotion)` return: that is
 * the exact shape that broke, and a production build will not catch it — the
 * mismatch only appears when a browser hydrates the page.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Server and first client render agree: no wrapper, no inline animation style.
  if (!mounted || reduceMotion) return <>{children}</>;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.995 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
