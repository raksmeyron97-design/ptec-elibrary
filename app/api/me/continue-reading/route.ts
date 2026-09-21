import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { toBookCardData } from "@/lib/books/card-data";

export const dynamic = "force-dynamic";

/**
 * The signed-in viewer's in-progress books, for the homepage "Continue reading"
 * shelf.
 *
 * WHY THIS EXISTS. This shelf used to be resolved server-side inside a Suspense
 * boundary on /home. Suspense does not help here: without PPR, a cookie read
 * *anywhere* in the tree makes the whole route dynamic, so this one shelf cost
 * every anonymous visitor a function invocation for a homepage that is byte-for-
 * byte identical for all of them. It now loads client-side, and /home is
 * prerendered.
 *
 * SECURITY. The user id comes from a verified session (getSessionUser →
 * supabase.auth.getUser()), never from a request parameter, so a caller cannot
 * ask for someone else's history. The service client is used only *after* that
 * check and only with `.eq("user_id", user.id)` — same scoping the server
 * component had. `private, no-store` keeps this out of any shared cache.
 */
export async function GET() {
  const noStore = { "Cache-Control": "private, no-store, max-age=0" };

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ books: [] }, { headers: noStore });

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
  if (rows.length === 0) return NextResponse.json({ books: [] }, { headers: noStore });

  const { data: booksData } = await db
    .from("books")
    .select(
      `id, title, slug, cover_url, cover_color,
      department, rating, download_count, view_count,
      authors ( name ), categories ( name )`,
    )
    .in(
      "id",
      rows.map((r) => r.book_id),
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map((booksData ?? []).map((b: any) => [b.id, b]));

  // Exactly what a book card renders — the same narrowing the server shelves
  // apply. This response used to carry a whole `Book` per row: isbn "N/A", a
  // fabricated `year`, the full description, a pdfUrl the card never draws.
  const books = rows.flatMap((r) => {
    const b = byId.get(r.book_id);
    if (!b) return [];
    return [
      toBookCardData({
        slug: b.slug,
        title: b.title,
        author: b.authors?.name ?? "Unknown",
        department: b.department ?? "General",
        category: b.categories?.name ?? "General",
        rating: Number(b.rating) || 0,
        cover: b.cover_color ?? "bg-brand",
        coverUrl: b.cover_url ?? null,
        progressPct: r.progress_pct,
        downloadCount: b.download_count ?? 0,
        viewCount: b.view_count ?? 0,
        dbId: b.id,
        lastReadAt: r.last_read_at,
      }),
    ];
  });

  return NextResponse.json({ books }, { headers: noStore });
}
