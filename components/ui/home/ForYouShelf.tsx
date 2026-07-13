// components/ui/home/ForYouShelf.tsx
// The personalized/contextual shelf that replaces the old always-anonymous
// homepage. Two states, decided server-side per request:
//   • Signed-in with in-progress reading → "Continue reading" (private, RLS-safe
//     via the service client scoped to the authenticated user's own rows).
//   • Anonymous, or signed-in with no activity → "Popular with PTEC students",
//     a well-designed onboarding shelf built from public trending data.
// Never leaks one user's history to another: the personalized branch only runs
// for the resolved auth user, and the public branch reads no per-user data.
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMostViewedBooksCached } from "@/lib/home-data";
import type { ComponentProps } from "react";
import BookCard from "@/components/ui/books/BookCard";
import BookCarousel from "./BookCarousel";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { ArrowRight } from "lucide-react";

type BookCardData = ComponentProps<typeof BookCard>["book"];
type ContinueBook = BookCardData & { lastReadAt?: string | null };

async function getContinueReading(userId: string): Promise<ContinueBook[]> {
  const db = createServiceClient();
  const { data: progress } = await db
    .from("reading_progress")
    .select("book_id, progress_pct, last_read_at")
    .eq("user_id", userId)
    .gt("progress_pct", 0)
    .lt("progress_pct", 100)
    .order("last_read_at", { ascending: false })
    .limit(10);

  const rows = progress ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.book_id);
  const { data: booksData } = await db
    .from("books")
    .select(`id, title, slug, description, cover_url, cover_color,
      department, language, pages, rating, download_count, view_count,
      authors ( name ), categories ( name ), book_files ( format, file_url )`)
    .in("id", ids);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map((booksData ?? []).map((b: any) => [b.id, b]));

  return rows.flatMap((r): ContinueBook[] => {
    const b = byId.get(r.book_id);
    if (!b) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfFile = b.book_files?.find((f: any) => f.format === "pdf");
    return [
      {
        slug: b.slug,
        title: b.title,
        author: b.authors?.name ?? "Unknown",
        isbn: "N/A",
        department: b.department ?? "General",
        category: b.categories?.name ?? "General",
        language: b.language ?? "English",
        year: new Date().getFullYear(),
        format: "PDF" as const,
        availability: "Digital" as const,
        rating: Number(b.rating) || 0,
        pages: b.pages ?? 1,
        summary: b.description ?? "",
        cover: b.cover_color ?? "bg-brand",
        coverUrl: b.cover_url ?? null,
        pdfUrl: pdfFile?.file_url ?? null,
        tags: [],
        progressPct: r.progress_pct,
        downloadCount: b.download_count ?? 0,
        viewCount: b.view_count ?? 0,
        dbId: b.id,
        lastReadAt: r.last_read_at,
      } as ContinueBook,
    ];
  });
}

export default async function ForYouShelf({ popularBooks }: { popularBooks: BookCardData[] }) {
  const supabase = await createClient();
  const [t, { data: { user } }] = await Promise.all([
    getTranslations("home"),
    supabase.auth.getUser(),
  ]);

  const inProgress = user ? await getContinueReading(user.id) : [];

  // ── Personalized: continue reading ──
  if (inProgress.length > 0) {
    const topPct = Math.max(...inProgress.map((b) => b.progressPct ?? 0));
    return (
      <section className="relative isolate overflow-hidden border-b border-divider bg-bg-surface" aria-labelledby="foryou-title">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(640px_320px_at_8%_-20%,rgba(34,211,238,0.06),transparent_60%)]" />
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
          <div className="mb-7 flex items-end justify-between gap-5">
            <div className="min-w-0">
              <span className="mb-2 inline-flex items-center gap-2 text-[12px] font-bold text-cyan-700 dark:text-cyan-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l1.8 5.4L19.2 9l-5.4 1.8L12 16.2l-1.8-5.4L4.8 9l5.4-1.8L12 2z" opacity={0.85} />
                </svg>
                {t("forYou")}
              </span>
              <SectionTitle as="h2" id="foryou-title" className="!mb-0">{t("continueReading")}</SectionTitle>
            </div>
            <Link href="/dashboard#in-progress" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-gold-700 sm:inline-flex">
              {t("myShelf")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <BookCarousel aria-label={t("continueReading")}>
            {inProgress.map((book) => (
              <BookCard key={book.slug} book={book} variant="continue" />
            ))}
          </BookCarousel>

          <div className="mt-6 sm:hidden">
            <Link href="/dashboard#in-progress" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
              {t("myShelf")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <span className="sr-only">
            {inProgress.length} in progress, up to {topPct}% complete.
          </span>
        </div>
      </section>
    );
  }

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

        {/* Onboarding line + sign-in — anonymous visitors only. Auth routes are
            not locale-prefixed, so this uses a plain next/link. */}
        {!user && (
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
        )}
      </div>
    </section>
  );
}
