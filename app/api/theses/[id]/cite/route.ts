// Citation export for a thesis — mirrors /api/publications/[slug]/cite.
// GET /api/theses/{id}/cite?format=apa|mla|chicago|ieee|bibtex|ris
// Accepts the canonical slug or a legacy UUID id in the [id] segment.

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildCitation,
  citationFile,
  type CiteFormat,
} from "@/lib/theses/citation";

const FORMATS: CiteFormat[] = ["apa", "mla", "chicago", "ieee", "bibtex", "ris"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip =
    request.headers.get("x-real-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown";
  const rl = await rateLimit(`thesis-cite:${ip}`, 30, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "apa") as CiteFormat;
  if (!FORMATS.includes(format)) {
    return NextResponse.json(
      { error: `format must be one of: ${FORMATS.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const query = supabase
    .from("research_reports")
    .select("*, departments(name)")
    .eq("is_published", true);
  const { data, error } = await (UUID_RE.test(id)
    ? query.eq("id", id)
    : query.eq("slug", id)
  ).maybeSingle();

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const reportId = data.slug ?? data.id;
  const text = buildCitation(format, data, reportId);
  const { name, mime } = citationFile(format, data);

  return new NextResponse(text, {
    headers: {
      "Content-Type": `${mime}; charset=utf-8`,
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
