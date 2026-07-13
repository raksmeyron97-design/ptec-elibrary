import { useId } from "react";
import type { TrendPoint } from "@/lib/admin/dashboard";
import type { KpiAccent } from "./KpiCard";

const ACCENT_COLOR: Record<KpiAccent, string> = {
  visitors: "#0E7490",
  views: "#1E3A8A",
  reader: "#6D28D9",
  downloads: "#B45309",
  brand: "#1E3A8A",
  gold: "#B45309",
  emerald: "#047857",
};

/**
 * Decorative mini trend (the KPI card carries the accessible numbers). Pure
 * SVG, no client JS — a metric-tinted stroke over a faint area fill.
 */
export default function SparkLine({
  points,
  accent = "brand",
  width = 74,
  height = 26,
}: {
  points: TrendPoint[];
  accent?: KpiAccent;
  width?: number;
  height?: number;
}) {
  const gradId = useId();
  const color = ACCENT_COLOR[accent];
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - 2 - (p.value / max) * (height - 4);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(width).toFixed(1)},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
