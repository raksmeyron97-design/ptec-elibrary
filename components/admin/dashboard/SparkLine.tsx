import { useId } from "react";
import type { TrendPoint } from "@/lib/admin/dashboard";
import type { KpiAccent } from "./KpiCard";

/** The shared, validated series palette (app/admin.css). A card's spark line
 *  is the same hue as that metric's line in the graph below it. */
const ACCENT_COLOR: Record<KpiAccent, string> = {
  visitors: "var(--ptec-series-visitors)",
  views: "var(--ptec-series-views)",
  reader: "var(--ptec-series-reader)",
  downloads: "var(--ptec-series-downloads)",
  brand: "var(--ptec-brand)",
  gold: "var(--ptec-series-downloads-ink)",
  emerald: "var(--ptec-success)",
  // Threshold accents — same tokens as the .dash-ico--{ok,warn,crit,unknown}
  // tile tints in app/admin.css, so a spark line on one of these cards would
  // match its icon rather than introducing a fifth, unrelated hue.
  ok: "var(--ptec-success)",
  warn: "var(--ptec-amber)",
  crit: "var(--ptec-danger)",
  unknown: "var(--dash-ink-decorative)",
};

/**
 * Decorative mini trend (the KPI card carries the accessible numbers). Pure
 * SVG, no client JS — a metric-tinted stroke over a faint area fill, with the
 * latest bucket marked so the eye lands on "where it is now" rather than on
 * the middle of the line. The end dot wears a ring in the card colour so it
 * stays legible where the line runs into it.
 */
export default function SparkLine({
  points,
  accent = "brand",
  width = 74,
  height = 32,
}: {
  points: TrendPoint[];
  accent?: KpiAccent;
  width?: number;
  height?: number;
}) {
  const gradId = useId();
  const color = ACCENT_COLOR[accent];
  const max = Math.max(1, ...points.map((p) => p.value));
  // The end dot is drawn ON the last point, so the plot stops short of the
  // right edge — otherwise the marker (and its ring) is clipped in half by the
  // viewBox.
  const endInset = 4;
  const plotW = Math.max(1, width - endInset);
  const stepX = points.length > 1 ? plotW / (points.length - 1) : plotW;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - 2 - (p.value / max) * (height - 4);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${plotW.toFixed(1)},${height} L0,${height} Z`;

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
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.length > 0 && (
        <circle
          cx={coords[coords.length - 1][0]}
          cy={coords[coords.length - 1][1]}
          r="2.6"
          fill={color}
          stroke="var(--dash-surface)"
          strokeWidth="1.5"
          paintOrder="stroke"
        />
      )}
    </svg>
  );
}
