import { X } from "lucide-react";
import { FilterLink } from "@/components/ui/books/ClientNavWrapper";

// What the reader has narrowed the collection to, and how to undo any part of
// it, above the results rather than inside the rail.
//
// The problem this solves: the facets were only visible in the sidebar, which
// is off-screen on a phone (behind the Filters button) and scrolled away on a
// laptop once you start reading results. A reader who arrived from a keyword
// chip on a thesis record — the most common way anyone lands here filtered —
// saw a short list with no visible reason for being short, and the only way to
// widen it was to open the rail and hunt for the checked box.
//
// Each chip names the FACET as well as the value ("Cohort · 3", not "3"). The
// facet names are this collection's own vocabulary — program, faculty, cohort,
// advisor — and a bare value tells a reader nothing about which of those it
// came from when two of them read alike.
//
// Removal is a link, not a button: every filter is already a URL, so each × is
// a real navigation that works without JavaScript and can be opened in a new
// tab. <FilterLink> is the shared client wrapper the rest of the listing uses
// for in-place param navigation — deliberately NOT the locale-aware Link, see
// the note in ClientNavWrapper.

export type AppliedFilter = {
  /** Query-string key this chip clears, e.g. "cohort". */
  key: string;
  /** Facet name shown before the value, e.g. "Cohort". */
  label: string;
  /** Human-readable value — a resolved name, never a raw code. */
  value: string;
};

function buildHref(
  basePath: string,
  params: Record<string, string | undefined>,
  drop: string[],
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    // `page` always goes: removing a filter widens the result set, and staying
    // on page 4 of a list that just grew is never what the reader meant.
    if (!v || drop.includes(k) || k === "page") continue;
    p.set(k, v);
  }
  const qs = p.toString();
  return `${basePath}${qs ? `?${qs}` : ""}`;
}

export default function AppliedFilters({
  filters,
  params,
  basePath,
  clearAllLabel = "Clear all",
  heading = "Filtered by",
}: {
  filters: AppliedFilter[];
  params: Record<string, string | undefined>;
  basePath: string;
  clearAllLabel?: string;
  heading?: string;
}) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
        {heading}
      </span>

      {filters.map((f) => (
        <FilterLink
          key={`${f.key}-${f.value}`}
          href={buildHref(basePath, params, [f.key])}
          className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-surface-brand-line bg-surface-brand-soft py-1 pl-3 pr-2 text-[12.5px] text-brand transition-colors duration-150 hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          <span className="min-w-0 truncate">
            <span className="font-semibold">{f.label}</span>
            <span className="mx-1 text-brand/50" aria-hidden="true">
              ·
            </span>
            {f.value}
          </span>
          <X
            className="h-3.5 w-3.5 shrink-0 text-brand/60 transition-colors group-hover:text-brand"
            aria-hidden="true"
          />
          {/* The visible chip reads "Cohort · 3"; on its own that announces as
              a link to nowhere in particular. This says what activating it
              does. */}
          <span className="sr-only">
            Remove {f.label} filter {f.value}
          </span>
        </FilterLink>
      ))}

      {filters.length > 1 && (
        <FilterLink
          href={buildHref(
            basePath,
            params,
            filters.map((f) => f.key),
          )}
          className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-text-muted underline decoration-text-muted/40 underline-offset-4 transition-colors duration-150 hover:text-brand hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {clearAllLabel}
        </FilterLink>
      )}
    </div>
  );
}
