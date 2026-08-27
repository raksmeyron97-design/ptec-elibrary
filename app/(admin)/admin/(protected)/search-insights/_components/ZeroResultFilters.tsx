"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import {
  PAGE_SIZES,
  SEARCH_LANGUAGES,
  ZERO_RESULT_SORTS,
  ZERO_RESULT_STATUSES,
  type ZeroResultStatus,
} from "@/lib/admin/search-insights-shared";

const FIELD =
  "h-9 rounded-lg border border-divider bg-bg-surface px-2.5 text-[12.5px] text-text-body transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Filters for the zero-result workspace. Every one is a URL parameter, so a
 * filtered view is a link — and the server, not the browser, decides which
 * rows come back.
 *
 * The text box is debounced rather than submitted: typing pushes a new URL
 * 350 ms after the last keystroke, which is one navigation per phrase instead
 * of one per character.
 */
export default function ZeroResultFilters({
  q,
  lang,
  status,
  sort,
  size,
  statusCounts,
}: {
  q: string;
  lang: string;
  status: ZeroResultStatus;
  sort: string;
  size: number;
  statusCounts: Record<string, number>;
}) {
  const t = useTranslations("adminSearchInsights.zero");
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(q);
  const initial = useRef(true);

  // `q` changes when navigation (back/forward, another control) rewrites the
  // URL out from under the debounced input — adjust the local echo during
  // render rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setTerm(q);
  }

  const push = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("page"); // any filter change returns to page 1
    router.push(`?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (term === q) return;
    const timer = setTimeout(() => {
      push((next) => {
        if (term.trim()) next.set("q", term.trim());
        else next.delete("q");
      });
    }, 350);
    return () => clearTimeout(timer);
    // `push` closes over the current params; re-creating it each render is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-divider px-5 py-3">
      <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          dir="auto"
          className={`${FIELD} w-full ps-8`}
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label={t("clearSearch")}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <label className="sr-only" htmlFor="zero-status">{t("statusLabel")}</label>
      <select
        id="zero-status"
        value={status}
        onChange={(event) => push((next) => {
          if (event.target.value === "all") next.delete("status");
          else next.set("status", event.target.value);
        })}
        className={FIELD}
      >
        {ZERO_RESULT_STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`status.${value}`)}
            {statusCounts[value] !== undefined ? ` (${statusCounts[value]})` : ""}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="zero-lang">{t("languageLabel")}</label>
      <select
        id="zero-lang"
        value={lang}
        onChange={(event) => push((next) => {
          if (event.target.value === "all") next.delete("lang");
          else next.set("lang", event.target.value);
        })}
        className={FIELD}
      >
        {SEARCH_LANGUAGES.map((value) => (
          <option key={value} value={value}>{t(`language.${value}`)}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="zero-sort">{t("sortLabel")}</label>
      <select
        id="zero-sort"
        value={sort}
        onChange={(event) => push((next) => {
          if (event.target.value === "count") next.delete("sort");
          else next.set("sort", event.target.value);
        })}
        className={FIELD}
      >
        {ZERO_RESULT_SORTS.map((value) => (
          <option key={value} value={value}>{t(`sort.${value}`)}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="zero-size">{t("rowsLabel")}</label>
      <select
        id="zero-size"
        value={size}
        onChange={(event) => push((next) => {
          if (Number(event.target.value) === 10) next.delete("size");
          else next.set("size", event.target.value);
        })}
        className={FIELD}
      >
        {PAGE_SIZES.map((value) => (
          <option key={value} value={value}>{t("rowsPerPage", { count: value })}</option>
        ))}
      </select>
    </div>
  );
}
