"use client";

import { useEffect, useRef, useState } from "react";

/** Measure the rendered width of a chart container (ResizeObserver). */
export function useContainerWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

/** Format a bucket key ("2026-07-08" or "2026-07-08T14:00") for axis labels. */
export function formatBucket(key: string, granularity: "hour" | "day"): string {
  if (granularity === "hour") return key.slice(11); // "14:00"
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Round a max value up to a clean 4-tick scale. */
export function niceMax4(max: number): number {
  return Math.max(4, Math.ceil(max / 4) * 4);
}

/**
 * Axis type. `--dash-chart-axis` is the AA ramp step (4.8:1), not the
 * decorative #94A3B8 this used to hard-code — 2.8:1, which admin.css declares
 * in as many words as a NON-TEXT mark colour. Axis ticks are a column of
 * numbers, so they get tabular figures.
 */
export const AXIS_TEXT = {
  fontSize: 10,
  fill: "var(--dash-chart-axis)",
  fontFamily: "system-ui,-apple-system,sans-serif",
  style: { fontVariantNumeric: "tabular-nums" },
} as const;

/**
 * Horizontal grid lines + y-axis labels shared by the trend charts.
 *
 * Solid hairlines, one step off the surface, with the zero line a shade
 * stronger. They used to be dashed: dashing is how a plot says "threshold" or
 * "projection", and spending that on a ruler both adds noise and leaves the
 * chart with no way to mark a real one.
 */
export function ChartGrid({
  ticks,
  padLeft,
  width,
  padRight,
}: {
  ticks: { v: number; y: number }[];
  padLeft: number;
  width: number;
  padRight: number;
}) {
  return (
    <>
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={t.y}
            y2={t.y}
            stroke={i === 0 ? "var(--dash-chart-baseline)" : "var(--dash-chart-grid)"}
            strokeWidth="1"
          />
          <text x={padLeft - 8} y={t.y} textAnchor="end" dominantBaseline="middle" {...AXIS_TEXT}>
            {Math.round(t.v)}
          </text>
        </g>
      ))}
    </>
  );
}
