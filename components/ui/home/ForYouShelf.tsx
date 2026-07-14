// components/ui/home/ForYouShelf.tsx
// The public "Popular with PTEC students" shelf.
//
// This component used to decide, server-side, between this shelf and a
// personalised "Continue reading" one — which meant reading the auth cookie on
// every homepage render, and that single read made /home dynamic for every
// visitor, anonymous ones included. The personalised branch now lives in
// <ContinueReadingSwap> (client) and swaps this shelf out after hydration for
// the few users who have reading in progress. Everything here is public data,
// so it prerenders and is served from the CDN.
//
// Keep it that way: no cookies(), no auth, no per-user tables in this file.
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { getMostViewedBooksCached } from "@/lib/home-data";
import type { ComponentProps } from "react";
import BookCard from "@/components/ui/books/BookCard";
import BookCarousel from "./BookCarousel";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { ArrowRight } from "lucide-react";
import SignedOutOnly from "./SignedOutOnly";

type BookCardData = ComponentProps<typeof BookCard>["book"];

export default async function ForYouShelf({ popularBooks }: { popularBooks: BookCardData[] }) {
  const t = await getTranslations("home");

  // ── Contextual onboarding: popular with students ──
  // Ranked by views, a different signal from the download-ranked hero stack and
  // Browse "Trending" tab, so the same titles aren't shown three times. Falls
  // back to the passed trending set if the view-ranked query is empty.
  const viewed = await getMostViewedBooksCached();
  const shelf = (viewed.length > 0 ? (viewed as BookCardData[]) : popularBooks).slice(0, 6);
  if (shelf.length === 0) return null;

  return (
    <section className="border-b border-divider bg-bg-surface" aria-labelledby="popular-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <span className="mb-2 inline-flex items-center gap-2 text-[12px] font-bold text-brand">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m3 17 6-6 4 4 8-8" /><path d="M21 7h-6m6 0v6" />
              </svg>
              {t("popularEyebrow")}
            </span>
            <SectionTitle as="h2" id="popular-title" className="!mb-0">{t("popularTitle")}</SectionTitle>
          </div>
          <Link href="/books?sort=downloads" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-gold-700 sm:inline-flex">
            {t("popularViewAll")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <BookCarousel aria-label={t("popularTitle")}>
          {shelf.map((book) => (
            <BookCard key={book.slug} book={book} />
          ))}
        </BookCarousel>

        {/* Onboarding line + sign-in — anonymous visitors only. Hidden after
            hydration rather than server-side, so this page stays prerenderable.
            Auth routes are not locale-prefixed, so this uses a plain next/link. */}
        <SignedOutOnly>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <p className="text-[13.5px] text-text-muted">{t("popularOnboarding")}</p>
            <NextLink
              href="/auth/login"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/[0.06] px-4 py-2 text-[13px] font-semibold text-brand transition-colors hover:border-brand hover:bg-brand hover:text-brand-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {t("popularSignIn")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </NextLink>
          </div>
        </SignedOutOnly>
      </div>
    </section>
  );
}
