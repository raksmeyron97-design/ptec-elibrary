"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Download, Lock, Search, X } from "lucide-react";
import type { AuthorWork, AuthorWorkType } from "@/lib/authors/types";

/**
 * The author's works.
 *
 * An academic publication list, not a grid of marketing cards: one row per
 * work, grouped under its year, with the facts a reader scans for (venue,
 * byline, DOI, access state) on the row rather than behind it. That layout is
 * why 40 works fit on a screen a reader can actually use.
 *
 * Search and filtering are CLIENT-SIDE over an already-fetched list. The whole
 * set is at most a few dozen rows — it arrives with the page, so filtering is
 * instant, works with JavaScript disabled degrading to the full list, and
 * costs no round trip. Filter state deliberately does NOT go in the URL here:
 * this is a reading aid inside one profile, not a shareable view, and putting
 * it in the URL would make every filter click a navigation that re-renders the
 * server component above it.
 */

const ALL = "all" as const;
type Filter = typeof ALL | AuthorWorkType;

export interface WorksListLabels {
  searchPlaceholder: string;
  searchLabel: string;
  clearSearch: string;
  filterLabel: string;
  all: string;
  types: Record<AuthorWorkType, string>;
  noResults: string;
  noResultsHint: string;
  empty: string;
  undated: string;
  downloadable: string;
  readOnly: string;
  resultCount: string;
}

/** Case-insensitive, accent-tolerant haystack for one row. */
function haystack(work: AuthorWork): string {
  return [work.title, work.venue, work.byline, work.excerpt, work.doi]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-divider bg-paper px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-text-muted">
      {label}
    </span>
  );
}

export default function AuthorWorksList({
  works,
  counts,
  labels,
}: {
  works: AuthorWork[];
  /** Per-type counts from the server, so the chips can show them. */
  counts: { type: AuthorWorkType; count: number }[];
  labels: WorksListLabels;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(ALL);
  const searchId = useId();

  // Keeps typing responsive on a long list: the input updates every keystroke,
  // the filtered list is allowed to lag a frame behind it.
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();
    return works.filter((work) => {
      if (filter !== ALL && work.type !== filter) return false;
      if (!term) return true;
      return haystack(work).includes(term);
    });
  }, [works, filter, deferredQuery]);

  // Group by year, preserving the incoming (already sorted) order. Undated
  // works collect under their own heading at the end rather than being dropped
  // or filed under a year nobody claimed.
  const groups = useMemo(() => {
    const byYear = new Map<number | null, AuthorWork[]>();
    for (const work of filtered) {
      const list = byYear.get(work.year);
      if (list) list.push(work);
      else byYear.set(work.year, [work]);
    }
    return [...byYear.entries()].sort((a, b) => {
      if (a[0] === b[0]) return 0;
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      return b[0] - a[0];
    });
  }, [filtered]);

  if (works.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-10 text-center text-[14.5px] text-text-muted">
        {labels.empty}
      </p>
    );
  }

  // Only offer the controls that can do something: a profile with four works
  // of one kind needs neither a search box nor a set of filter chips.
  const showSearch = works.length > 6;
  const showFilters = counts.length > 1;

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: ALL, label: labels.all, count: works.length },
    ...counts.map((c) => ({ key: c.type as Filter, label: labels.types[c.type], count: c.count })),
  ];

  return (
    <div>
      {(showSearch || showFilters) && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {showSearch && (
            <div className="focus-shell relative flex w-full items-center rounded-xl border border-divider bg-bg-surface sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
                aria-hidden="true"
              />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={labels.searchLabel}
                placeholder={labels.searchPlaceholder}
                className="min-h-11 w-full bg-transparent pl-9 pr-9 text-[14px] text-text-body outline-none placeholder:text-text-muted"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={labels.clearSearch}
                  className="focus-field absolute right-2 cursor-pointer rounded-md p-1.5 text-text-muted transition-colors hover:text-text-heading"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {showFilters && (
            // A radiogroup, not a row of toggles: exactly one filter is active
            // at a time, and that is what a screen reader should be told.
            <div
              role="radiogroup"
              aria-label={labels.filterLabel}
              className="flex flex-wrap items-center gap-1.5"
            >
              {chips.map((chip) => {
                const active = filter === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFilter(chip.key)}
                    className={`focus-field inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-body"
                    }`}
                  >
                    {chip.label}
                    <span className="text-[11px] font-bold tabular-nums opacity-70">
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Announces the filtered count to a screen reader without stealing
          focus, which is the only signal a non-sighted user gets that typing
          in the search box did anything. */}
      <p aria-live="polite" className="sr-only">
        {labels.resultCount.replace("{count}", String(filtered.length))}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-10 text-center">
          <p className="text-[14.5px] font-semibold text-text-heading">{labels.noResults}</p>
          <p className="mt-1 text-[13px] text-text-muted">{labels.noResultsHint}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([year, items]) => (
            <section key={year ?? "undated"} aria-label={year ? String(year) : labels.undated}>
              <h3 className="mb-3 flex items-center gap-3 text-[13px] font-bold tracking-[0.06em] text-text-muted tabular-nums">
                {year ?? labels.undated}
                <span aria-hidden="true" className="h-px flex-1 bg-divider" />
              </h3>

              <ul className="divide-y divide-divider border-y border-divider">
                {items.map((work) => (
                  <li key={`${work.type}-${work.id}`} className="py-4">
                    <div className="flex items-baseline gap-2.5">
                      <TypeBadge label={labels.types[work.type]} />
                      <h4 className="min-w-0 text-[15.5px] font-bold leading-[1.45] text-text-heading">
                        <Link
                          href={work.href}
                          className="focus-field rounded-sm underline-offset-4 transition-colors hover:text-brand hover:underline"
                        >
                          {work.title}
                        </Link>
                      </h4>
                    </div>

                    {(work.venue || work.byline) && (
                      <p className="mt-1.5 text-[13px] leading-6 text-text-muted">
                        {work.venue && <em className="not-italic font-semibold">{work.venue}</em>}
                        {work.venue && work.byline && <span aria-hidden="true"> · </span>}
                        {work.byline && <span className="line-clamp-1">{work.byline}</span>}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
                      {work.doi && (
                        <a
                          href={`https://doi.org/${work.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-field rounded-sm font-mono text-text-muted underline-offset-2 transition-colors hover:text-brand hover:underline"
                        >
                          {work.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}
                        </a>
                      )}
                      {/* Access state is never colour-only: each state carries
                          its own icon and its own words. */}
                      {work.downloadable ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-success">
                          <Download className="h-3 w-3" aria-hidden="true" />
                          {labels.downloadable}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-text-muted">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          {labels.readOnly}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
