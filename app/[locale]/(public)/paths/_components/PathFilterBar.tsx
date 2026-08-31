"use client";

import { useId, type RefObject } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";

export interface FacetSelect {
  /** Query-string key this facet writes, e.g. "difficulty". */
  key: string;
  /** Facet name — the select's accessible label, and the prefix on each chosen value. */
  label: string;
  /** Current value; "" means unset. */
  value: string;
  /** Label for the unset option ("All levels"). For sort this names the default order. */
  allLabel: string;
  options: { value: string; label: string }[];
}

/**
 * The one control surface for the paths catalogue: search plus every
 * refinement, in a single bar directly above the results.
 *
 * Why one bar of native selects rather than the row-per-facet pill stacks this
 * replaced. Three reasons, in order of how much they hurt:
 *
 * 1. The page's SHAPE was unstable. Each facet row rendered only when the data
 *    supported it (`languages.length > 1`, and so on), so the same page was
 *    three, four or five rows tall depending on what happened to be published,
 *    and every row pushed the first card further down. A fixed bar is the same
 *    height whatever the collection holds; facets the data cannot support are
 *    simply absent from one row instead of collapsing a whole band.
 *
 * 2. One idiom instead of five. Search, subject, difficulty, language and sort
 *    were a text field, a native select, two pill groups and a segmented
 *    button group — five ways to express "narrow this list" on one screen.
 *
 * 3. A native select carries its own state legibly ("Level: Beginner"), which
 *    is what let the separate active-filter chip row go: the controls ARE the
 *    filter summary, and they sit in view directly above the grid rather than
 *    in a rail that scrolls away. (Contrast `components/ui/listing/
 *    AppliedFilters`, which is right for the books/theses sidebar precisely
 *    because those facets DO scroll out of view.)
 *
 * Audience deliberately stays as pills outside this bar — it is the editorial
 * "browse by goal" entry point rather than a refinement, and it earns the
 * extra weight.
 */
export default function PathFilterBar({
  regionLabel,
  searchRef,
  searchValue,
  searchLabel,
  searchPlaceholder,
  clearSearchLabel,
  searchingLabel,
  shortcutHint,
  isDebouncing,
  onSearchChange,
  onClearSearch,
  facets,
  onFacetChange,
}: {
  regionLabel: string;
  searchRef: RefObject<HTMLInputElement | null>;
  searchValue: string;
  searchLabel: string;
  searchPlaceholder: string;
  clearSearchLabel: string;
  searchingLabel: string;
  shortcutHint: string;
  isDebouncing: boolean;
  onSearchChange: (next: string) => void;
  onClearSearch: () => void;
  facets: FacetSelect[];
  onFacetChange: (key: string, value: string) => void;
}) {
  const searchId = useId();

  return (
    <section aria-label={regionLabel} className="mb-5">
      <div className="flex flex-col gap-2.5 rounded-2xl border border-divider bg-bg-surface p-2.5 shadow-sm lg:flex-row lg:items-center lg:gap-2.5">
        {/* Search. `.focus-shell` on the wrapper is the app's grouped-field
            focus contract — the wrapper owns the whole indicator so the input
            and the clear button don't paint a second one inside the first. */}
        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="focus-shell relative flex-1 rounded-xl border border-divider bg-bg-body"
        >
          <label htmlFor={searchId} className="sr-only">
            {searchLabel}
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            /* 16px on mobile: anything smaller makes iOS Safari zoom the
               viewport on focus, which strands the visitor mid-page. */
            className="w-full bg-transparent py-2.5 pl-10 pr-20 text-[16px] text-text-heading outline-none placeholder:text-text-muted sm:text-[14px] [&::-webkit-search-cancel-button]:appearance-none"
          />

          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {isDebouncing && (
              <>
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-text-muted motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span className="sr-only" role="status">
                  {searchingLabel}
                </span>
              </>
            )}
            {searchValue ? (
              <button
                type="button"
                onClick={onClearSearch}
                aria-label={clearSearchLabel}
                className="flex h-6 w-6 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              /* A hint, not a control — the shortcut is bound on window. */
              <kbd
                aria-hidden="true"
                className="hidden rounded border border-divider bg-paper px-1.5 py-0.5 text-[10px] font-bold text-text-muted sm:block"
                title={shortcutHint}
              >
                /
              </kbd>
            )}
          </div>
        </form>

        {facets.length > 0 && (
          <>
            <div className="hidden h-7 w-px shrink-0 bg-divider lg:block" aria-hidden="true" />
            {/* Two columns on a phone, one row from `sm` up. `min-w-0` on the
                cells lets a long Khmer facet value shrink instead of forcing
                the bar to scroll sideways. */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:flex-nowrap">
              {facets.map((f) => (
                <FacetField key={f.key} facet={f} onChange={onFacetChange} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FacetField({
  facet,
  onChange,
}: {
  facet: FacetSelect;
  onChange: (key: string, value: string) => void;
}) {
  const id = useId();
  const active = facet.value !== "";

  return (
    <div className="relative min-w-0 sm:w-auto">
      <label htmlFor={id} className="sr-only">
        {facet.label}
      </label>
      <select
        id={id}
        value={facet.value}
        onChange={(e) => onChange(facet.key, e.target.value)}
        className={`focus-field h-10 w-full min-w-0 cursor-pointer appearance-none rounded-xl border bg-bg-body pl-3 pr-8 text-[13px] font-semibold outline-none transition-colors duration-150 sm:max-w-[15rem] ${
          active
            ? "border-surface-brand-line bg-surface-brand-soft text-brand"
            : "border-divider text-text-body hover:border-brand/35"
        }`}
      >
        <option value="">{facet.allLabel}</option>
        {facet.options.map((o) => (
          /* The chosen option carries its facet name, so the collapsed select
             reads "Level: Beginner" — a bare "Beginner" sitting between two
             other selects says nothing about which one it came from. */
          <option key={o.value} value={o.value}>
            {`${facet.label}: ${o.label}`}
          </option>
        ))}
      </select>
      <ChevronDown
        className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${
          active ? "text-brand" : "text-text-muted"
        }`}
        aria-hidden="true"
      />
    </div>
  );
}
