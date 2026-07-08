"use client";

import { useMemo, useState } from "react";
import type { TrendPoint } from "@/lib/admin/dashboard";
import { ChartGrid, ChartTooltip, formatBucket, niceMax4, useContainerWidth, AXIS_TEXT } from "./chart-utils";

const COLOR = "#059669";

/** Daily/hourly views as a line chart with a soft area fill. */
export default function ViewsChart({
  data,
  granularity,
  height = 240,
}: {
  data: TrendPoint[];
  granularity: "hour" | "day";
  height?: number;
}) {
  const [wrapRef, width] = useContainerWidth();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 16, right: 16, bottom: 32, left: 40 };

  const { points, linePath, areaPath, yTicks } = useMemo(() => {
    const innerW = Math.max(1, width - pad.left - pad.right);
    const innerH = height - pad.top - pad.bottom;
    const max = niceMax4(Math.max(1, ...data.map((d) => d.value)));
    const n = data.length;

    const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => pad.top + innerH - (v / max) * innerH;

    const points = data.map((d, i) => ({ x: x(i), y: y(d.value), ...d }));
    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
    const baseY = pad.top + innerH;
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)},${baseY} L ${points[0].x.toFixed(2)},${baseY} Z`
      : "";
    const yTicks = [0, 1, 2, 3, 4].map((k) => ({ v: (max / 4) * k, y: y((max / 4) * k) }));
    return { points, linePath, areaPath, yTicks };
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
          <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR} stopOpacity={0.22} />
            <stop offset="100%" stopColor={COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>

        <ChartGrid ticks={yTicks} padLeft={pad.left} width={width} padRight={pad.right} />

        {areaPath && <path d={areaPath} fill="url(#viewsFill)" />}
        <path d={linePath} fill="none" stroke={COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

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
          primary={`${hp.value} view${hp.value === 1 ? "" : "s"}`}
          secondary={formatBucket(hp.date, granularity)}
        />
      )}
    </div>
  );
}
