"use client";

import { useMemo, useRef, useState, useEffect } from "react";

export interface DeptPoint { dept: string; downloads: number; views: number }

const COLORS = { downloads: "#D97706", views: "#059669" };

export default function DepartmentChart({ data }: { data: DeptPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [mode, setMode] = useState<"downloads" | "views">("downloads");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sorted = useMemo(
    () => [...data].sort((a, b) => b[mode] - a[mode]),
    [data, mode],
  );

  const height  = 240;
  const pad     = { top: 20, right: 16, bottom: 56, left: 48 };
  const innerW  = Math.max(1, width - pad.left - pad.right);
  const innerH  = height - pad.top - pad.bottom;
  const maxVal  = Math.max(1, ...sorted.map((d) => d[mode]));
  const niceMax = Math.max(4, Math.ceil(maxVal / 4) * 4);
  const barW    = Math.max(4, Math.min(40, (innerW / sorted.length) * 0.6));
  const gap     = innerW / sorted.length;

  const yTicks  = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    v: Math.round(niceMax * f),
    y: pad.top + innerH - f * innerH,
  }));

  const color = COLORS[mode];
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div ref={wrapRef} className="w-full select-none">
      {/* Toggle */}
      <div className="mb-4 flex items-center gap-1 rounded-xl bg-bg-app p-1 w-fit">
        {(["downloads", "views"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`rounded-lg px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-all ${
              mode === m ? "bg-brand text-white shadow-sm" : "text-text-muted hover:text-text-body"
            }`}>
            {m}
          </button>
        ))}
      </div>

      <svg width={width} height={height} className="block overflow-visible">
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={t.y} y2={t.y}
              stroke={i === 0 ? "#CBD5E1" : "#E2E8F0"}
              strokeWidth={i === 0 ? 1 : 0.6}
              strokeDasharray={i > 0 ? "4 6" : undefined}
              strokeOpacity={0.9}
            />
            <text x={pad.left - 8} y={t.y} textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill="#94A3B8" fontFamily="system-ui,sans-serif">
              {fmt(t.v)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {sorted.map((d, i) => {
          const x = pad.left + gap * i + gap / 2 - barW / 2;
          const val = d[mode];
          const barH = Math.max(2, (val / niceMax) * innerH);
          const y = pad.top + innerH - barH;
          const isHov = hover === i;

          return (
            <g key={d.dept}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}>
              {/* Background hover rect */}
              <rect x={pad.left + gap * i} y={pad.top} width={gap} height={innerH}
                fill={isHov ? `${color}08` : "transparent"} rx={4} />
              {/* Bar */}
              <rect x={x} y={y} width={barW} height={barH}
                fill={isHov ? color : `${color}cc`} rx={Math.min(5, barW / 3)}
                style={{ transition: "fill 0.15s" }}
              />
              {/* Value label on hover */}
              {isHov && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle"
                  fontSize={10} fill={color} fontWeight={700} fontFamily="system-ui,sans-serif">
                  {fmt(val)}
                </text>
              )}
              {/* X-axis label — abbreviated */}
              <text
                x={pad.left + gap * i + gap / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={9.5}
                fill={isHov ? color : "#94A3B8"}
                fontFamily="system-ui,sans-serif"
                style={{ transition: "fill 0.15s" }}
              >
                {d.dept.split(" ")[0]}
              </text>
            </g>
          );
        })}

        {/* Hover tooltip */}
        {hover !== null && sorted[hover] && (() => {
          const d = sorted[hover];
          const i = hover;
          const cx = pad.left + gap * i + gap / 2;
          const val = d[mode];
          const barH = Math.max(2, (val / niceMax) * innerH);
          const ty = pad.top + innerH - barH - 28;
          return (
            <foreignObject x={cx - 70} y={ty} width={140} height={50} style={{ overflow: "visible" }}>
              <div style={{
                background: "rgba(15,23,42,0.93)",
                backdropFilter: "blur(10px)",
                borderRadius: 10,
                padding: "6px 10px",
                fontSize: 11,
                color: "#e2e8f0",
                border: `1px solid ${color}30`,
                whiteSpace: "nowrap",
              }}>
                <div style={{ fontWeight: 700, color }}>{d.dept}</div>
                <div>{fmt(val)} {mode}</div>
              </div>
            </foreignObject>
          );
        })()}
      </svg>
    </div>
  );
}
