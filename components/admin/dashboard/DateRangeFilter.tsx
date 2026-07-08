"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange, Loader2 } from "lucide-react";
import type { DashboardRange, DashboardRangeSpec } from "@/lib/admin/dashboard";

const PRESETS: { value: Exclude<DashboardRange, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

function todayYmd(): string {
  // Library-local date (Asia/Phnom_Penh) for the pickers' max bound.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Segmented range control + custom from/to picker. Writes ?range= (and
 * ?from=&to= for custom) to the URL so the whole dashboard re-renders
 * server-side for that period — no client-side data fetching.
 */
export default function DateRangeFilter({ current }: { current: DashboardRangeSpec }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(current.range === "custom");
  const [from, setFrom] = useState(current.from ?? "");
  const [to, setTo] = useState(current.to ?? "");

  const navigate = (query: string) => {
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const selectPreset = (range: DashboardRange) => {
    setCustomOpen(false);
    if (range === current.range) return;
    navigate(range === "30d" ? "" : `range=${range}`);
  };

  const applyCustom = () => {
    if (!from || !to || from > to) return;
    navigate(`range=custom&from=${from}&to=${to}`);
  };

  const max = todayYmd();
  const customValid = Boolean(from && to && from <= to && from <= max);

  const pillClass = (active: boolean) =>
    `cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait ${
      active
        ? "bg-brand text-white shadow-sm"
        : "text-text-muted hover:bg-bg-app hover:text-text-body"
    }`;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-hidden="true" />}
        <div
          className="flex items-center gap-1 rounded-xl bg-bg-surface p-1 shadow-sm"
          style={{ border: "1px solid var(--ptec-divider)" }}
          role="group"
          aria-label="Date range"
        >
          {PRESETS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => selectPreset(o.value)}
              aria-pressed={current.range === o.value && !customOpen}
              disabled={isPending}
              className={pillClass(current.range === o.value && !customOpen)}
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            aria-pressed={customOpen || current.range === "custom"}
            aria-expanded={customOpen}
            disabled={isPending}
            className={`flex items-center gap-1.5 ${pillClass(customOpen || current.range === "custom")}`}
          >
            <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
            Custom
          </button>
        </div>
      </div>

      {customOpen && (
        <div
          className="flex flex-wrap items-center justify-end gap-2 rounded-xl bg-bg-surface p-2 shadow-sm"
          style={{ border: "1px solid var(--ptec-divider)" }}
        >
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            From
            <input
              type="date"
              value={from}
              max={to || max}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-divider bg-bg-app px-2 py-1.5 text-xs text-text-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              aria-label="Start date"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              max={max}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-divider bg-bg-app px-2 py-1.5 text-xs text-text-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              aria-label="End date"
            />
          </label>
          <button
            type="button"
            onClick={applyCustom}
            disabled={!customValid || isPending}
            className="cursor-pointer rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
