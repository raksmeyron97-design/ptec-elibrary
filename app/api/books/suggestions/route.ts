/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { rateLimit } from "@/lib/rate-limit";

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
  | { type: "research"; id: string;   label: string; sub: string; coverUrl?: string | null };

export async function GET(req: NextRequest) {
  // Rate limiting check (60 requests per minute)
  const ip = getClientIP(req);
  const limit = rateLimit(ip, 60, 60000);
  
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawQ = req.nextUrl.searchParams.get("q")?.trim();
  if (!rawQ || rawQ.length < 2) return NextResponse.json([]);
  const q = rawQ.replace(/[(),.\\]/g, " ").replace(/\s+/g, " ").trim();

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
    .select("id, title, author_names, cohort, academic_year, cover_url")
    .eq("is_published", true)
    .ilike("title", `%${q}%`)
    .limit(3);

  for (const r of reports ?? []) {
    const cohortYear = [r.cohort ? `C${r.cohort}` : null, r.academic_year]
      .filter(Boolean)
      .join(" · ");
    const sub: string = (r.author_names as string | null) ?? (cohortYear || "Research Report");
    results.push({ type: "research", id: r.id, label: r.title, sub, coverUrl: coverUrlOf(r.cover_url) });
  }

  return NextResponse.json(results);
}