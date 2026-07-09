"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { Search, X, RotateCcw } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export type ToolbarOption = { value: string; label: string };

type Current = {
  q: string;
  year: string;
  cohort: string;
  program: string;
  sort: string;
  pdf: boolean;
};

const BASE_PATH = "/theses/summary";

/**
 * Search + filter + sort controls for the theses summary index.
 *
 * Renders as a plain GET form so it still works before hydration / without
 * JavaScript; once hydrated, the text input debounces into router.replace and
 * the selects navigate immediately.
 */
export default function SummaryToolbar({
  current,
  years,
  cohorts,
  programs,
}: {
  current: Current;
  years: string[];
  cohorts: ToolbarOption[];
  programs: ToolbarOption[];
}) {
  const t = useTranslations("thesisSummary");
  const locale = useLocale();
  const formAction = locale === "km" ? `/km${BASE_PATH}` : BASE_PATH;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(current.q);
  const [lastUrlQ, setLastUrlQ] = useState(current.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync when the URL changes (back/forward navigation,
  // "clear filters"). While typing, the URL echoes the input, so this no-ops;
  // a pending debounce re-navigates with the newest text either way.
  if (lastUrlQ !== current.q) {
    setLastUrlQ(current.q);
    setQ(current.q);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const navigate = (overrides: Partial<Current>) => {
    const next = { ...current, q, ...overrides };
    const params = new URLSearchParams();
    if (next.q.trim()) params.set("q", next.q);
    if (next.year) params.set("year", next.year);
    if (next.cohort) params.set("cohort", next.cohort);
    if (next.program) params.set("program", next.program);
    if (next.pdf) params.set("pdf", "1");
    if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${BASE_PATH}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  const onQueryChange = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      navigate({ q: value });
    }, 400);
  };

  const hasFilters = !!(
    current.q ||
    current.year ||
    current.cohort ||
    current.program ||
    current.pdf ||
    (current.sort && current.sort !== "newest")
  );

  const selectClass =
    "h-10 w-full cursor-pointer rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";
  const labelClass = "mb-1 block text-[11.5px] font-semibold uppercase tracking-wider text-text-muted";

  return (
    <form
      method="get"
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        navigate({ q });
      }}
      className={`rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm sm:p-5 ${
        isPending ? "opacity-70" : ""
      } transition-opacity`}
      aria-busy={isPending}
    >
      {/* Search row */}
      <div className="relative">
        <label htmlFor="thesis-summary-q" className="sr-only">
          {t("searchLabel")}
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        />
        <input
          id="thesis-summary-q"
          type="search"
          name="q"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-divider bg-bg-app pl-10 pr-10 text-[14px] text-text-body placeholder:text-text-muted/70 transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        />
        {q && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label={t("clearSearch")}
            className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="thesis-summary-year" className={labelClass}>
            {t("filterYear")}
          </label>
          <select
            id="thesis-summary-year"
            name="year"
            value={current.year}
            onChange={(e) => navigate({ year: e.target.value })}
            className={selectClass}
          >
            <option value="">{t("allYears")}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="thesis-summary-cohort" className={labelClass}>
            {t("filterCohort")}
          </label>
          <select
            id="thesis-summary-cohort"
            name="cohort"
            value={current.cohort}
            onChange={(e) => navigate({ cohort: e.target.value })}
            className={selectClass}
          >
            <option value="">{t("allCohorts")}</option>
            {cohorts.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="thesis-summary-program" className={labelClass}>
            {t("filterProgram")}
          </label>
          <select
            id="thesis-summary-program"
            name="program"
            value={current.program}
            onChange={(e) => navigate({ program: e.target.value })}
            className={selectClass}
          >
            <option value="">{t("allPrograms")}</option>
            {programs.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="thesis-summary-sort" className={labelClass}>
            {t("filterSort")}
          </label>
          <select
            id="thesis-summary-sort"
            name="sort"
            value={current.sort}
            onChange={(e) => navigate({ sort: e.target.value })}
            className={selectClass}
          >
            <option value="newest">{t("sortNewest")}</option>
            <option value="oldest">{t("sortOldest")}</option>
            <option value="views">{t("sortViews")}</option>
            <option value="downloads">{t("sortDownloads")}</option>
            <option value="title">{t("sortTitle")}</option>
            <option value="author">{t("sortAuthor")}</option>
          </select>
        </div>
      </div>

      {/* Bottom row: PDF toggle · submit (no-JS) · clear */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-text-body">
          <input
            type="checkbox"
            name="pdf"
            value="1"
            checked={current.pdf}
            onChange={(e) => navigate({ pdf: e.target.checked })}
            className="h-4 w-4 cursor-pointer rounded border-divider accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          />
          {t("hasPdf")}
        </label>

        <noscript>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-xl bg-brand px-4 text-[13px] font-bold text-brand-contrast"
          >
            {t("searchLabel")}
          </button>
        </noscript>

        {hasFilters && (
          <Link
            href={BASE_PATH}
            className="ml-auto inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-divider px-3.5 text-[12.5px] font-semibold text-text-muted transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("clearFilters")}
          </Link>
        )}
      </div>
    </form>
  );
}
