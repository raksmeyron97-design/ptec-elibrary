"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import BookCard from "@/components/ui/books/BookCard";
import BookCarousel from "./BookCarousel";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { useSession } from "@/components/providers/SessionProvider";

type BookCardData = ComponentProps<typeof BookCard>["book"];
type ContinueBook = BookCardData & { lastReadAt?: string | null };

/**
 * Swaps the public "Popular with PTEC students" shelf for a personalised
 * "Continue reading" shelf, for the signed-in minority who have one.
 *
 * `children` is the public shelf, rendered on the server and baked into the
 * prerendered HTML — so anonymous visitors (and crawlers) get the real content
 * with no JavaScript and no request to this component's API. Deciding this
 * server-side is what used to make /home dynamic for everyone.
 */
export default function ContinueReadingSwap({ children }: { children: ReactNode }) {
  const t = useTranslations("home");
  const { user, loading } = useSession();
  const [books, setBooks] = useState<ContinueBook[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setBooks([]);
      return;
    }
    let active = true;
    fetch("/api/me/continue-reading", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { books: [] }))
      .then((data: { books: ContinueBook[] }) => {
        if (active) setBooks(data.books ?? []);
      })
      .catch(() => {
        // A failed personalisation fetch must never blank the shelf — fall
        // through to the public one.
        if (active) setBooks([]);
      });
    return () => {
      active = false;
    };
  }, [user, loading]);

  if (!books || books.length === 0) return <>{children}</>;

  const topPct = Math.max(...books.map((b) => b.progressPct ?? 0));

  return (
    <section
      className="relative isolate overflow-hidden border-b border-divider bg-bg-surface"
      aria-labelledby="foryou-title"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(640px_320px_at_8%_-20%,rgba(34,211,238,0.06),transparent_60%)]"
      />
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
        <div className="mb-7 flex items-end justify-between gap-5">
          <div className="min-w-0">
            <span className="mb-2 inline-flex items-center gap-2 text-[12px] font-bold text-cyan-700 dark:text-cyan-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path
                  d="M12 2l1.8 5.4L19.2 9l-5.4 1.8L12 16.2l-1.8-5.4L4.8 9l5.4-1.8L12 2z"
                  opacity={0.85}
                />
              </svg>
              {t("forYou")}
            </span>
            <SectionTitle as="h2" id="foryou-title" className="!mb-0">
              {t("continueReading")}
            </SectionTitle>
          </div>
          <Link
            href="/dashboard#in-progress"
            className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-gold-700 sm:inline-flex"
          >
            {t("myShelf")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <BookCarousel aria-label={t("continueReading")}>
          {books.map((book) => (
            <BookCard key={book.slug} book={book} variant="continue" />
          ))}
        </BookCarousel>

        <div className="mt-6 sm:hidden">
          <Link
            href="/dashboard#in-progress"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand"
          >
            {t("myShelf")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <span className="sr-only">
          {books.length} in progress, up to {topPct}% complete.
        </span>
      </div>
    </section>
  );
}
