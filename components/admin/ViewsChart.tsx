"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useRef, useState } from "react";

export type DailyPoint = { date: string; count: number };

const LINE_COLOR = "#059669";
const FILL_COLOR = "#10B981";
const GLOW_COLOR = "#34D399";

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  if (pts.length === 2)
    return `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)},${pts[1].y.toFixed(2)}`;
  const t = 0.38;
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[Math.min(pts.length - 1, i + 1)];
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

export default function ViewsChart({ data }: { data: DailyPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  const height = 268;
  const pad = { top: 24, right: 24, bottom: 38, left: 44 };

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const h = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

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

    const x = (i: number) =>
      pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH;

    const points = data.map((d, i) => ({ x: x(i), y: y(d.count), ...d }));
    const linePath = smoothPath(points);

    const baseY = pad.top + innerH;
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)},${baseY} L ${points[0].x.toFixed(2)},${baseY} Z`
      : "";

    const yTicks = [0, 1, 2, 3, 4].map((k) => {
      const v = (niceMax / 4) * k;
      return { v, y: y(v) };
    });

    return { linePath, areaPath, points, yTicks };
  }, [data, width]);

  const animKey = useMemo(
    () => data.map((d) => `${d.date}:${d.count}`).join("|"),
    [data]
  );

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

  const hp = hover !== null ? points[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg width={width} height={height} className="block overflow-visible">
        <defs>
          <linearGradient id="vlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={FILL_COLOR} stopOpacity={0.40} />
            <stop offset="45%"  stopColor={FILL_COLOR} stopOpacity={0.11} />
            <stop offset="100%" stopColor={FILL_COLOR} stopOpacity={0} />
          </linearGradient>
          <filter id="vlDotGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {!reducedMotion && (
            <style>{`
              @keyframes vlDraw {
                from { stroke-dashoffset: 1; }
                to   { stroke-dashoffset: 0; }
              }
              @keyframes vlFadeIn {
                from { opacity: 0; }
                to   { opacity: 1; }
              }
            `}</style>
          )}
        </defs>

        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={pad.left} x2={width - pad.right} y1={t.y} y2={t.y}
              stroke={i === 0 ? "#CBD5E1" : "#E2E8F0"}
              strokeWidth={i === 0 ? 1 : 0.75}
              strokeDasharray={i > 0 ? "4 6" : undefined}
              strokeOpacity={0.9}
            />
            <text
              x={pad.left - 10} y={t.y}
              textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill="#94A3B8"
              fontFamily="system-ui,-apple-system,sans-serif"
            >
              {Math.round(t.v)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        {areaPath && (
          <path
            key={`vl-area-${animKey}`}
            d={areaPath}
            fill="url(#vlFill)"
            style={
              reducedMotion
                ? undefined
                : { opacity: 0, animation: "vlFadeIn 0.9s ease-out 0.5s forwards" }
            }
          />
        )}

        {/* Soft glow */}
        <path
          d={linePath}
          fill="none"
          stroke={GLOW_COLOR}
          strokeWidth={10}
          strokeOpacity={0.13}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Main line */}
        <path
          key={`vl-line-${animKey}`}
          d={linePath}
          fill="none"
          stroke={LINE_COLOR}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={reducedMotion ? undefined : 1}
          style={
            reducedMotion
              ? undefined
              : {
                  strokeDasharray: 1,
                  animation: "vlDraw 1.4s cubic-bezier(0.4,0,0.2,1) forwards",
                }
          }
        />

        {/* X-axis labels */}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={i} x={p.x} y={height - 8}
              textAnchor="middle" fontSize={10} fill="#94A3B8"
              fontFamily="system-ui,-apple-system,sans-serif"
            >
              {fmt(p.date)}
            </text>
          ) : null
        )}

        {/* Hover state */}
        {hp && (
          <g>
            <line
              x1={hp.x} x2={hp.x} y1={pad.top} y2={height - pad.bottom}
              stroke={LINE_COLOR} strokeWidth={1}
              strokeDasharray="4 4" strokeOpacity={0.35}
            />
            <circle cx={hp.x} cy={hp.y} r={16} fill={LINE_COLOR} fillOpacity={0.07} />
            <circle cx={hp.x} cy={hp.y} r={9}  fill={LINE_COLOR} fillOpacity={0.13} />
            <circle
              cx={hp.x} cy={hp.y} r={5.5}
              fill={LINE_COLOR} stroke="#fff" strokeWidth={2.5}
              filter="url(#vlDotGlow)"
            />
            <circle cx={hp.x} cy={hp.y} r={2} fill="#fff" />
          </g>
        )}

        {/* Hit area */}
        <rect
          x={pad.left} y={pad.top}
          width={Math.max(0, width - pad.left - pad.right)}
          height={height - pad.top - pad.bottom}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {/* Tooltip */}
      {hp && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: hp.x,
            top: hp.y - 18,
            transform: "translate(-50%, -100%)",
            transition: reducedMotion ? "none" : "left 70ms ease-out, top 70ms ease-out",
          }}
        >
          <div
            className="rounded-xl px-3.5 py-2.5 text-xs"
            style={{
              background: "rgba(15,23,42,0.94)",
              backdropFilter: "blur(10px)",
              border: `1px solid ${LINE_COLOR}30`,
              boxShadow: `0 16px 48px rgba(0,0,0,0.32), 0 0 0 1px ${LINE_COLOR}15, inset 0 1px 0 rgba(255,255,255,0.06)`,
              minWidth: 112,
            }}
          >
            <div
              className="flex items-center gap-1.5 font-semibold leading-none mb-1.5"
              style={{ color: LINE_COLOR }}
            >
              <span
                className="inline-block rounded-full flex-shrink-0"
                style={{
                  width: 7, height: 7,
                  background: LINE_COLOR,
                  boxShadow: `0 0 6px ${LINE_COLOR}`,
                }}
              />
              {hp.count} views
            </div>
            <div className="text-slate-400 font-medium leading-none pl-[14px]">
              {fmt(hp.date)}
            </div>
          </div>
          <div className="flex justify-center">
            <div
              style={{
                width: 0, height: 0,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: "5px solid rgba(15,23,42,0.94)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
