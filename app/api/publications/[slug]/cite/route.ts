import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { mapRowToPublication, PUBLICATION_DETAIL_SELECT } from "@/lib/publications";
import {
  buildPublicationCitation,
  publicationCitationFile,
  type CiteFormat,
} from "@/lib/citations";

const FORMATS: CiteFormat[] = ["apa", "mla", "chicago", "ieee", "bibtex", "ris"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip =
    request.headers.get("x-real-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown";
  const rl = await rateLimit(`publication-cite:${ip}`, 30, 60_000);
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
    .from("publications")
    .select(PUBLICATION_DETAIL_SELECT)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const pub = mapRowToPublication(data);
  const text = buildPublicationCitation(format, pub);
  const { name, mime } = publicationCitationFile(format, pub);

  return new NextResponse(text, {
    headers: {
      "Content-Type": `${mime}; charset=utf-8`,
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
