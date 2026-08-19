"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { Eye, Download, ListOrdered, CalendarDays, type LucideIcon } from "lucide-react";
import type { PublicationMetrics } from "@/lib/publications/integrity";

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
  /** Short visible caption, e.g. "Views". */
  label: string;
  /** Full phrase read to assistive tech, e.g. "79 views". */
  srLabel: string;
  value: number | string;
  animate?: boolean;
};

/**
 * Compact metrics strip under the publication masthead.
 *
 * Values arrive already derived and already zero-suppressed from
 * publicationMetrics() — the single source shared with the sidebar rail, so
 * the two blocks cannot disagree. A null metric is absent, never "0".
 *
 * Accessibility: the animated figure and the short caption are both
 * aria-hidden, and one sr-only phrase carries the whole metric. That way the
 * count is announced exactly once, fully labelled ("79 views"), rather than as
 * a bare digit — and the count-up animation is never read mid-tween.
 */
export default function PublicationMetricsRow({
  metrics,
  labels,
}: {
  metrics: PublicationMetrics;
  labels: {
    views: string;
    downloads: string;
    references: string;
    year: string;
    srViews: string;
    srDownloads: string;
    srReferences: string;
  };
}) {
  const items: Metric[] = [];

  if (metrics.views !== null) {
    items.push({
      icon: Eye,
      label: labels.views,
      srLabel: labels.srViews,
      value: metrics.views,
      animate: true,
    });
  }
  if (metrics.downloads !== null) {
    items.push({
      icon: Download,
      label: labels.downloads,
      srLabel: labels.srDownloads,
      value: metrics.downloads,
      animate: true,
    });
  }
  if (metrics.referenceCount !== null) {
    items.push({
      icon: ListOrdered,
      label: labels.references,
      srLabel: labels.srReferences,
      value: metrics.referenceCount,
      animate: true,
    });
  }
  if (metrics.year) {
    items.push({
      icon: CalendarDays,
      label: labels.year,
      srLabel: `${labels.year} ${metrics.year}`,
      value: metrics.year,
    });
  }

  // Nothing worth publishing — render no strip rather than an empty frame.
  if (items.length === 0) return null;

  // A plain list, not a <dl>: the icon + value-above-label layout can't
  // satisfy the strict dl > div > dt,dd content model (axe definition-list).
  return (
    <ul
      className={`mt-6 grid gap-px overflow-hidden rounded-2xl border border-divider bg-divider ${
        items.length >= 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"
      }`}
    >
      {items.map((m) => (
        <li key={m.label} className="flex items-center gap-3 bg-bg-surface px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/15 bg-brand/5 text-brand">
            <m.icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p aria-hidden="true" className="text-[17px] font-semibold leading-6 text-text-heading">
              {typeof m.value === "number" && m.animate ? <CountUp target={m.value} /> : m.value}
            </p>
            <p aria-hidden="true" className="truncate text-[11px] leading-4 text-text-muted">
              {m.label}
            </p>
            <span className="sr-only">{m.srLabel}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
