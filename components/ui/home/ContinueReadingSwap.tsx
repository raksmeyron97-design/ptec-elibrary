"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import BookCard from "@/components/ui/books/BookCard";
import BookCarousel from "./BookCarousel";
import { useSession } from "@/components/providers/SessionProvider";
import { HomeSection, SectionHeader, SectionMobileLink } from "./HomeSection";

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
 *
 * It takes the SAME shell and header as the shelf it replaces, so the swap
 * changes the books and the title — not the band's size, colour or rhythm.
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
  const shelfLink = { href: "/dashboard#in-progress", label: t("myShelf") };

  return (
    <HomeSection surface="surface" labelledBy="foryou-title">
      <SectionHeader
        id="foryou-title"
        eyebrow={t("forYou")}
        title={t("continueReading")}
        action={shelfLink}
      />

      <BookCarousel aria-label={t("continueReading")} edgeClassName="from-bg-surface">
        {books.map((book) => (
          <BookCard key={book.slug} book={book} variant="continue" />
        ))}
      </BookCarousel>

      <SectionMobileLink {...shelfLink} />
      <span className="sr-only">
        {books.length} in progress, up to {topPct}% complete.
      </span>
    </HomeSection>
  );
}
