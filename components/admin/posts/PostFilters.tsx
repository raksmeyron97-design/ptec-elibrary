"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { withUpdatedParams } from "@/lib/admin/posts-url";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { CATEGORIES, SORT_OPTIONS, STATUS_LABELS, STATUSES, type PostAuthorOption } from "@/lib/admin/posts-shared";

const selectClass =
  "h-10 rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-focus-ring/30 cursor-pointer";

const compactSelectWrapper = "w-[168px] shrink-0 [&_button]:h-10";

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "most-viewed": "Most viewed",
  "least-viewed": "Least viewed",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
};

const DATE_RANGE_LABELS: Record<string, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

export type PostFiltersValue = {
  category: string;
  status: string;
  dateRange: string;
  dateFrom: string;
  dateTo: string;
  authorId: string;
  minViews: string;
  maxViews: string;
  sort: string;
};

export default function PostFilters({
  value,
  authors,
  hasActiveFilters,
}: {
  value: PostFiltersValue;
  authors: PostAuthorOption[];
  hasActiveFilters: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);

  const setParam = (key: string, v: string) => {
    router.push(withUpdatedParams(searchParams, { [key]: v === "all" || v === "" ? null : v }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Always-visible primary controls (desktop horizontal toolbar; wraps on mobile) */}
      <div className={compactSelectWrapper}>
        <SearchableSelect
          name="category-filter"
          ariaLabel="Filter by category"
          value={value.category || "All"}
          onChange={(v) => setParam("category", v === "All" ? "" : v)}
          options={[{ value: "All", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
        />
      </div>

      <div className={compactSelectWrapper}>
        <SearchableSelect
          name="status-filter"
          ariaLabel="Filter by status"
          value={value.status || "all"}
          onChange={(v) => setParam("status", v)}
          options={[{ value: "all", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
        />
      </div>

      <div className={compactSelectWrapper}>
        <SearchableSelect
          name="date-filter"
          ariaLabel="Filter by date"
          value={value.dateRange || "all"}
          onChange={(v) => setParam("dateRange", v)}
          options={Object.entries(DATE_RANGE_LABELS).map(([k, label]) => ({ value: k, label }))}
        />
      </div>

      <div className={compactSelectWrapper}>
        <SearchableSelect
          name="sort-filter"
          ariaLabel="Sort posts"
          value={value.sort || "newest"}
          onChange={(v) => setParam("sort", v)}
          options={SORT_OPTIONS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
        />
      </div>

      <MoreFiltersButton
        open={moreOpen}
        onOpenChange={setMoreOpen}
        value={value}
        authors={authors}
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => router.push("/admin/posts")}
          className="rounded-lg px-2 py-1 text-[13px] font-semibold text-text-muted transition hover:text-brand"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/** Author + views-range + custom date — less common, tucked into a small dialog. */
function MoreFiltersButton({
  open,
  onOpenChange,
  value,
  authors,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PostFiltersValue;
  authors: PostAuthorOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const headingId = "post-filters-heading";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLButtonElement>(null);

  const [authorId, setAuthorId] = useState(value.authorId);
  const [dateFrom, setDateFrom] = useState(value.dateFrom);
  const [dateTo, setDateTo] = useState(value.dateTo);
  const [minViews, setMinViews] = useState(value.minViews);
  const [maxViews, setMaxViews] = useState(value.maxViews);

  useEffect(() => {
    if (!open) return;
    setAuthorId(value.authorId);
    setDateFrom(value.dateFrom);
    setDateTo(value.dateTo);
    setMinViews(value.minViews);
    setMaxViews(value.maxViews);
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    const trigger = triggerRef.current;

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      trigger?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeExtra = [value.authorId, value.minViews, value.maxViews, value.dateRange === "custom" ? value.dateFrom : ""].some(Boolean);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params: Record<string, string | null> = {
      authorId: authorId || null,
      minViews: minViews || null,
      maxViews: maxViews || null,
    };
    if (value.dateRange === "custom") {
      params.dateFrom = dateFrom || null;
      params.dateTo = dateTo || null;
    }
    onOpenChange(false);
    router.push(withUpdatedParams(searchParams, params));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-[13.5px] font-semibold transition ${
          activeExtra
            ? "border-brand bg-brand/5 text-brand"
            : "border-divider bg-bg-surface text-text-body hover:bg-paper"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        More filters
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => onOpenChange(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-bg-surface p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id={headingId} className="text-lg font-bold text-text-heading">More filters</h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Author</span>
                <SearchableSelect
                  ref={firstFieldRef}
                  name="author-filter"
                  ariaLabel="Author"
                  value={authorId}
                  onChange={setAuthorId}
                  options={[{ value: "", label: "Any author" }, ...authors.map((a) => ({ value: a.id, label: a.name }))]}
                />
              </label>

              {value.dateRange === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">From</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className={`${selectClass} w-full`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">To</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className={`${selectClass} w-full`}
                    />
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Min. views</span>
                  <input
                    type="number"
                    min={0}
                    value={minViews}
                    onChange={(e) => setMinViews(e.target.value)}
                    placeholder="0"
                    className={`${selectClass} w-full`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Max. views</span>
                  <input
                    type="number"
                    min={0}
                    value={maxViews}
                    onChange={(e) => setMaxViews(e.target.value)}
                    placeholder="Any"
                    className={`${selectClass} w-full`}
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setAuthorId(""); setDateFrom(""); setDateTo(""); setMinViews(""); setMaxViews(""); }}
                className="text-[13px] font-semibold text-text-muted hover:text-brand"
              >
                Clear these
              </button>
              <button
                type="submit"
                className="ml-auto inline-flex items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover"
              >
                Apply
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
