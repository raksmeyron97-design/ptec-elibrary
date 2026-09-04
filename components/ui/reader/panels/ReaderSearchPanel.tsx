"use client";

import { memo, type RefObject } from "react";
import { ChevronDown, ChevronUp, Loader2, Search as SearchIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PageHit } from "../hooks/useReaderSearch";

/* Search this book: a debounced field, "3 of 18", previous/next, and one
   row per page with matches. */
const ReaderSearchPanel = memo(function ReaderSearchPanel({
  inputRef,
  input,
  onInputChange,
  onSubmit,
  onClear,
  query,
  hits,
  totalMatches,
  currentMatch,
  searching,
  onPrev,
  onNext,
  onSelectHit,
  fmt,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (backwards: boolean) => void;
  onClear: () => void;
  query: string;
  hits: PageHit[];
  totalMatches: number;
  currentMatch: number;
  searching: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelectHit: (hit: PageHit) => void;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  const status = searching
    ? t("searching")
    : query
      ? hits.length
        ? t("matchesLabel", { count: totalMatches })
        : t("noResults")
      : "";
  return (
    <div className="flex h-full flex-col">
      <label className="sr-only" htmlFor="ptec-reader-search">{t("searchThisBook")}</label>
      <div className="relative">
        <SearchIcon className="reader-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
        <input
          ref={inputRef}
          id="ptec-reader-search"
          type="search"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            onSubmit(e.shiftKey);
          }}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          enterKeyHint="search"
          className="reader-input pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {input && (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("clearSearch")}
            className="reader-btn absolute right-0.5 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-2 flex min-h-[2.25rem] items-center justify-between gap-2 px-1">
        <span aria-live="polite" className="reader-muted flex items-center gap-1.5 text-[12px] font-semibold">
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
          {totalMatches > 0 && currentMatch >= 0
            ? t("matchCount", { current: fmt(currentMatch + 1), total: fmt(totalMatches) })
            : status}
        </span>
        {totalMatches > 0 && (
          <span className="flex items-center">
            <button type="button" onClick={onPrev} aria-label={t("prevMatch")} className="reader-btn">
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={onNext} aria-label={t("nextMatch")} className="reader-btn">
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          </span>
        )}
      </div>

      <ul className="mt-1 flex-1 space-y-0.5">
        {hits.map((h) => {
          const active = currentMatch >= h.firstMatch && currentMatch < h.firstMatch + h.count;
          return (
            <li key={h.page}>
              <button
                type="button"
                onClick={() => onSelectHit(h)}
                aria-current={active ? "true" : undefined}
                className="reader-row flex-col items-stretch gap-0.5"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="reader-accent text-[12px] font-bold">{t("page")} {fmt(h.page)}</span>
                  {h.count > 1 && <span className="reader-faint text-[11px] tabular-nums">{fmt(h.count)}</span>}
                </span>
                <span className="reader-muted line-clamp-2 text-[12px] leading-5">…{h.snippet}…</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

export default ReaderSearchPanel;
