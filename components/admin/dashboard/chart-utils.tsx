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

export const AXIS_TEXT = {
  fontSize: 10,
  fill: "#94A3B8",
  fontFamily: "system-ui,-apple-system,sans-serif",
} as const;

/** Horizontal grid lines + y-axis labels shared by the trend charts. */
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
            stroke={i === 0 ? "#CBD5E1" : "#E2E8F0"}
            strokeWidth={i === 0 ? 1 : 0.75}
            strokeDasharray={i > 0 ? "4 6" : undefined}
            strokeOpacity={0.9}
          />
          <text x={padLeft - 8} y={t.y} textAnchor="end" dominantBaseline="middle" {...AXIS_TEXT}>
            {Math.round(t.v)}
          </text>
        </g>
      ))}
    </>
  );
}

/** Dark floating tooltip anchored to a chart coordinate. */
export function ChartTooltip({
  x,
  y,
  color,
  primary,
  secondary,
}: {
  x: number;
  y: number;
  color: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ left: x, top: y - 12, transform: "translate(-50%, -100%)" }}
    >
      <div
        className="rounded-lg px-3 py-2 text-xs whitespace-nowrap"
        style={{
          background: "rgba(15,23,42,0.94)",
          border: `1px solid ${color}30`,
          boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
        }}
      >
        <div className="flex items-center gap-1.5 font-semibold leading-none mb-1" style={{ color }}>
          <span
            className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: color }}
          />
          {primary}
        </div>
        <div className="pl-[13px] font-medium leading-none text-slate-400">{secondary}</div>
      </div>
      <div className="flex justify-center">
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid rgba(15,23,42,0.94)",
          }}
        />
      </div>
    </div>
  );
}
