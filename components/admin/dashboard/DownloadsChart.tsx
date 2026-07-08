"use client";

import { useMemo, useState } from "react";
import type { TrendPoint } from "@/lib/admin/dashboard";
import { ChartGrid, ChartTooltip, formatBucket, niceMax4, useContainerWidth, AXIS_TEXT } from "./chart-utils";

const COLOR = "#D97706";

/**
 * Daily/hourly downloads as a bar chart — downloads are discrete counts,
 * so bars are more honest than a smoothed line.
 */
export default function DownloadsChart({
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

  const { bars, yTicks, slotW } = useMemo(() => {
    const innerW = Math.max(1, width - pad.left - pad.right);
    const innerH = height - pad.top - pad.bottom;
    const max = niceMax4(Math.max(1, ...data.map((d) => d.value)));
    const n = Math.max(1, data.length);
    const slotW = innerW / n;
    const barW = Math.max(3, Math.min(28, slotW * 0.62));

    const bars = data.map((d, i) => {
      const h = (d.value / max) * innerH;
      return {
        ...d,
        cx: pad.left + slotW * i + slotW / 2,
        x: pad.left + slotW * i + (slotW - barW) / 2,
        y: pad.top + innerH - h,
        w: barW,
        h,
      };
    });
    const yTicks = [0, 1, 2, 3, 4].map((k) => ({
      v: (max / 4) * k,
      y: pad.top + innerH - ((max / 4) * k / max) * innerH,
    }));
    return { bars, yTicks, slotW };
  }, [data, width, height, pad.left, pad.right, pad.top, pad.bottom]);

  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  const hb = hover !== null ? bars[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
        <ChartGrid ticks={yTicks} padLeft={pad.left} width={width} padRight={pad.right} />

        {bars.map((b, i) => (
          <g
            key={b.date}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {/* full-height hover slot so small bars are easy to target */}
            <rect
              x={b.cx - slotW / 2}
              y={pad.top}
              width={slotW}
              height={height - pad.top - pad.bottom}
              fill={hover === i ? `${COLOR}0d` : "transparent"}
            />
            {b.value > 0 && (
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={Math.max(2, b.h)}
                rx={Math.min(3, b.w / 3)}
                fill={hover === i ? COLOR : `${COLOR}cc`}
                style={{ transition: "fill 0.15s" }}
              />
            )}
          </g>
        ))}

        {bars.map((b, i) =>
          i % labelEvery === 0 || i === bars.length - 1 ? (
            <text key={b.date} x={b.cx} y={height - 8} textAnchor="middle" {...AXIS_TEXT}>
              {formatBucket(b.date, granularity)}
            </text>
          ) : null,
        )}
      </svg>

      {hb && (
        <ChartTooltip
          x={hb.cx}
          y={hb.value > 0 ? hb.y : height - pad.bottom - 8}
          color={COLOR}
          primary={`${hb.value} download${hb.value === 1 ? "" : "s"}`}
          secondary={formatBucket(hb.date, granularity)}
        />
      )}
    </div>
  );
}
