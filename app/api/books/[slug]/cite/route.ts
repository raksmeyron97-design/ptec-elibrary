// Citation export for a book — mirrors /api/publications/[slug]/cite.
// GET /api/books/{slug}/cite?format=apa|bibtex|ris

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { mapRowToBook } from "@/lib/books";
import {
  buildBookCitation,
  bookCitationFile,
  type CiteFormat,
} from "@/lib/books/citation";

const FORMATS: CiteFormat[] = ["apa", "bibtex", "ris"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip =
    request.headers.get("x-real-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown";
  const rl = await rateLimit(`book-cite:${ip}`, 30, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "apa") as CiteFormat;
  if (!FORMATS.includes(format)) {
    return NextResponse.json(
      { error: `format must be one of: ${FORMATS.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("books")
    .select("id, slug, title, isbn, publisher, language, pages, published_at, authors(name)")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const book = mapRowToBook(data);
  const text = buildBookCitation(format, book);
  const { name, mime } = bookCitationFile(format, book);

  return new NextResponse(text, {
    headers: {
      "Content-Type": `${mime}; charset=utf-8`,
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
