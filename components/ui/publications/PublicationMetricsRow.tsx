"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { Eye, Download, ListOrdered, CalendarDays, type LucideIcon } from "lucide-react";

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function CountUp({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (!inView || reduced || target <= 0) return;
    const duration = 700;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, target]);

  return <span ref={ref}>{compact(reduced ? target : value)}</span>;
}

type Metric = {
  icon: LucideIcon;
  label: string;
  value: number | string;
  animate?: boolean;
};

/**
 * Compact metrics strip under the publication hero: views, downloads,
 * reference count, and year. Numeric values count up on first scroll into
 * view (skipped when the user prefers reduced motion).
 */
export default function PublicationMetricsRow({
  views,
  downloads,
  referenceCount,
  year,
  labels,
}: {
  views: number;
  downloads: number;
  referenceCount: number;
  year: string | null;
  labels: { views: string; downloads: string; references: string; year: string };
}) {
  const metrics: Metric[] = [
    { icon: Eye, label: labels.views, value: views, animate: true },
    { icon: Download, label: labels.downloads, value: downloads, animate: true },
    { icon: ListOrdered, label: labels.references, value: referenceCount, animate: true },
    ...(year ? [{ icon: CalendarDays, label: labels.year, value: year } as Metric] : []),
  ];

  // A plain list, not a <dl>: the icon + value-above-label layout can't
  // satisfy the strict dl > div > dt,dd content model (axe definition-list).
  return (
    <ul className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-divider bg-divider sm:grid-cols-4">
      {metrics.map((m) => (
        <li key={m.label} className="flex items-center gap-3 bg-bg-surface px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/15 bg-brand/5 text-brand">
            <m.icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-6 text-text-heading">
              {typeof m.value === "number" && m.animate ? <CountUp target={m.value} /> : m.value}
            </p>
            <p className="truncate text-[11px] leading-4 text-text-muted">{m.label}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
