"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type DailyPoint = { date: string; count: number };

export default function ViewsChart({ data }: { data: DailyPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  const height = 260;
  const pad = { top: 20, right: 20, bottom: 32, left: 40 };

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
    const maxV = Math.max(1, ...data.map((d) => d.count));
    const niceMax = Math.max(4, Math.ceil(maxV / 4) * 4);
    const n = data.length;

    const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH;

    const points = data.map((d, i) => ({ x: x(i), y: y(d.count), ...d }));
    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const baseY = pad.top + innerH;
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baseY} L ${points[0].x.toFixed(2)} ${baseY} Z`
      : "";

    const yTicks = [0, 1, 2, 3, 4].map((k) => {
      const v = (niceMax / 4) * k;
      return { v, y: y(v) };
    });

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
          <linearGradient id="vlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={t.y} y2={t.y} stroke="#E2E8F0" strokeWidth={1} />
            <text x={pad.left - 8} y={t.y} textAnchor="end" dominantBaseline="middle" fontSize={11} className="fill-slate-400">
              {Math.round(t.v)}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill="url(#vlFill)" />}
        <path d={linePath} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={i} x={p.x} y={height - 10} textAnchor="middle" fontSize={11} className="fill-slate-400">
              {fmt(p.date)}
            </text>
          ) : null
        )}

        {hover !== null && points[hover] && (
          <g>
            <line x1={points[hover].x} x2={points[hover].x} y1={pad.top} y2={height - pad.bottom}
              stroke="#059669" strokeWidth={1} strokeDasharray="4 3" />
            <circle cx={points[hover].x} cy={points[hover].y} r={4.5} fill="#fff" stroke="#059669" strokeWidth={2.5} />
          </g>
        )}

        <rect x={pad.left} y={pad.top}
          width={Math.max(0, width - pad.left - pad.right)} height={height - pad.top - pad.bottom}
          fill="transparent" onMouseMove={handleMove} onMouseLeave={() => setHover(null)} />
      </svg>

      {hover !== null && points[hover] && (
        <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: points[hover].x, top: points[hover].y - 10 }}>
          <div className="font-semibold">{points[hover].count} views</div>
          <div className="text-[10px] text-text-muted">{fmt(points[hover].date)}</div>
        </div>
      )}
    </div>
  );
}
