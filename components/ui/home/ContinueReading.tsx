// components/ui/ContinueReading.tsx
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import BookCard from "@/components/ui/BookCard";
import BookCarousel from "./BookCarousel";
import { SectionTitle } from "@/components/ui/SectionTitle";

type ContinueBook = React.ComponentProps<typeof BookCard>["book"] & { lastReadAt?: string | null };

/**
 * Fetches the signed-in user's in-progress books (1–99%), most recently read first.
 * Returns [] for logged-out users or when nothing is in progress.
 * Mirrors the dashboard's reading_progress query pattern.
 */
async function getContinueReading(): Promise<ContinueBook[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();
  const { data: progress } = await db
    .from("reading_progress")
    .select("book_id, progress_pct, last_read_at")
    .eq("user_id", user.id)
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

  const byId = new Map((booksData ?? []).map((b: any) => [b.id, b]));

  // Keep the last_read_at ordering (the .in() query does not preserve it).
  return rows.flatMap((r): ContinueBook[] => {
    const b = byId.get(r.book_id);
    if (!b) return [];
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
        cover: b.cover_color ?? "bg-blue-950",
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

export default async function ContinueReading() {
  const books = await getContinueReading();
  if (books.length === 0) return null;

  // The single closest-to-done title, used in the eyebrow line.
  const topPct = Math.max(...books.map((b) => b.progressPct ?? 0));

  return (
    <section className="relative isolate overflow-hidden border-b border-divider bg-bg-surface">
      {/* subtle brand wash so the personalized band reads as "yours" */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(640px_320px_at_8%_-20%,rgba(var(--brand-rgb,29_78_216)/0.05),transparent_60%)]" />

      <div className="mx-auto max-w-[1400px] px-4 py-14 md:px-12 md:py-16">
        <div className="mb-7 flex items-end justify-between gap-5">
          <div className="min-w-0">
            <span className="mb-2 inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-brand">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Welcome back
            </span>
            <SectionTitle as="h2" className="!mb-0">Continue Reading</SectionTitle>
          </div>

          <Link
            href="/dashboard#in-progress"
            className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-gold-700 sm:inline-flex"
          >
            My shelf
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        <BookCarousel aria-label="Continue reading">
          {books.map((book) => (
            <BookCard key={book.slug} book={book} />
          ))}
        </BookCarousel>

        {/* mobile shelf link */}
        <div className="mt-6 sm:hidden">
          <Link href="/dashboard#in-progress" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
            Go to my shelf
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* keeps `topPct` meaningful for screen readers / future copy */}
        <span className="sr-only">You have {books.length} book{books.length > 1 ? "s" : ""} in progress, up to {topPct}% complete.</span>
      </div>
    </section>
  );
}