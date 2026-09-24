"use client";

import { useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import BookCard from "@/components/ui/books/BookCard";
import type { BookCardData } from "@/lib/books/card-data";
import ReadingListsSection from "@/components/ui/lists/ReadingListsSection";
import { BookOpen, Bookmark, CheckCircle2 } from "lucide-react";
import type { ReadingList } from "@/app/actions/reading-lists";
import { EmptyState } from "@/components/ui/dashboard/primitives";
import {
  LIBRARY_TABS, parseLibraryTab, tabButtonId, writeLibraryTab, type LibraryTab,
} from "@/components/ui/dashboard/library-tab";

// Exactly what a card renders. This was a hand-copied `Book`: eleven fields
// the three shelves below never draw — including `summary` and a `pdfUrl` —
// serialised into the dashboard document once per book.
type BookItem = BookCardData;

interface Props {
  inProgressBooks:  BookItem[];
  completedBooks:   BookItem[];
  savedBooks:       BookItem[];
  readingLists:     ReadingList[];
  totalInProgress:  number;
  totalCompleted:   number;
  downloadCount:    number;
  /** Server-rendered (translated, relative times computed on the server). */
  downloadsPanel:   ReactNode;
}

// Two columns on a phone, and denser from there: this grid used to be
// `lg:grid-cols-2` inside a sidebar layout, so one in-progress book rendered
// as a ~400px-wide card taller than the viewport.
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5";

function GroupHeading({ icon, title, count, note }: { icon: ReactNode; title: string; count: number; note?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {icon}
      <h3 className="text-[14px] font-bold text-text-heading">{title}</h3>
      <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-bold tabular-nums text-text-muted dark:bg-paper/60">{count}</span>
      {note && <span className="text-[12px] text-text-muted">· {note}</span>}
    </div>
  );
}

export default function DashboardTabs({
  inProgressBooks, completedBooks, savedBooks, readingLists,
  totalInProgress, totalCompleted, downloadCount, downloadsPanel,
}: Props) {
  const t = useTranslations("dashboard");
  // The URL is the state (library-tab.ts). No useState: a tile elsewhere on
  // the page writes `?tab=` with replaceState and this re-renders from it.
  // The old lazy-initialised state read the parameter once, at mount, so the
  // Library Snapshot tiles never worked: clicking "Saved" re-rendered the
  // whole page on the server, changed the URL to `?tab=saved`, and left the
  // Reading panel showing (verified against the pre-redesign page).
  const tab = parseLibraryTab(useSearchParams().get("tab"));
  const tabRefs = useRef<Partial<Record<LibraryTab, HTMLButtonElement | null>>>({});

  const labels: Record<LibraryTab, string> = {
    reading:   t("tabReading"),
    saved:     t("tabSaved"),
    lists:     t("tabLists"),
    downloads: t("tabDownloads"),
  };

  const counts: Record<LibraryTab, number> = {
    reading:   totalInProgress + totalCompleted,
    saved:     savedBooks.length,
    lists:     readingLists.length,
    downloads: downloadCount,
  };

  const select = (id: LibraryTab, focus = false) => {
    writeLibraryTab(id);
    if (focus) tabRefs.current[id]?.focus();
  };

  // WAI-ARIA tabs, automatic activation: arrows move and select, Home/End jump.
  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    const i = LIBRARY_TABS.indexOf(tab);
    const n = LIBRARY_TABS.length;
    const next =
      e.key === "ArrowRight" ? LIBRARY_TABS[(i + 1) % n]
      : e.key === "ArrowLeft" ? LIBRARY_TABS[(i - 1 + n) % n]
      : e.key === "Home" ? LIBRARY_TABS[0]
      : e.key === "End" ? LIBRARY_TABS[n - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    select(next, true);
  };

  const shownNote = (shown: number, total: number) =>
    total > shown ? t("showingOf", { shown, total }) : undefined;

  return (
    <div>
      {/* Underline tabs. Scrolls sideways rather than wrapping when four
          labels (longer in Khmer) do not fit a phone. */}
      <div className="scroll-row -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label={t("tabsLabel")}
          onKeyDown={onTablistKeyDown}
          className="flex min-w-max gap-1 border-b border-divider sm:gap-2"
        >
          {LIBRARY_TABS.map((id) => {
            const active = tab === id;
            return (
              <button
                key={id}
                ref={(el) => { tabRefs.current[id] = el; }}
                type="button"
                role="tab"
                id={tabButtonId(id)}
                aria-selected={active}
                aria-controls={`dashboard-panel-${id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => select(id)}
                className={`relative -mb-px flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3 pb-3 pt-2 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring scroll-mt-28 ${
                  active
                    ? "border-brand text-brand"
                    : "border-transparent text-text-muted hover:border-divider hover:text-text-heading"
                }`}
              >
                {labels[id]}
                <span
                  className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums ${
                    active ? "bg-brand text-brand-contrast" : "bg-paper text-text-muted dark:bg-paper/60"
                  }`}
                >
                  {counts[id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Reading ── */}
      <div role="tabpanel" id="dashboard-panel-reading" aria-labelledby={tabButtonId("reading")} hidden={tab !== "reading"}>
        {inProgressBooks.length === 0 && completedBooks.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={t("noInProgressTitle")}
            description={t("noInProgressDesc")}
            action={{ href: "/books", label: t("browseCatalogue") }}
          />
        ) : (
          <div className="space-y-8">
            {inProgressBooks.length > 0 && (
              <div>
                <GroupHeading
                  icon={<BookOpen className="h-4 w-4 text-brand" aria-hidden="true" />}
                  title={t("statInProgressShort")}
                  count={totalInProgress}
                  note={shownNote(inProgressBooks.length, totalInProgress)}
                />
                <div className={GRID}>
                  {inProgressBooks.map((book) => (
                    <BookCard key={book.slug} book={book} variant="continue" />
                  ))}
                </div>
              </div>
            )}
            {completedBooks.length > 0 && (
              <div>
                <GroupHeading
                  icon={<CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />}
                  title={t("completedHeading")}
                  count={totalCompleted}
                  note={shownNote(completedBooks.length, totalCompleted)}
                />
                <div className={GRID}>
                  {completedBooks.map((book) => (
                    <BookCard key={book.slug} book={book} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Saved ── */}
      <div role="tabpanel" id="dashboard-panel-saved" aria-labelledby={tabButtonId("saved")} hidden={tab !== "saved"}>
        {savedBooks.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={t("noSavedTitle")}
            description={t("noSavedDesc")}
            action={{ href: "/books", label: t("browseCatalogue") }}
          />
        ) : (
          <div className={GRID}>
            {savedBooks.map((book) => (
              <BookCard key={book.slug} book={book} />
            ))}
          </div>
        )}
      </div>

      {/* ── Lists ── Always mounted: it holds the lists created on this page
          in local state, and unmounting it on a tab switch threw them away
          until the next full reload. */}
      <div role="tabpanel" id="dashboard-panel-lists" aria-labelledby={tabButtonId("lists")} hidden={tab !== "lists"}>
        <ReadingListsSection initialLists={readingLists} />
      </div>

      {/* ── Downloads ── */}
      <div role="tabpanel" id="dashboard-panel-downloads" aria-labelledby={tabButtonId("downloads")} hidden={tab !== "downloads"}>
        {downloadsPanel}
      </div>
    </div>
  );
}
