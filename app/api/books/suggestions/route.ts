/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy, isExpensiveSearchDisabled } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";

const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

function coverUrlOf(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`;
}

function getClientIP(req: NextRequest): string {
  // Prefer x-real-ip (set by the platform, unspoofable); the left-most
  // x-forwarded-for value is client-controlled and must not gate rate limits.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

export type Suggestion =
  | { type: "book";     slug: string; label: string; sub: string; coverUrl?: string | null }
  | { type: "author";   label: string }
  | { type: "category"; label: string }
  | { type: "research"; id: string; slug?: string | null; label: string; sub: string; coverUrl?: string | null }
  | { type: "publication"; slug: string; label: string; sub: string; coverUrl?: string | null }
  | { type: "catalog"; slug: string; label: string; sub: string; coverUrl?: string | null }
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

  // ── 1. Matching book titles (up to 4) ───────────────────────────────────────
  const { data: books } = await supabase
    .from("books")
    .select("slug, title, cover_url, authors ( name )")
    .eq("is_published", true)
    .ilike("title", `%${q}%`)
    .limit(4);

  for (const b of books ?? []) {
    results.push({
      type:  "book",
      slug:  b.slug,
      label: b.title,
      sub:   (b.authors as any)?.name ?? "Unknown",
      coverUrl: coverUrlOf(b.cover_url),
    });
  }

  // ── 2. Matching author names (up to 3) ───────────────────────────────────────
  const { data: authors } = await supabase
    .from("authors")
    .select("name")
    .ilike("name", `%${q}%`)
    .limit(3);

  for (const a of authors ?? []) {
    results.push({ type: "author", label: a.name });
  }

  // ── 3. Matching category names (up to 2) ────────────────────────────────────
  const { data: categories } = await supabase
    .from("categories")
    .select("name")
    .ilike("name", `%${q}%`)
    .limit(2);

  for (const c of categories ?? []) {
    results.push({ type: "category", label: c.name });
  }

  // ── 4. Matching published research report titles (up to 3) ───────────────────
  const { data: reports } = await supabase
    .from("research_reports")
    .select("id, slug, title, author_names, cohort, academic_year, cover_url")
    .eq("is_published", true)
    .ilike("title", `%${q}%`)
    .limit(3);

  for (const r of reports ?? []) {
    const cohortYear = [r.cohort ? `C${r.cohort}` : null, r.academic_year]
      .filter(Boolean)
      .join(" · ");
    const sub: string = (r.author_names as string | null) ?? (cohortYear || "Thesis");
    results.push({ type: "research", id: r.id, slug: r.slug ?? null, label: r.title, sub, coverUrl: coverUrlOf(r.cover_url) });
  }

  // ── 5. Matching publication titles in English or Khmer (up to 3) ────────────
  const { data: publications } = await supabase
    .from("publications_with_stats")
    .select("slug, title, title_km, author_names, journal_name, cover_url")
    .eq("is_published", true)
    .or(`title.ilike.%${q}%,title_km.ilike.%${q}%,author_names.ilike.%${q}%`)
    .limit(3);

  for (const p of publications ?? []) {
    results.push({
      type: "publication",
      slug: p.slug,
      label: p.title_km && p.title_km.includes(q) ? p.title_km : p.title,
      sub: (p.author_names as string | null) ?? p.journal_name ?? "Publication",
      coverUrl: coverUrlOf(p.cover_url),
    });
  }

  // ── 6. Matching physical catalog records (up to 2) ──────────────────────────
  const { data: catalog } = await supabase
    .from("catalog_books")
    .select("slug, title, author, category, cover_url")
    .eq("is_active", true)
    .or(`title.ilike.%${q}%,author.ilike.%${q}%,category.ilike.%${q}%`)
    .limit(2);

  for (const c of catalog ?? []) {
    results.push({
      type: "catalog",
      slug: c.slug,
      label: c.title,
      sub: c.author ?? c.category ?? "Physical book",
      coverUrl: coverUrlOf(c.cover_url),
    });
  }

  // ── 7. Matching news/posts (up to 2) ────────────────────────────────────────
  const { data: posts } = await supabase
    .from("posts")
    .select("slug, title, category, cover_url")
    .eq("is_published", true)
    .ilike("title", `%${q}%`)
    .limit(2);

  for (const p of posts ?? []) {
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
