"use client";

import { useEffect, useState, useRef } from "react";

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AnimatedStat({ targetValue }: { targetValue: number }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    
    let observer: IntersectionObserver;
    let animationFrameId: number;
    
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setValue(targetValue);
      return;
    }

    const startAnimation = () => {
      let startTimestamp: number | null = null;
      const duration = 2000; // 2 seconds animation

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

    observer = new IntersectionObserver((entries) => {
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
  }, [targetValue]);

  return <span ref={ref}>{formatStat(value)}</span>;
}
