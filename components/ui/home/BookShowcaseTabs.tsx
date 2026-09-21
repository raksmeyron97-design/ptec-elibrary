// components/ui/home/BookShowcaseTabs.tsx
"use client";

// Motion is CSS only (it was framer-motion's layoutId + AnimatePresence, which
// kept the animation library on the homepage's critical path): the active
// tab's pill cross-fades between the two tabs by opacity, and a switch plays
// the 200 ms `.tab-panel-in` entrance (opacity + transform) on the new panel.
// Both are off under reduced motion.
//
// ── Accessibility contract (WAI-ARIA APG, Tabs pattern) ──────────────────────
// Matches components/about/RulesAudienceTabs.tsx, which is this codebase's
// reference implementation — read that file's header for the reasoning behind
// roving tabIndex and automatic activation. Three things are specific here:
//
//   • ONE PANEL, not one per tab. The panel's content is a slice of book cards
//     that BrowseBooksSection deliberately caps server-side ("only the shown
//     slice is serialized to the client"); rendering every tab's panel and
//     `hidden`-ing the inactive ones would double the cards in the document to
//     satisfy a shape the pattern does not require. Both tabs therefore
//     `aria-controls` the same panel, and the panel's `aria-labelledby` follows
//     the selection.
//   • THE DEPARTMENT CHIPS ARE NOT TABS. They filter the panel the tabs
//     select, so they are toggle buttons in a labelled group and carry
//     `aria-pressed` — previously the active chip was distinguishable by
//     colour alone (WCAG 1.4.1).
//   • EXACTLY ONE TAB IS ALWAYS SELECTED. See `select()` below.

import { useCallback, useId, useRef, useState, type ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import BookCard from "@/components/ui/books/BookCard";
import type { BookCardData } from "@/lib/books/card-data";
import BookCarousel from "./BookCarousel";
import { useTranslations } from "next-intl";
import { StaggerRevealContainer, StaggerRevealItem } from "@/components/ui/animations/ScrollRevealWrapper";

// Imported, not re-derived: this is the branded type, so a caller cannot
// hand this component anything that did not come through toBookCardData().

type TabKey = "trending" | "recent";

const TABS: readonly TabKey[] = ["trending", "recent"] as const;

type Props = {
  trending: BookCardData[];
  recent: BookCardData[];
  /** Distinct department names to show as filter chips (pre-sorted, max 6) */
  depts?: string[];
  /** Pre-grouped books per department (trending order, max 10 each) */
  deptBooks?: Record<string, BookCardData[]>;
  layout?: "carousel" | "grid";
  /** Cap the number of cards shown per tab (homepage preview keeps this ≤ 8). */
  maxItems?: number;
};

const TAB_HREFS: Record<TabKey, string> = {
  trending: "/books?sort=downloads",
  recent: "/books?sort=newest",
};

export default function BookShowcaseTabs({
  trending,
  recent,
  depts = [],
  deptBooks = {},
  layout = "carousel",
  maxItems,
}: Props) {
  const t = useTranslations("home");
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const [tab, setTab] = useState<TabKey>("trending");
  const [activeDept, setActiveDept] = useState<string | null>(null);
  // The entrance plays on a SWITCH only — never on the first render, where it
  // would hold the homepage's shelf transparent while the page loads.
  const [switched, setSwitched] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Picking a department forces the "trending" tab, and that is a correctness
  // fix as much as an accessibility one. `getDeptBooksCached()` orders every
  // department's books by `download_count` and never by recency, so the old
  // behaviour — keep whichever tab was active — rendered download-ranked books
  // under the "Recently Added" label. It also left `aria-selected="false"` on
  // BOTH tabs, i.e. a tablist with no selected tab. One rule settles both: the
  // selected tab always describes the order the panel is actually in.
  const select = useCallback((nextTab: TabKey, dept: string | null) => {
    setTab(dept ? "trending" : nextTab);
    setActiveDept(dept);
    setSwitched(true);
  }, []);

  // Automatic activation (selection follows focus) — switching panels here is
  // instant and local, which is the case the APG recommends it for.
  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const index = TABS.indexOf(tab);
      let next: number | null = null;
      if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = TABS.length - 1;
      if (next === null) return;
      event.preventDefault();
      const target = TABS[next];
      select(target, null);
      tabRefs.current[target]?.focus();
    },
    [tab, select],
  );

  // When a dept chip is active, show its pre-fetched books (trending order).
  // Sort toggle only applies to the "All" view.
  const allBooks = activeDept
    ? (deptBooks[activeDept] ?? [])
    : tab === "trending"
      ? trending
      : recent;
  const books = maxItems ? allBooks.slice(0, maxItems) : allBooks;

  const viewAllHref = activeDept
    ? `/books?department=${encodeURIComponent(activeDept)}`
    : TAB_HREFS[tab];

  const listLabel = activeDept
    ? t("browseListDept", { department: activeDept })
    : tab === "trending"
      ? t("browseListTrending")
      : t("browseListRecent");

  const emptyLabel = activeDept
    ? t("browseEmptyDept", { department: activeDept })
    : tab === "trending"
      ? t("browseEmptyTrending")
      : t("browseEmptyRecent");

  return (
    <div>
      {/* ── Tab header + view-all link ── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div
          role="tablist"
          aria-label={t("browseTabsLabel")}
          className="inline-flex rounded-full border border-divider bg-bg-surface p-1 shadow-sm shadow-inner"
        >
          {TABS.map((key) => {
            const active = key === tab;
            return (
              <button
                key={key}
                ref={(node) => {
                  tabRefs.current[key] = node;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${key}`}
                aria-selected={active}
                aria-controls={panelId}
                tabIndex={active ? 0 : -1}
                onClick={() => select(key, null)}
                onKeyDown={onTabKeyDown}
                className={`relative rounded-full px-4 py-2 text-[13px] font-bold transition-colors sm:px-5 ${
                  active ? "text-white" : "text-text-muted hover:text-text-heading"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute inset-0 rounded-full bg-gradient-to-r from-brand to-blue-600 shadow-md shadow-brand/20 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="relative">{key === "trending" ? t("browseTrending") : t("browseRecent")}</span>
              </button>
            );
          })}
        </div>

        <Link
          href={viewAllHref}
          className="group hidden shrink-0 items-center gap-2 rounded-full border border-brand/30 bg-brand/[0.06] px-4 py-[7px] text-[13px] font-semibold text-brand transition-all duration-200 hover:border-brand hover:bg-brand hover:text-brand-contrast hover:shadow-sm hover:shadow-brand/25 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-flex"
        >
          {t("browseResources")}
          <svg
            className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {/* ── Department filter chips ──
          Toggle buttons, not tabs: they narrow the panel the tablist above
          selects. `aria-pressed` is what carries the active state to a screen
          reader — the border/background pair carries it to everyone else.

          `role="group"` rather than <fieldset>, deliberately: react-doctor's
          prefer-tag-over-role flags this, but <fieldset> groups FORM CONTROLS,
          and these are buttons that filter a view. role="group" + aria-pressed
          is the vocabulary every other toggle row here already speaks — see
          AbstractLanguageSwitch, CitePublication, ResultToolbar. */}
      {depts.length > 0 && (
        <div
          role="group"
          aria-label={t("deptFilterLabel")}
          className="mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* "All" chip */}
          <button type="button" onClick={() => select(tab, null)}
            aria-pressed={activeDept === null}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-[12px] font-bold transition-colors ${
              activeDept === null
                ? "border-brand bg-brand text-brand-contrast"
                : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-heading"
            }`}
          >
            {t("deptAll")}
          </button>

          {depts.map((dept) => (
            <button key={dept} type="button" onClick={() => select(tab, dept)}
              aria-pressed={activeDept === dept}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-[12px] font-bold transition-colors ${
                activeDept === dept
                  ? "border-brand bg-brand text-brand-contrast"
                  : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-heading"
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
      )}

      {/* ── Panel ──
          The tabpanel element itself is STABLE (`aria-controls` must not point
          at a node that is replaced on every switch); the keyed child inside is
          what remounts to play the entrance animation.
          tabIndex 0 so a keyboard user can scroll the panel after tabbing out
          of the tablist, per the APG. */}
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${baseId}-tab-${tab}`}
        tabIndex={0}
      >
        <div key={activeDept ?? tab} className={switched ? "tab-panel-in" : undefined}>
          {books.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-divider bg-paper text-sm text-text-muted">
              {emptyLabel}
            </div>
          ) : layout === "grid" ? (
            <StaggerRevealContainer className="grid grid-cols-2 gap-4 sm:gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {books.map((book) => (
                <StaggerRevealItem key={book.slug} className="h-full">
                  <BookCard book={book} />
                </StaggerRevealItem>
              ))}
            </StaggerRevealContainer>
          ) : (
            <BookCarousel aria-label={listLabel}>
              {books.map((book) => (
                <BookCard key={book.slug} book={book} />
              ))}
            </BookCarousel>
          )}
        </div>
      </div>
    </div>
  );
}
