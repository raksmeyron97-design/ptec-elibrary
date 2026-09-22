"use client";

// components/about/TeamDirectoryToolbar.tsx
//
// The directory's controls: one large search field, a row of service-area
// chips, and the result count.
//
// ── Hierarchy ──
// Search is the PRIMARY control and is sized like one (48px tall, 16px text).
// The chips are secondary and sit beneath it. The count is tertiary — muted,
// small, and on the right of the row from `md` up. The point of the ordering
// is that the controls stop competing with the faces below them.
//
// ── Why there is no debounce ──
// Filtering runs in memory over the roster the page already fetched — a dozen
// rows — so there is no request to make and nothing to wait for. A debounce
// here would only delay the count, and the count is what tells a reader their
// typing did something.
//
// ── Accessibility ──
//   • The chips are real buttons with `aria-pressed`, grouped and labelled, so
//     the pressed one is announced as pressed rather than merely coloured.
//   • The count is a `role="status"` live region, so a filter or a query that
//     changes the result set is announced without stealing focus. It is not
//     inside the `aria-live` region wrapping the grid — one announcement per
//     change, not two.
//   • The field is 16px: anything smaller makes iOS Safari zoom the page on
//     focus and strand the reader at 2×.
//   • `.focus-shell` on the wrapper of the grouped search control, per
//     docs/ACCESSIBILITY-FOCUS.md; the input carries no second indicator.

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { FILTER_ALL, FILTER_UNSECTIONED, type AreaChip } from "@/lib/team/directory";

export default function TeamDirectoryToolbar({
  chips,
  area,
  onAreaChange,
  query,
  onQueryChange,
  showSearch,
  status,
}: {
  chips: AreaChip[];
  area: string;
  onAreaChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  /** False for a roster small enough to scan by eye — see SEARCH_THRESHOLD. */
  showSearch: boolean;
  /** The already-composed result sentence; the parent owns the plural rules. */
  status: string;
}) {
  const t = useTranslations("about.team");
  const searchId = useId();

  return (
    <div className="team-toolbar">
      {showSearch && (
        <div className="focus-shell team-search">
          <label htmlFor={searchId} className="sr-only">
            {t("directory.searchLabel")}
          </label>
          <Search className="team-search__icon h-4 w-4" aria-hidden="true" />
          <input
            id={searchId}
            // type="text" (not "search") deliberately — the house convention,
            // see PostsSearch.tsx and UserToolbar.tsx. A native type="search"
            // field triggers Chromium's own search-history UI, which injects a
            // `caret-color` style after mount and produces a hydration
            // mismatch (reproduced on this page in dev before this change).
            // role/inputMode/enterKeyHint keep the semantics and give mobile
            // keyboards the right affordances; the clear button below replaces
            // the native ✕ this gives up.
            type="text"
            role="searchbox"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("directory.searchPlaceholder")}
            autoComplete="off"
            className="team-search__input about-wrap"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label={t("directory.searchClear")}
              className="team-search__clear"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* A single-area roster gets no chip row: one chip that is always
          pressed is a control that decides nothing. */}
      {chips.length > 1 && (
        <div role="group" aria-label={t("directory.filterLabel")} className="team-chips">
          {chips.map((chip) => {
            const label =
              chip.value === FILTER_ALL
                ? t("directory.all")
                : chip.value === FILTER_UNSECTIONED
                  ? t("directory.other")
                  : (chip.name?.text ?? t("directory.other"));
            const active = area === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                aria-pressed={active}
                onClick={() => onAreaChange(chip.value)}
                className={`team-chip ${active ? "team-chip--active" : ""}`}
              >
                <span lang={chip.name?.lang} className="about-wrap">
                  {label}
                </span>
                <span className="team-chip__count">{chip.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="team-toolbar__status about-wrap" role="status">
        {status}
      </p>
    </div>
  );
}
