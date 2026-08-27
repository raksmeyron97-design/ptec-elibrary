"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import {
  DUPLICATE_CONFIDENCES,
  DUPLICATE_SORTS,
  SIGNAL_DISPLAY_ORDER,
  type DuplicateSort,
} from "@/lib/admin/duplicate-review";
import type { DuplicateConfidence, DuplicateSignal } from "@/lib/admin/duplicates";

/**
 * Search + facets for the duplicate queue. Every control writes to the URL, so
 * a filtered queue is a link one librarian can send another, survives a
 * refresh, and restores on browser back — the retire action reloads this page,
 * and losing the filter on every action would make the queue unworkable.
 *
 * Changing any facet drops `page`: a narrower filter can leave the page number
 * in the URL pointing past the end of the result set.
 */

const SELECT_CLASS =
  "focus-field h-9 w-full cursor-pointer appearance-none rounded-lg border border-divider bg-bg-surface bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pl-3 pr-8 text-[13px] font-medium text-text-body transition-colors hover:border-brand hover:text-brand sm:w-auto";

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export default function DuplicateFilters({
  basePath,
  search,
  confidence,
  signal,
  sort,
  shown,
  total,
}: {
  basePath: string;
  search: string;
  confidence: DuplicateConfidence | "all";
  signal: DuplicateSignal | "all";
  sort: DuplicateSort;
  /** Groups after filtering, and the unfiltered total — the count line has to
   *  say which of the two it is showing. */
  shown: number;
  total: number;
}) {
  const t = useTranslations("adminDuplicates");
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState(search);
  const [syncedSearch, setSyncedSearch] = useState(search);

  // The URL is the source of truth: a back/forward navigation or a cleared
  // filter must be reflected in the box the reader is typing into. Adjusted
  // during render (the pattern React documents for "reset state when a prop
  // changes") rather than in an effect, which would paint the stale value
  // first and then immediately re-render.
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setDraft(search);
  }

  const hrefFor = (key: string, value: string | null): string => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "" || value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    const qs = next.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const go = (key: string, value: string | null) => router.push(hrefFor(key, value), { scroll: false });

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    go("q", draft.trim() || null);
  };

  const clearHref = basePath;
  const hasFilters = Boolean(search) || confidence !== "all" || signal !== "all" || sort !== "confidence";

  return (
    <section
      aria-label={t("filters.aria")}
      className="rounded-2xl border border-divider bg-bg-surface p-3 shadow-sm"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form onSubmit={submitSearch} role="search" className="relative min-w-0 flex-1">
          <label htmlFor="duplicate-search" className="sr-only">
            {t("filters.searchLabel")}
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id="duplicate-search"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            dir="auto"
            className="focus-field h-9 w-full rounded-lg border border-divider bg-bg-surface pl-9 pr-20 text-[13px] text-text-body placeholder:text-text-muted"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {draft && (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  go("q", null);
                }}
                className="focus-field rounded-md p-1 text-text-muted transition hover:text-text-heading"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{t("filters.clearSearch")}</span>
              </button>
            )}
            <button
              type="submit"
              className="focus-field rounded-md px-2 py-1 text-[12px] font-semibold text-brand transition hover:bg-surface-brand-soft"
            >
              {t("filters.submit")}
            </button>
          </div>
        </form>

        <div className="dash-seg flex-wrap" role="group" aria-label={t("filters.confidence")}>
          <Link
            href={hrefFor("confidence", null)}
            data-active={confidence === "all"}
            aria-current={confidence === "all" ? "true" : undefined}
            className="dash-seg-btn"
          >
            {t("filters.confidenceAll")}
          </Link>
          {DUPLICATE_CONFIDENCES.map((level) => (
            <Link
              key={level}
              href={hrefFor("confidence", level)}
              data-active={confidence === level}
              aria-current={confidence === level ? "true" : undefined}
              className="dash-seg-btn"
            >
              {t(`confidenceShort.${level}`)}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="duplicate-signal" className="sr-only">
            {t("filters.signal")}
          </label>
          <select
            id="duplicate-signal"
            value={signal}
            onChange={(event) => go("signal", event.target.value)}
            className={SELECT_CLASS}
            style={{ backgroundImage: CHEVRON }}
          >
            <option value="all">{t("filters.signalAll")}</option>
            {SIGNAL_DISPLAY_ORDER.map((option) => (
              <option key={option} value={option}>
                {t(`signals.${option}`)}
              </option>
            ))}
          </select>

          <label htmlFor="duplicate-sort" className="sr-only">
            {t("filters.sort")}
          </label>
          <select
            id="duplicate-sort"
            value={sort}
            onChange={(event) => go("sort", event.target.value)}
            className={SELECT_CLASS}
            style={{ backgroundImage: CHEVRON }}
          >
            {DUPLICATE_SORTS.map((option) => (
              <option key={option} value={option}>
                {t(`sort.${option}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-divider pt-2.5">
        <p className="text-[12px] tabular-nums text-text-muted">
          {t("filters.showing", { shown, total })}
        </p>
        {hasFilters && (
          <Link
            href={clearHref}
            className="focus-field inline-flex items-center gap-1 rounded-full border border-surface-brand-line bg-surface-brand-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-brand transition hover:bg-brand/10"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            {t("filters.clear")}
          </Link>
        )}
      </div>
    </section>
  );
}
