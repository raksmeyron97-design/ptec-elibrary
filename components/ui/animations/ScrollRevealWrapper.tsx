"use client";

// Scroll-reveal without framer-motion: a shared IntersectionObserver flips a
// data attribute and CSS does the rest (see .scroll-reveal in globals.css).
// SSR/no-JS safety: content starts fully visible and only gets the hidden
// starting state once the observer is attached, so nothing can be stuck
// invisible if JS fails or the element is already in view.
import { useEffect, useRef, type ReactNode } from "react";

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.revealed = "true";
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    // Arm the hidden state only when the element starts below the viewport —
    // otherwise reveal instantly (no flash for above-fold content).
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight) {
      el.dataset.revealed = "false";
      io.observe(el);
    } else {
      el.dataset.revealed = "true";
    }

    return () => io.disconnect();
  }, []);

  return ref;
}

// Standard fade-up for an entire section or block
export function ScrollRevealWrapper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`scroll-reveal ${className ?? ""}`}>
      {children}
    </div>
  );
}

// Container for staggered children
export function StaggerRevealContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`scroll-reveal-stagger ${className ?? ""}`}>
      {children}
    </div>
  );
}

// Individual item for staggered list — delay comes from CSS nth-child rules.
export function StaggerRevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`scroll-reveal-item ${className ?? ""}`}>{children}</div>;
}
