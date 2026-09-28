/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy, isExpensiveSearchDisabled } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { clientIp } from "@/lib/client-ip";
import { withinBudget } from "@/lib/search/budgets";

/** Per-lookup ceiling: a suggestion that arrives later than this is no longer useful. */
const SUGGEST_LEG_BUDGET_MS = 2_500;

const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

function coverUrlOf(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`;
}

function getClientIP(req: NextRequest): string {
  return clientIp(req.headers);
}

export type Suggestion =
  | { type: "book";     slug: string; label: string; sub: string; coverUrl?: string | null }
  | { type: "author";   label: string }
  | { type: "category"; label: string }
  | { type: "research"; id: string; slug?: string | null; label: string; sub: string; coverUrl?: string | null }
  | { type: "publication"; slug: string; label: string; sub: string; coverUrl?: string | null }
  | { type: "catalog"; slug: string; label: string; sub: string; coverUrl?: string | null }
  | { type: "learning_path"; slug: string; label: string; sub: string; coverUrl?: string | null }
  | { type: "post"; slug: string; label: string; sub: string; coverUrl?: string | null };

export async function GET(req: NextRequest) {
  // Emergency mode: autocomplete is a nice-to-have that fires on every
  // keystroke — shed it first. The search page itself keeps working.
  if (isExpensiveSearchDisabled()) return NextResponse.json([]);

  const ip = getClientIP(req);
  const { limit: rlLimit, windowMs } = ratePolicy("suggestions");
  const limit = await rateLimit(ip, rlLimit, windowMs);

  if (!limit.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/books/suggestions", ip });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawQ = req.nextUrl.searchParams.get("q")?.trim();
  if (!rawQ || rawQ.length < 2) return NextResponse.json([]);
  if (rawQ.length > 100) return NextResponse.json([]);
  // Strip ILIKE wildcards (%/_) along with punctuation — user input must not
  // be able to inject expensive pattern matches into the four queries below.
  const q = rawQ.replace(/[(),.\\%_]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return NextResponse.json([]);

  const supabase = await createClient();
  const results: Suggestion[] = [];

  // All eight lookups at once, each inside its own budget. They used to run
  // one after another — eight round trips before the first suggestion could
  // show — and one slow table held the rest. A suggestion list is a
  // nice-to-have: a lookup that fails or runs late simply contributes nothing.
  const settle = <T,>(query: PromiseLike<{ data: T[] | null }>): Promise<T[]> =>
    withinBudget(Promise.resolve(query).then((r) => r.data ?? []), SUGGEST_LEG_BUDGET_MS, [] as T[]).then((o) => o.value);

  const [books, authors, categories, reports, publications, catalog, paths, posts] = await Promise.all([
    // ── 1. Matching book titles (up to 4)
    settle<any>(supabase.from("books").select("slug, title, cover_url, authors ( name )").eq("is_published", true).ilike("title", `%${q}%`).limit(4)),
    // ── 2. Matching author names (up to 3)
    settle<any>(supabase.from("authors").select("name").ilike("name", `%${q}%`).limit(3)),
    // ── 3. Matching category names (up to 2)
    settle<any>(supabase.from("categories").select("name").ilike("name", `%${q}%`).limit(2)),
    // ── 4. Matching published research report titles (up to 3)
    settle<any>(
      supabase
        .from("research_reports")
        .select("id, slug, title, author_names, cohort, academic_year, cover_url")
        .eq("is_published", true)
        .ilike("title", `%${q}%`)
        .limit(3),
    ),
    // ── 5. Matching publication titles in English or Khmer (up to 3)
    settle<any>(
      supabase
        .from("publications_with_stats")
        .select("slug, title, title_km, author_names, journal_name, cover_url")
        .eq("is_published", true)
        .or(`title.ilike.%${q}%,title_km.ilike.%${q}%,author_names.ilike.%${q}%`)
        .limit(3),
    ),
    // ── 6. Matching physical catalog records (up to 2)
    settle<any>(
      supabase
        .from("catalog_books")
        .select("slug, title, author, category, ddc, cover_url")
        .eq("is_active", true)
        .or(`title.ilike.%${q}%,author.ilike.%${q}%,category.ilike.%${q}%`)
        .limit(2),
    ),
    // ── 7. Matching learning paths in English or Khmer (up to 2)
    settle<any>(
      supabase
        .from("learning_paths")
        .select("slug, title, title_km, audience")
        .eq("is_published", true)
        .or(`title.ilike.%${q}%,title_km.ilike.%${q}%,description.ilike.%${q}%,audience.ilike.%${q}%`)
        .limit(2),
    ),
    // ── 8. Matching news/posts (up to 2)
    settle<any>(supabase.from("posts").select("slug, title, category, cover_url").eq("is_published", true).ilike("title", `%${q}%`).limit(2)),
  ]);

  for (const b of books) {
    results.push({
      type:  "book",
      slug:  b.slug,
      label: b.title,
      sub:   (b.authors as any)?.name ?? "Unknown",
      coverUrl: coverUrlOf(b.cover_url),
    });
  }
  for (const a of authors) results.push({ type: "author", label: a.name });
  for (const c of categories) results.push({ type: "category", label: c.name });
  for (const r of reports) {
    const cohortYear = [r.cohort ? `C${r.cohort}` : null, r.academic_year]
      .filter(Boolean)
      .join(" · ");
    const sub: string = (r.author_names as string | null) ?? (cohortYear || "Thesis");
    results.push({ type: "research", id: r.id, slug: r.slug ?? null, label: r.title, sub, coverUrl: coverUrlOf(r.cover_url) });
  }
  for (const p of publications) {
    results.push({
      type: "publication",
      slug: p.slug,
      label: p.title_km && p.title_km.includes(q) ? p.title_km : p.title,
      sub: (p.author_names as string | null) ?? p.journal_name ?? "Publication",
      coverUrl: coverUrlOf(p.cover_url),
    });
  }
  for (const c of catalog) {
    results.push({
      type: "catalog",
      slug: c.slug,
      label: c.title,
      // The call number is how a reader finds a print book on the shelf.
      sub: [c.author, c.ddc].filter(Boolean).join(" · ") || c.category || "Physical book",
      coverUrl: coverUrlOf(c.cover_url),
    });
  }
  for (const p of paths) {
    results.push({
      type: "learning_path",
      slug: p.slug,
      label: p.title_km && p.title_km.includes(q) ? p.title_km : p.title,
      sub: (p.audience as string | null) ?? "Learning Path",
      coverUrl: null,
    });
  }
  for (const p of posts) {
    results.push({
      type: "post",
      slug: p.slug,
      label: p.title,
      sub: p.category ?? "News",
      coverUrl: coverUrlOf(p.cover_url),
    });
  }
  return NextResponse.json(results);
}
