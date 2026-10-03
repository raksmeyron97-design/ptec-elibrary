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
//   • ONE PANEL, not one per tab. The panel's content is a slice of shelf
//     items that BrowseBooksSection deliberately caps server-side ("only the
//     shown slice is serialized to the client"); rendering every tab's panel
//     and `hidden`-ing the inactive ones would multiply the covers in the
//     document to satisfy a shape the pattern does not require. Every tab
//     therefore `aria-controls` the same panel, and the panel's
//     `aria-labelledby` follows the selection.
//   • THE DEPARTMENT CHIPS ARE NOT TABS. They filter the panel the tabs
//     select, so they are toggle buttons in a labelled group and carry
//     `aria-pressed` — previously the active chip was distinguishable by
//     colour alone (WCAG 1.4.1). They exist only while Trending is selected:
//     every department list is download-ranked, which is Trending's order.
//   • EXACTLY ONE TAB IS ALWAYS SELECTED. See `select()` below.

import { useCallback, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { BookCardData } from "@/lib/books/card-data";
import { useTranslations } from "next-intl";
import ShelfCover from "./ShelfCover";
import { SHELF_MAX_ITEMS, bookItems, shelfKey, type ShelfItem, type ShelfThesis } from "./shelf";

// Imported, not re-derived: BookCardData is the branded type, so a caller
// cannot hand this component a book that did not come through
// toBookCardData().

type TabKey = "trending" | "recent" | "theses";

const TABS: readonly TabKey[] = ["trending", "recent", "theses"] as const;

type Props = {
  trending: BookCardData[];
  recent: BookCardData[];
  theses?: ShelfThesis[];
  /** Distinct department names to show as filter chips (pre-sorted, max 6) */
  depts?: string[];
  /** Pre-grouped books per department (trending order) */
  deptBooks?: Record<string, BookCardData[]>;
  /**
   * Trending books the hero already shows at lg (its cover fan). Those are
   * hidden from the unfiltered Trending tab at lg and the next ones shown, so
   * no book is on screen twice; below lg (no fan) the tab shows the top six.
   * `trending` must carry SHELF_MAX_ITEMS + skipOnDesktop books for this.
   */
  skipOnDesktop?: number;
};

const TAB_HREFS: Record<TabKey, string> = {
  trending: "/books?sort=downloads",
  recent: "/books?sort=newest",
  theses: "/theses",
};

const TAB_LABEL_KEY = {
  trending: "browseTrending",
  recent: "browseRecent",
  theses: "tabTheses",
} as const;

const ACTION_CLASS =
  "group items-center gap-1.5 rounded-sm text-[13.5px] font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

export default function BookShowcaseTabs({
  trending,
  recent,
  theses = [],
  depts = [],
  deptBooks = {},
  skipOnDesktop = 0,
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
  // department's books by `download_count` and never by recency, so showing
  // them under another tab's label would misdescribe the order. One rule
  // settles it: the selected tab always describes the order the panel is in.
  // Leaving Trending clears the department, since its chips go with it.
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

  // The unfiltered Trending tab is the one the hero's fan overlaps.
  const skip = !activeDept && tab === "trending" ? skipOnDesktop : 0;
  const items: ShelfItem[] = (
    activeDept
      ? bookItems(deptBooks[activeDept] ?? [])
      : tab === "trending"
        ? bookItems(trending)
        : tab === "recent"
          ? bookItems(recent)
          : theses
  ).slice(0, SHELF_MAX_ITEMS + skip);
  /** Phones show items [0, 6); lg shows [skip, skip + 6). */
  const itemVisibility = (i: number) =>
    i < skip ? "lg:hidden" : i >= SHELF_MAX_ITEMS ? "max-lg:hidden" : "";

  const viewAllHref = activeDept
    ? `/books?dept=${encodeURIComponent(activeDept)}`
    : TAB_HREFS[tab];

  const listLabel = activeDept
    ? t("browseListDept", { department: activeDept })
    : tab === "trending"
      ? t("browseListTrending")
      : tab === "recent"
        ? t("browseListRecent")
        : t("browseListTheses");

  const emptyLabel = activeDept
    ? t("browseEmptyDept", { department: activeDept })
    : tab === "trending"
      ? t("browseEmptyTrending")
      : tab === "recent"
        ? t("browseEmptyRecent")
        : t("browseEmptyTheses");

  const chip = (pressed: boolean) =>
    `shrink-0 rounded-full border px-4 py-1.5 text-[12px] font-bold transition-colors ${
      pressed
        ? "border-brand bg-brand text-brand-contrast"
        : "border-border bg-paper text-text-muted hover:border-brand/40 hover:text-text-heading"
    }`;

  return (
    <div>
      {/* ── Tab header + view-all link ──
          Phones: the tablist is a full-width segmented control. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label={t("browseTabsLabel")}
          className="flex w-full rounded-full border border-border bg-paper p-1 sm:inline-flex sm:w-auto"
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
                className={`relative flex-1 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-bold transition-colors sm:flex-none sm:px-5 ${
                  active ? "text-brand-contrast" : "text-text-muted hover:text-text-heading"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute inset-0 rounded-full bg-brand shadow-sm transition-opacity duration-200 ease-out motion-reduce:transition-none ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="relative">{t(TAB_LABEL_KEY[key])}</span>
              </button>
            );
          })}
        </div>

        <Link href={viewAllHref} className={`hidden sm:inline-flex ${ACTION_CLASS}`}>
          {t("browseResources")}
          <svg
            className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {/* ── Department filter chips — Trending only ──
          Toggle buttons, not tabs: they narrow the panel the tablist above
          selects. `aria-pressed` is what carries the active state to a screen
          reader — the border/background pair carries it to everyone else.

          `role="group"` rather than <fieldset>, deliberately: react-doctor's
          prefer-tag-over-role flags this, but <fieldset> groups FORM CONTROLS,
          and these are buttons that filter a view. role="group" + aria-pressed
          is the vocabulary every other toggle row here already speaks — see
          AbstractLanguageSwitch, CitePublication, ResultToolbar. */}
      {tab === "trending" && depts.length > 0 && (
        <div
          role="group"
          aria-label={t("deptFilterLabel")}
          className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <button type="button" onClick={() => select("trending", null)} aria-pressed={activeDept === null} className={chip(activeDept === null)}>
            {t("deptAll")}
          </button>
          {depts.map((dept) => (
            <button key={dept} type="button" onClick={() => select("trending", dept)} aria-pressed={activeDept === dept} className={chip(activeDept === dept)}>
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
        className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        <div key={activeDept ?? tab} className={switched ? "tab-panel-in" : undefined}>
          {items.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-paper text-sm text-text-muted">
              {emptyLabel}
            </div>
          ) : (
            // One list for every width. Phones: a snap row, each cover 40% of
            // the screen, so the next one peeks in. From sm: a grid (4, then 6
            // across). The same DOM either way — a second, phone-only copy
            // would double every link on the page.
            <ul
              aria-label={listLabel}
              className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:scroll-px-0 sm:grid-cols-4 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6 [&::-webkit-scrollbar]:hidden"
            >
              {items.map((item, i) => (
                <li key={shelfKey(item)} className={`w-[40%] shrink-0 snap-start sm:w-auto ${itemVisibility(i)}`}>
                  <ShelfCover item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Phones: the view-all link below the row, under the thumb. */}
      <div className="mt-5 sm:hidden">
        <Link href={viewAllHref} className={`inline-flex min-h-[40px] ${ACTION_CLASS}`}>
          {t("browseResources")}
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
