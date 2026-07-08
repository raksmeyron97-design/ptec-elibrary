"use client";

import { useMemo, useState } from "react";
import type { GrowthPoint } from "@/lib/admin/dashboard";
import { ChartGrid, ChartTooltip, formatBucket, useContainerWidth, AXIS_TEXT } from "./chart-utils";

const COLOR = "#7C3AED";

function niceScale(min: number, max: number, tickCount = 4) {
  if (min === max) { min = Math.max(0, min - 1); max += 1; }
  const rawStep = (max - min) / tickCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep) || 0));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const niceMin = Math.max(0, Math.floor(min / step) * step);
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(v);
  return { niceMin, niceMax, ticks };
}

/** Cumulative registered users as a step-area chart. */
export default function UserGrowthChart({
  data,
  granularity,
  height = 240,
}: {
  data: GrowthPoint[];
  granularity: "hour" | "day";
  height?: number;
}) {
  const [wrapRef, width] = useContainerWidth();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 16, right: 16, bottom: 32, left: 44 };

  const { points, stepPath, areaPath, yTicks } = useMemo(() => {
    const innerW = Math.max(1, width - pad.left - pad.right);
    const innerH = height - pad.top - pad.bottom;
    const vals = data.map((d) => d.value);
    const { niceMin, niceMax, ticks } = niceScale(Math.min(...vals, 0), Math.max(...vals, 1));
    const span = Math.max(1, niceMax - niceMin);
    const n = data.length;

    const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => pad.top + innerH - ((v - niceMin) / span) * innerH;

    const points = data.map((d, i) => ({ x: x(i), y: y(d.value), ...d }));

    // Step-after: hold each value flat until the next bucket.
    let stepPath = "";
    points.forEach((p, i) => {
      if (i === 0) stepPath = `M ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      else stepPath += ` H ${p.x.toFixed(2)} V ${p.y.toFixed(2)}`;
    });

    const baseY = pad.top + innerH;
    const areaPath = points.length
      ? `${stepPath} L ${points[points.length - 1].x.toFixed(2)},${baseY} L ${points[0].x.toFixed(2)},${baseY} Z`
      : "";

    const yTicks = ticks.map((v) => ({ v, y: y(v) }));
    return { points, stepPath, areaPath, yTicks };
  }, [data, width, height, pad.left, pad.right, pad.top, pad.bottom]);

  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  const hp = hover !== null ? points[hover] : null;

  const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left + pad.left;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mx);
      if (dist < best) { best = dist; nearest = i; }
    });
    setHover(nearest);
  };

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>

        <ChartGrid ticks={yTicks} padLeft={pad.left} width={width} padRight={pad.right} />

        {areaPath && <path d={areaPath} fill="url(#growthFill)" />}
        <path d={stepPath} fill="none" stroke={COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={i} x={p.x} y={height - 8} textAnchor="middle" {...AXIS_TEXT}>
              {formatBucket(p.date, granularity)}
            </text>
          ) : null,
        )}

        {hp && (
          <g>
            <line
              x1={hp.x} x2={hp.x} y1={pad.top} y2={height - pad.bottom}
              stroke={COLOR} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.35}
            />
            <circle cx={hp.x} cy={hp.y} r={4.5} fill={COLOR} stroke="#fff" strokeWidth={2} />
          </g>
        )}

        <rect
          x={pad.left}
          y={pad.top}
          width={Math.max(0, width - pad.left - pad.right)}
          height={height - pad.top - pad.bottom}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {hp && (
        <ChartTooltip
          x={hp.x}
          y={hp.y}
          color={COLOR}
          primary={`${hp.value} total user${hp.value === 1 ? "" : "s"}`}
          secondary={
            hp.added > 0
              ? `+${hp.added} new · ${formatBucket(hp.date, granularity)}`
              : formatBucket(hp.date, granularity)
          }
        />
      )}
    </div>
  );
}
