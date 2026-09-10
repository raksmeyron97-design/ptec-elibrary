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
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { getMostViewedBooksCached } from "@/lib/home-data";
import type { ComponentProps } from "react";
import BookCard from "@/components/ui/books/BookCard";
import BookCarousel from "./BookCarousel";
import { ArrowRight } from "lucide-react";
import SignedOutOnly from "./SignedOutOnly";
import { HomeSection, SectionHeader, SectionMobileLink } from "./HomeSection";

type BookCardData = ComponentProps<typeof BookCard>["book"];

// "See all" — a signpost, not a committed destination. It points at the same
// /books?sort=downloads route as the hero's mobile strip, whose RSC payload is
// a MEASURED 52.2 KB compressed, spent on a maybe-click.
const VIEW_ALL = { href: "/books?sort=downloads", prefetch: false } as const;

export default async function ForYouShelf({ popularBooks }: { popularBooks: BookCardData[] }) {
  const t = await getTranslations("home");

  // ── Contextual onboarding: popular with students ──
  // Ranked by views, a different signal from the download-ranked hero stack,
  // so the same titles aren't shown twice. Falls back to the passed trending
  // set if the view-ranked query is empty.
  const viewed = await getMostViewedBooksCached();
  const shelf = (viewed.length > 0 ? (viewed as BookCardData[]) : popularBooks).slice(0, 6);
  if (shelf.length === 0) return null;

  return (
    <HomeSection surface="surface" labelledBy="popular-title">
      <SectionHeader
        id="popular-title"
        eyebrow={t("popularEyebrow")}
        title={t("popularTitle")}
        action={{ ...VIEW_ALL, label: t("popularViewAll") }}
      />

      <BookCarousel aria-label={t("popularTitle")} edgeClassName="from-bg-surface">
        {shelf.map((book) => (
          <BookCard key={book.slug} book={book} />
        ))}
      </BookCarousel>

      <SectionMobileLink {...VIEW_ALL} label={t("popularViewAll")} />

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
    </HomeSection>
  );
}
