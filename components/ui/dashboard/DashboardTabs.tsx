"use client";

import { useState } from "react";
import Link from "next/link";
import BookCard from "@/components/ui/books/BookCard";
import ReadingListsSection from "@/components/ui/lists/ReadingListsSection";
import { BookOpen, Bookmark, BookMarked, CheckCircle2, Library } from "lucide-react";
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
  browseLabel:      string;
  browseMoreLabel:  string;
  totalInProgress:  number;
  totalCompleted:   number;
}

type TabId = "reading" | "saved" | "lists";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "reading", label: "Reading",      icon: <BookOpen    className="h-4 w-4" /> },
  { id: "saved",   label: "Saved Books",  icon: <Bookmark    className="h-4 w-4" /> },
  { id: "lists",   label: "My Lists",     icon: <BookMarked  className="h-4 w-4" /> },
];

function EmptyState({
  icon, title, desc, href, label,
}: { icon: React.ReactNode; title: string; desc: string; href: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface py-14 text-center px-6">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8 text-brand">
        {icon}
      </div>
      <p className="text-[14px] font-semibold text-text-heading">{title}</p>
      <p className="mt-1 max-w-xs text-[12.5px] text-text-muted">{desc}</p>
      <Link href={href}
        className="mt-5 inline-flex h-9 items-center rounded-xl bg-brand px-5 text-[13px] font-semibold text-white transition hover:bg-brand-hover">
        {label}
      </Link>
    </div>
  );
}

export default function DashboardTabs({
  inProgressBooks, completedBooks, savedBooks, readingLists,
  browseLabel, browseMoreLabel, totalInProgress, totalCompleted,
}: Props) {
  const [tab, setTab] = useState<TabId>("reading");

  const counts: Record<TabId, number> = {
    reading: totalInProgress + totalCompleted,
    saved:   savedBooks.length,
    lists:   readingLists.length,
  };

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 flex items-center gap-1 rounded-2xl border border-divider bg-bg-surface p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all duration-150 ${
              tab === t.id
                ? "bg-brand text-white shadow-sm"
                : "text-text-muted hover:bg-paper hover:text-text-body"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            {counts[t.id] > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.id ? "bg-white/20 text-white" : "bg-brand/10 text-brand"
              }`}>
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Reading tab ── */}
      {tab === "reading" && (
        <div className="space-y-8">
          {/* Continue Reading */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10">
                <BookOpen className="h-4 w-4 text-brand" />
              </div>
              <h3 className="font-khmer-serif text-[17px] font-bold text-text-heading">
                Continue Reading
              </h3>
              {inProgressBooks.length > 0 && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                  {inProgressBooks.length}
                </span>
              )}
            </div>
            {inProgressBooks.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title="Nothing in progress"
                desc="Open a book and start reading to track your progress here."
                href="/books"
                label={browseLabel}
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
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <h3 className="font-khmer-serif text-[17px] font-bold text-text-heading">
                  Completed
                </h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
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

          {inProgressBooks.length === 0 && completedBooks.length === 0 && null}
        </div>
      )}

      {/* ── Saved tab ── */}
      {tab === "saved" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                <Bookmark className="h-4 w-4 text-accent" />
              </div>
              <h3 className="font-khmer-serif text-[17px] font-bold text-text-heading">Saved Books</h3>
            </div>
            {savedBooks.length > 0 && (
              <Link href="/books" className="text-[13px] font-semibold text-brand hover:underline">
                {browseMoreLabel} →
              </Link>
            )}
          </div>
          {savedBooks.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="h-6 w-6" />}
              title="No saved books yet"
              desc="Tap the bookmark icon on any book to save it for later."
              href="/books"
              label={browseLabel}
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
      )}

      {/* ── Lists tab ── */}
      {tab === "lists" && (
        <ReadingListsSection initialLists={readingLists} />
      )}
    </div>
  );
}
