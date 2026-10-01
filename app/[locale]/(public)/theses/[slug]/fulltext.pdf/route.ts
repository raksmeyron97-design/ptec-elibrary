// /theses/<slug>/fulltext.pdf — the PUBLIC full text of an open-access thesis
// (SEO Phase 3.4, decisions D4 and D12).
//
// In the abstract page's directory, outside /api/, allowed by robots.txt and
// never `noindex`, because that is where Google Scholar looks for the PDF a
// `citation_pdf_url` names. Anonymous 200 ONLY when a librarian has opened
// the thesis (lib/theses/open-access.ts); every other thesis answers 403
// with a page pointing back to its record, where the signed-in reading and
// downloading work exactly as before. No crawler-only exception (D12): a
// crawler gets what any reader gets.

import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { clientIp } from "@/lib/client-ip";
import { lockdownResponse } from "@/lib/security/lockdown";
import { decodeSlugParam } from "@/lib/slug";
import { thesisIsOpenAccess } from "@/lib/theses/open-access";
import { servePublicPdf } from "@/lib/fulltext/serve-pdf";
import { restrictedFulltextResponse } from "@/lib/fulltext/restricted";

type Params = { params: Promise<{ slug: string; locale: string }> };

const COLUMNS =
  "id, slug, title, file_url, content_hash, updated_at, is_published, license, download_override, access, access_consent_at";

async function handle(request: Request, { params }: Params, head: boolean): Promise<Response> {
  const locked = lockdownResponse("downloads", "/theses/[slug]/fulltext.pdf");
  if (locked) return locked;

  const ip = clientIp(request.headers);
  const ranged = !!request.headers.get("range");
  const { limit, windowMs } = ratePolicy(ranged ? "fileRange" : "fileRead");
  const rl = await rateLimit(`${ranged ? "thesis-fulltext-range" : "thesis-fulltext"}:${ip}`, limit, windowMs);
  if (!rl.success) return new Response("Too many requests. Please try again later.", { status: 429 });

  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const { data: row, error } = await createServiceClient()
    .from("research_reports")
    .select(COLUMNS)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  // A database without 0163's columns cannot hold an open thesis: the read
  // fails on the missing column and the answer is "not open", never a 500.
  if (error && error.code !== "42703" && error.code !== "PGRST204") {
    return new Response("Temporarily unavailable", { status: 503 });
  }
  if (!row && !error) return new Response("Not found", { status: 404 });

  if (!row || !thesisIsOpenAccess(row)) {
    const t = await getTranslations({ locale, namespace: "thesisDetail" });
    const recordPath = `${locale === "km" ? "/km" : ""}/theses/${encodeURIComponent(slug)}`;
    return restrictedFulltextResponse({
      locale,
      title: t("fulltextNotPublic"),
      linkText: t("fulltextSeeRecord", { title: row?.title ?? slug }),
      href: recordPath,
    });
  }

  return servePublicPdf({
    request,
    fileUrl: row.file_url as string,
    filename: row.title,
    version: { contentHash: row.content_hash, fileUrl: row.file_url as string, updatedAt: row.updated_at },
    head,
  });
}

export function GET(request: Request, ctx: Params) {
  return handle(request, ctx, false);
}

export function HEAD(request: Request, ctx: Params) {
  return handle(request, ctx, true);
}
