"use client"
 
;
/* eslint-disable react-hooks/exhaustive-deps */


import { useEffect, useMemo, useRef, useState } from "react";

export type GrowthPoint = { date: string; count: number; added: number };

const LINE_COLOR = "#7C3AED"; // violet-600
const FILL_COLOR = "#A78BFA"; // violet-400
const TIP_BORDER = "#7C3AED";

function niceScale(min: number, max: number, ticks = 4) {
  if (min === max) { min = Math.max(0, min - 1); max = max + 1; }
  const range = max - min;
  const rawStep = range / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep) || 0));
  const norm = rawStep / mag;
  let step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  step *= mag;
  const niceMin = Math.max(0, Math.floor(min / step) * step);
  const niceMax = Math.ceil(max / step) * step;
  const list: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) list.push(v);
  return { niceMin, niceMax, ticks: list };
}

export default function UserGrowthChart({ data }: { data: GrowthPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  const height = 260;
  const pad = { top: 20, right: 20, bottom: 32, left: 44 };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { linePath, areaPath, points, yTicks } = useMemo(() => {
    const innerW = Math.max(1, width - pad.left - pad.right);
    const innerH = height - pad.top - pad.bottom;
    const vals = data.map((d) => d.count);
    const { niceMin, niceMax, ticks } = niceScale(
      Math.min(...vals, 0),
      Math.max(...vals, 1),
    );
    const span = Math.max(1, niceMax - niceMin);
    const n = data.length;

    const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => pad.top + innerH - ((v - niceMin) / span) * innerH;

    const points = data.map((d, i) => ({ x: x(i), y: y(d.count), ...d }));
    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const baseY = pad.top + innerH;
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baseY} L ${points[0].x.toFixed(2)} ${baseY} Z`
      : "";

    const yTicks = ticks.map((v) => ({ v, y: y(v) }));
    return { linePath, areaPath, points, yTicks };
  }, [data, width]);

  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left + pad.left;
    let nearest = 0, best = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mx);
      if (dist < best) { best = dist; nearest = i; }
    });
    setHover(nearest);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg width={width} height={height} className="block">
        <defs>
          <linearGradient id="ugFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={FILL_COLOR} stopOpacity={0.28} />
            <stop offset="70%"  stopColor={FILL_COLOR} stopOpacity={0.06} />
            <stop offset="100%" stopColor={FILL_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={t.y} y2={t.y}
              stroke="#E2E8F0" strokeWidth={1} strokeDasharray={i > 0 ? "3 4" : undefined} />
            <text x={pad.left - 8} y={t.y} textAnchor="end" dominantBaseline="middle"
              fontSize={11} className="fill-slate-400">
              {Math.round(t.v)}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill="url(#ugFill)" />}
        <path d={linePath} fill="none" stroke={LINE_COLOR} strokeWidth={3}
          strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={i} x={p.x} y={height - 10} textAnchor="middle"
              fontSize={11} className="fill-slate-400">
              {fmt(p.date)}
            </text>
          ) : null
        )}

        {hover !== null && points[hover] && (
          <g>
            <line x1={points[hover].x} x2={points[hover].x}
              y1={pad.top} y2={height - pad.bottom}
              stroke={LINE_COLOR} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5} />
            <circle cx={points[hover].x} cy={points[hover].y} r={5}
              fill="#fff" stroke={LINE_COLOR} strokeWidth={2.5} />
          </g>
        )}

        <rect x={pad.left} y={pad.top}
          width={Math.max(0, width - pad.left - pad.right)} height={height - pad.top - pad.bottom}
          fill="transparent" onMouseMove={handleMove} onMouseLeave={() => setHover(null)} />
      </svg>

      {hover !== null && points[hover] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: points[hover].x, top: points[hover].y - 12,
            background: "#0F172A",
            border: `1px solid ${TIP_BORDER}44`,
          }}
        >
          <div className="font-bold" style={{ color: LINE_COLOR }}>{points[hover].count} total users</div>
          <div className="mt-0.5 text-slate-400">
            {points[hover].added > 0 ? `+${points[hover].added} new · ` : ""}{fmt(points[hover].date)}
          </div>
        </div>
      )}
    </div>
  );
}
