import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// In-memory rate limiting
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const MAX_REQUESTS_PER_MINUTE = 60;
const CLEANUP_THRESHOLD = 1000;

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export type Suggestion =
  | { type: "book";     slug: string; label: string; sub: string }
  | { type: "author";   label: string }
  | { type: "category"; label: string };

export async function GET(req: NextRequest) {
  // Rate limiting check
  const ip = getClientIP(req);
  const now = Date.now();
  
  // Prevent memory leaks on long-running edge nodes
  if (rateLimitMap.size > CLEANUP_THRESHOLD) {
    for (const [key, data] of rateLimitMap.entries()) {
      if (now - data.lastReset > 60000) rateLimitMap.delete(key);
    }
  }

  const record = rateLimitMap.get(ip) ?? { count: 0, lastReset: now };

  // Reset every minute
  if (now - record.lastReset > 60000) {
    record.count = 0;
    record.lastReset = now;
  }

  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  record.count++;
  rateLimitMap.set(ip, record);

  const rawQ = req.nextUrl.searchParams.get("q")?.trim();
  if (!rawQ || rawQ.length < 2) return NextResponse.json([]);
  const q = rawQ.replace(/[(),.\\]/g, " ").replace(/\s+/g, " ").trim();

  const supabase = await createClient();
  const results: Suggestion[] = [];

  // ── 1. Matching book titles (up to 4) ───────────────────────────────────────
  const { data: books } = await supabase
    .from("books")
    .select("slug, title, authors ( name )")
    .eq("is_published", true)
    .ilike("title", `%${q}%`)
    .limit(4);

  for (const b of books ?? []) {
    results.push({
      type:  "book",
      slug:  b.slug,
      label: b.title,
      sub:   (b.authors as any)?.name ?? "Unknown",
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

  return NextResponse.json(results);
}