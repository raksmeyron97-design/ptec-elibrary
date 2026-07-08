"use client";

import { useMemo, useState } from "react";
import type { DepartmentStat } from "@/lib/admin/dashboard";

const COLORS = { downloads: "#D97706", views: "#059669" } as const;

/**
 * Horizontal bars per department. Horizontal layout gives long Khmer
 * department names a full row of space instead of a cramped x-axis slot.
 */
export default function DepartmentPerformanceChart({ data }: { data: DepartmentStat[] }) {
  const [mode, setMode] = useState<"downloads" | "views">("views");

  const sorted = useMemo(
    () => [...data].sort((a, b) => b[mode] - a[mode]),
    [data, mode],
  );
  const max = Math.max(1, ...sorted.map((d) => d[mode]));
  const color = COLORS[mode];
  const nf = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="w-full">
      {/* Metric toggle */}
      <div className="mb-4 flex w-fit items-center gap-1 rounded-xl bg-bg-app p-1" role="group" aria-label="Department metric">
        {(["views", "downloads"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              mode === m ? "bg-brand text-white shadow-sm" : "text-text-muted hover:text-text-body"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <ol className="space-y-3">
        {sorted.map((d) => {
          const value = d[mode];
          const pct = Math.max(value > 0 ? 2 : 0, (value / max) * 100);
          return (
            <li key={d.department}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                {/* Khmer names need generous line-height — never compress or shrink them */}
                <span className="min-w-0 text-sm font-medium leading-relaxed text-text-body" title={d.department}>
                  {d.department}
                  <span className="ml-2 text-xs font-normal text-text-muted">
                    {d.bookCount > 0 ? `${nf(d.bookCount)} book${d.bookCount === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color }}>
                  {nf(value)}
                </span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-bg-app"
                role="img"
                aria-label={`${d.department}: ${nf(value)} ${mode}`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%`, background: value > 0 ? color : "transparent" }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
