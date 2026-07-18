"use client";

import { useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import BookCard from "@/components/ui/books/BookCard";
import ReadingListsSection from "@/components/ui/lists/ReadingListsSection";
import { BookOpen, Bookmark, BookMarked, CheckCircle2 } from "lucide-react";
import type { ReadingList } from "@/app/actions/reading-lists";

type BookItem = {
  slug: string;
  title: string;
  author: string;
  department: string;
  category: string;
  language: string;
  year: number;
  format: "PDF" | "Print" | "Audio" | "Video";
  availability: "Available" | "Borrowed" | "Digital";
  rating: number;
  pages: number;
  summary: string;
  cover: string;
  coverUrl?: string | null;
  pdfUrl?: string | null;
  isbn: string;
  tags: string[];
  dbId?: string | null;
  progressPct?: number;
  downloadCount?: number;
  viewCount?: number;
  reviewCount?: number;
  createdAt?: string;
};

interface Props {
  inProgressBooks:  BookItem[];
  completedBooks:   BookItem[];
  savedBooks:       BookItem[];
  readingLists:     ReadingList[];
  totalInProgress:  number;
  totalCompleted:   number;
}

type TabId = "reading" | "saved" | "lists";

const TAB_IDS: TabId[] = ["reading", "saved", "lists"];

const TAB_ICONS: Record<TabId, React.ReactNode> = {
  reading: <BookOpen   className="h-4 w-4" aria-hidden="true" />,
  saved:   <Bookmark   className="h-4 w-4" aria-hidden="true" />,
  lists:   <BookMarked className="h-4 w-4" aria-hidden="true" />,
};

function EmptyState({
  icon, title, desc, href, label,
}: { icon: React.ReactNode; title: string; desc: string; href: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface py-14 text-center px-6">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8 text-brand" aria-hidden="true">
        {icon}
      </div>
      <p className="text-[14px] font-semibold text-text-heading">{title}</p>
      <p className="mt-1 max-w-xs text-[12.5px] text-text-muted">{desc}</p>
      <Link href={href}
        className="mt-5 inline-flex h-9 items-center rounded-xl bg-brand px-5 text-[13px] font-semibold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        {label}
      </Link>
    </div>
  );
}

export default function DashboardTabs({
  inProgressBooks, completedBooks, savedBooks, readingLists,
  totalInProgress, totalCompleted,
}: Props) {
  const t = useTranslations("dashboard");
  const [tab, setTab] = useState<TabId>("reading");
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const labels: Record<TabId, string> = {
    reading: t("tabReading"),
    saved:   t("tabSaved"),
    lists:   t("tabLists"),
  };

  const counts: Record<TabId, number> = {
    reading: totalInProgress + totalCompleted,
    saved:   savedBooks.length,
    lists:   readingLists.length,
  };

  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = TAB_IDS[(TAB_IDS.indexOf(tab) + dir + TAB_IDS.length) % TAB_IDS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        onKeyDown={onTablistKeyDown}
        className="mb-6 flex items-center gap-1 rounded-2xl border border-divider bg-bg-surface p-1.5 shadow-sm"
      >
        {TAB_IDS.map((id) => (
          <button
            key={id}
            ref={(el) => { tabRefs.current[id] = el; }}
            type="button"
            role="tab"
            id={`dashboard-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`dashboard-panel-${id}`}
            aria-label={labels[id]}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              tab === id
                ? "bg-brand text-brand-contrast shadow-sm"
                : "text-text-muted hover:bg-paper hover:text-text-body"
            }`}
          >
            {TAB_ICONS[id]}
            <span className="hidden sm:inline">{labels[id]}</span>
            {counts[id] > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                tab === id ? "bg-brand-contrast/20 text-brand-contrast" : "bg-brand/10 text-brand"
              }`}>
                {counts[id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Reading tab ── */}
      <div role="tabpanel" id="dashboard-panel-reading" aria-labelledby="dashboard-tab-reading" hidden={tab !== "reading"}>
        <div className="space-y-8">
          {/* Continue Reading */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10" aria-hidden="true">
                <BookOpen className="h-4 w-4 text-brand" />
              </div>
              <h3 className="font-khmer-serif text-[17px] font-bold text-text-heading">
                {t("continueReading")}
              </h3>
              {inProgressBooks.length > 0 && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand tabular-nums">
                  {inProgressBooks.length}
                </span>
              )}
            </div>
            {inProgressBooks.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title={t("noInProgressTitle")}
                desc={t("noInProgressDesc")}
                href="/books"
                label={t("browseCatalogue")}
              />
            ) : (
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {inProgressBooks.map((book) => (
                  <BookCard key={book.slug} book={book} variant="continue" />
                ))}
              </div>
            )}
          </div>

          {/* Completed */}
          {completedBooks.length > 0 && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30" aria-hidden="true">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <h3 className="font-khmer-serif text-[17px] font-bold text-text-heading">
                  {t("completedHeading")}
                </h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 tabular-nums">
                  {completedBooks.length}
                </span>
              </div>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {completedBooks.map((book) => (
                  <BookCard key={book.slug} book={book} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Saved tab ── */}
      <div role="tabpanel" id="dashboard-panel-saved" aria-labelledby="dashboard-tab-saved" hidden={tab !== "saved"}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10" aria-hidden="true">
              <Bookmark className="h-4 w-4 text-accent" />
            </div>
            <h3 className="font-khmer-serif text-[17px] font-bold text-text-heading">{t("savedHeading")}</h3>
          </div>
          {savedBooks.length > 0 && (
            <Link href="/books" className="text-[13px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded">
              {t("browseMore")} →
            </Link>
          )}
        </div>
        {savedBooks.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="h-6 w-6" />}
            title={t("noSavedTitle")}
            desc={t("noSavedDesc")}
            href="/books"
            label={t("browseCatalogue")}
          />
        ) : (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {savedBooks.map((book) => (
              <BookCard
                key={book.slug}
                book={{ ...book, format: (book.format ?? "PDF") as "PDF" | "Print" | "Audio" | "Video" }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Lists tab ── */}
      <div role="tabpanel" id="dashboard-panel-lists" aria-labelledby="dashboard-tab-lists" hidden={tab !== "lists"}>
        {tab === "lists" && <ReadingListsSection initialLists={readingLists} />}
      </div>
    </div>
  );
}
