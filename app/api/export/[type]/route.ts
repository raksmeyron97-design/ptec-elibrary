// GET /api/export/{books|theses|publications}
//   ?format=csl-json|dc-json|dc-xml|bibtex|ris   (default csl-json)
//   &page=1&pageSize=50                          (pageSize ≤ 100)
//
// Bulk metadata export for the academic repository (docs/METADATA-EXPORTS.md).
// Serves only published + verified records (see lib/exports/works.ts for the
// exact gating contract), is rate-limited per IP, and CDN-cached for an hour
// — the collection changes at most a few times a day.

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import {
  EXPORT_CONTENT_TYPES,
  EXPORT_SCHEMA_VERSION,
  buildDcXmlFeed,
  buildJsonFeed,
  buildTextFeed,
  parseExportFormat,
} from "@/lib/exports/scholarly";
import { EXPORT_TYPES, fetchExportWorks } from "@/lib/exports/works";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 100;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "X-Export-Schema-Version": EXPORT_SCHEMA_VERSION,
} as const;

function clientIP(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip")?.trim() ??
    req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown"
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const ip = clientIP(req);
  const { limit, windowMs } = ratePolicy("export");
  if (!(await rateLimit(`export:${ip}`, limit, windowMs)).success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/export", ip });
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } });
  }

  const { type: rawType } = await params;
  const type = EXPORT_TYPES[rawType];
  if (!type) {
    return NextResponse.json(
      { error: "Unknown resource type", supported: Object.keys(EXPORT_TYPES) },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(req.url);
  const format = parseExportFormat(searchParams.get("format"));
  if (!format) {
    return NextResponse.json(
      { error: "Unknown format", supported: Object.keys(EXPORT_CONTENT_TYPES) },
      { status: 400 },
    );
  }
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50),
  );

  try {
    const { works, total } = await fetchExportWorks(type, page, pageSize);
    const meta = { type, page, pageSize, total, generatedAt: new Date().toISOString() };

    let body: string;
    if (format === "csl-json" || format === "dc-json") body = buildJsonFeed(works, meta, format);
    else if (format === "dc-xml") body = buildDcXmlFeed(works, meta);
    else body = buildTextFeed(works, format);

    return new NextResponse(body, {
      status: 200,
      headers: { ...CACHE_HEADERS, "Content-Type": EXPORT_CONTENT_TYPES[format] },
    });
  } catch (e) {
    console.error("[export] feed failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
