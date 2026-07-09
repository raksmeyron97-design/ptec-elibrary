"use client";
import { useEffect, useRef } from "react";

export default function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const bar = barRef.current;
      if (!bar) return;
      const d = document.documentElement;
      const max = d.scrollHeight - d.clientHeight;
      bar.style.width = max > 0 ? Math.min(100, (d.scrollTop / max) * 100) + "%" : "0%";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-[3px] z-[60] pointer-events-none bg-transparent">
      <div ref={barRef} className="h-full bg-accent w-0" style={{ transition: "width 50ms linear" }} />
    </div>
  );
}
