"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange, ListFilter, Loader2, RotateCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import ExportMenu from "@/components/admin/ExportMenu";
import {
  activeFilterCount,
  serializeDashboardFilters,
  type ContentTypeFilter,
  type DashboardFilters,
  type DashboardRange,
  type LanguageFilter,
} from "@/lib/admin/dashboard-shared";

const RANGE_PRESETS: Exclude<DashboardRange, "custom">[] = ["today", "7d", "30d", "90d"];
const TYPES: ContentTypeFilter[] = ["all", "book", "research_report", "publication", "post"];
const LANGS: LanguageFilter[] = ["all", "en", "km"];

function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * One slim filter row shared by every dashboard view — all state lives in
 * the URL (?range&from&to&compare&type&dept&lang). Secondary controls
 * (custom dates, type/dept/lang) expand below on demand instead of always
 * occupying space.
 */
export default function DashboardToolbar({
  filters,
  departments,
  exportHref,
}: {
  filters: DashboardFilters;
  departments: string[];
  exportHref: string;
}) {
  const t = useTranslations("adminDashboard.toolbar");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(filters.range === "custom");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [moreOpen, setMoreOpen] = useState(false);

  const apply = (next: DashboardFilters) => {
    const qs = serializeDashboardFilters(next);
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const max = todayYmd();
  const customValid = Boolean(from && to && from <= to && from <= max);
  const activeCount = activeFilterCount(filters);

  const selectClass =
    "h-8 max-w-[180px] cursor-pointer rounded-lg border border-divider bg-bg-surface px-2 text-[12px] font-medium text-text-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

  const summaryParts: string[] = [];
  if (filters.type !== "all") summaryParts.push(t(`type.${filters.type}`));
  if (filters.dept) summaryParts.push(filters.dept);
  if (filters.lang !== "all") summaryParts.push(t(`lang.${filters.lang}`));

  const quietBtn =
    "flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  return (
    <div className="dash-toolbar sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl border border-divider/70 bg-bg-surface/80 px-2.5 py-2 shadow-[0_1px_2px_rgba(11,21,48,.05)] backdrop-blur-md supports-[backdrop-filter]:bg-bg-surface/70">
      <div className="dash-seg" role="group" aria-label={t("rangeLabel")}>
        {RANGE_PRESETS.map((r) => (
          <button
            key={r}
            type="button"
            disabled={isPending}
            aria-pressed={filters.range === r && !customOpen}
            className="dash-seg-btn disabled:cursor-wait"
            onClick={() => {
              setCustomOpen(false);
              apply({ ...filters, range: r, from: undefined, to: undefined });
            }}
          >
            {t(`range.${r}`)}
          </button>
        ))}
        <button
          type="button"
          disabled={isPending}
          aria-pressed={customOpen || filters.range === "custom"}
          aria-expanded={customOpen}
          className="dash-seg-btn flex items-center gap-1 disabled:cursor-wait"
          onClick={() => setCustomOpen((v) => !v)}
        >
          <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
          {t("range.custom")}
        </button>
      </div>

      <label className="flex cursor-pointer select-none items-center gap-1.5 px-1 text-[12px] font-medium text-text-muted hover:text-text-heading">
        <input
          type="checkbox"
          checked={filters.compare}
          disabled={isPending}
          onChange={(e) => apply({ ...filters, compare: e.target.checked })}
          className="h-3.5 w-3.5 cursor-pointer accent-[var(--ptec-brand,#1E3A8A)]"
        />
        {t("compareShort")}
      </label>

      <button
        type="button"
        disabled={isPending}
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((v) => !v)}
        className={`${quietBtn} ${activeCount > 0 ? "text-brand" : ""}`}
      >
        <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
        {t("filters")}
        {activeCount > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      <div className="ms-auto flex items-center gap-0.5">
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" aria-hidden="true" />}
        <button type="button" onClick={() => startTransition(() => router.refresh())} className={quietBtn}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t("refresh")}</span>
          <span className="sr-only sm:hidden">{t("refresh")}</span>
        </button>
        <ExportMenu href={exportHref} buttonClassName={quietBtn} />
      </div>

      {customOpen && (
        <div className="flex w-full flex-wrap items-center gap-2 pt-1">
          <label className="flex items-center gap-1.5 text-[12px] text-text-muted">
            {t("from")}
            <input
              type="date"
              value={from}
              max={to || max}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-divider bg-bg-surface px-2 py-1 text-[12px] text-text-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-text-muted">
            {t("to")}
            <input
              type="date"
              value={to}
              min={from || undefined}
              max={max}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-divider bg-bg-surface px-2 py-1 text-[12px] text-text-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            />
          </label>
          <button
            type="button"
            disabled={!customValid || isPending}
            onClick={() => apply({ ...filters, range: "custom", from, to })}
            className="cursor-pointer rounded-lg bg-brand px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("apply")}
          </button>
        </div>
      )}

      {moreOpen && (
        <div className="flex w-full flex-wrap items-center gap-2 pt-1">
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
            {t("contentType")}
            <select
              value={filters.type}
              disabled={isPending}
              onChange={(e) => apply({ ...filters, type: e.target.value as ContentTypeFilter })}
              className={selectClass}
            >
              {TYPES.map((v) => (
                <option key={v} value={v}>
                  {t(`type.${v}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
            {t("department")}
            <select
              value={filters.dept ?? ""}
              disabled={isPending}
              onChange={(e) => apply({ ...filters, dept: e.target.value || null })}
              className={selectClass}
            >
              <option value="">{t("allDepartments")}</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
            {t("language")}
            <select
              value={filters.lang}
              disabled={isPending}
              onChange={(e) => apply({ ...filters, lang: e.target.value as LanguageFilter })}
              className={selectClass}
            >
              {LANGS.map((v) => (
                <option key={v} value={v}>
                  {t(`lang.${v}`)}
                </option>
              ))}
            </select>
          </label>
          {activeCount > 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => apply({ ...filters, type: "all", dept: null, lang: "all" })}
              className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-brand hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              {t("clearFilters")}
            </button>
          )}
        </div>
      )}

      {activeCount > 0 && !moreOpen && (
        <p className="w-full pt-0.5 text-[11.5px] text-text-muted">
          {t("activeFilters")}: {summaryParts.join(" · ")}
        </p>
      )}
    </div>
  );
}
