"use client";

import { useEffect, useState, useRef } from "react";

// Mirrors formatCount() in lib/collection-stats.ts — including the
// `km-u-nu-latn` rule, which renders Latin digits for Khmer. The rule is
// duplicated rather than imported because that module reaches the service
// client, which must never be pulled into a client bundle. Keep the two in
// step: public counts are formatted one way site-wide.
function formatStat(n: number, locale: string): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  return new Intl.NumberFormat(locale === "km" ? "km-u-nu-latn" : locale).format(Math.floor(n));
}

export default function AnimatedStat({
  targetValue,
  locale = "en",
  durationMs = 1200,
}: {
  targetValue: number;
  locale?: string;
  durationMs?: number;
}) {
  // Start at the real value so server HTML (crawlers, no-JS, screen readers)
  // carries the true figure; the count-up runs from 0 only once JS + the
  // IntersectionObserver kick in.
  const [value, setValue] = useState(targetValue);
  const ref = useRef<HTMLSpanElement>(null);
  
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    
    let animationFrameId: number;
    
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setValue(targetValue);
      return;
    }

    const startAnimation = () => {
      let startTimestamp: number | null = null;
      const duration = durationMs;

      const step = (timestamp: number) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // easeOutExpo for a snappy start and slow finish
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        
        setValue(Math.floor(ease * targetValue));
        
        if (progress < 1) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          setValue(targetValue);
        }
      };
      
      animationFrameId = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        startAnimation();
        observer.disconnect(); // only animate once
      }
    }, { threshold: 0.1 }); // triggers when 10% visible
    
    observer.observe(el);

    return () => {
      if (observer) observer.disconnect();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [targetValue, durationMs]);

  return <span ref={ref}>{formatStat(value, locale)}</span>;
}
