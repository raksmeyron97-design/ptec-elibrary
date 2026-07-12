// GET /api/export/{books|theses|publications}/{slug}?format=…
//
// Single-record metadata export (see the feed route for the format list).
// 404 for anything that is not published AND verified — unverified records
// never produce authoritative exports, by the same contract as the feed.
// bibtex/ris responses carry a download filename so "Download citation"
// links on landing pages can point straight here.

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import {
  EXPORT_CONTENT_TYPES,
  EXPORT_SCHEMA_VERSION,
  toBibtex,
  toCslJson,
  toDublinCoreJson,
  toDublinCoreXml,
  toRis,
  parseExportFormat,
  type ExportFormat,
  type ScholarlyWork,
} from "@/lib/exports/scholarly";
import { EXPORT_TYPES, fetchExportWork } from "@/lib/exports/works";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "X-Export-Schema-Version": EXPORT_SCHEMA_VERSION,
} as const;

const FILE_EXT: Partial<Record<ExportFormat, string>> = { bibtex: "bib", ris: "ris" };

function render(work: ScholarlyWork, format: ExportFormat): string {
  switch (format) {
    case "csl-json":
      return JSON.stringify(toCslJson(work), null, 2);
    case "dc-json":
      return JSON.stringify(toDublinCoreJson(work), null, 2);
    case "dc-xml":
      return '<?xml version="1.0" encoding="UTF-8"?>' + toDublinCoreXml(work);
    case "bibtex":
      return toBibtex(work);
    case "ris":
      return toRis(work);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; slug: string }> },
) {
  const ip =
    req.headers.get("x-real-ip")?.trim() ??
    req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown";
  const { limit, windowMs } = ratePolicy("export");
  if (!(await rateLimit(`export:${ip}`, limit, windowMs)).success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/export", ip });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { type: rawType, slug } = await params;
  const type = EXPORT_TYPES[rawType];
  if (!type || !slug) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const format = parseExportFormat(new URL(req.url).searchParams.get("format"));
  if (!format) {
    return NextResponse.json(
      { error: "Unknown format", supported: Object.keys(EXPORT_CONTENT_TYPES) },
      { status: 400 },
    );
  }

  try {
    const work = await fetchExportWork(type, slug);
    if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const headers: Record<string, string> = {
      ...CACHE_HEADERS,
      "Content-Type": EXPORT_CONTENT_TYPES[format],
    };
    const ext = FILE_EXT[format];
    if (ext) headers["Content-Disposition"] = `attachment; filename="${work.slug}.${ext}"`;

    return new NextResponse(render(work, format), { status: 200, headers });
  } catch (e) {
    console.error("[export] record failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
