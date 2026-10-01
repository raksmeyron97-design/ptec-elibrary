// /journals/articles/<slug>/fulltext.pdf — the PUBLIC full text of an openly
// licensed journal article (SEO Phase 3.7). In the article page's directory,
// outside /api/, allowed by robots.txt: where Google Scholar looks for the PDF
// a `citation_pdf_url` names. Served only when lib/journals/open-access.ts
// says the licence allows it; every other article answers 403 with a page
// pointing back to its record. The /api/publications route that the on-page
// reader uses is unchanged.

import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { clientIp } from "@/lib/client-ip";
import { lockdownResponse } from "@/lib/security/lockdown";
import { decodeSlugParam } from "@/lib/slug";
import { articleIsOpenAccess } from "@/lib/journals/open-access";
import { articlePath } from "@/lib/journals/urls";
import { servePublicPdf } from "@/lib/fulltext/serve-pdf";
import { restrictedFulltextResponse } from "@/lib/fulltext/restricted";

type Params = { params: Promise<{ slug: string; locale: string }> };

async function handle(request: Request, { params }: Params, head: boolean): Promise<Response> {
  const locked = lockdownResponse("downloads", "/journals/articles/[slug]/fulltext.pdf");
  if (locked) return locked;

  const ip = clientIp(request.headers);
  const ranged = !!request.headers.get("range");
  const { limit, windowMs } = ratePolicy(ranged ? "fileRange" : "fileRead");
  const rl = await rateLimit(`${ranged ? "article-fulltext-range" : "article-fulltext"}:${ip}`, limit, windowMs);
  if (!rl.success) return new Response("Too many requests. Please try again later.", { status: 429 });

  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const { data: pub, error } = await createServiceClient()
    .from("publications")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) return new Response("Temporarily unavailable", { status: 503 });
  if (!pub) return new Response("Not found", { status: 404 });

  if (!articleIsOpenAccess(pub)) {
    const t = await getTranslations({ locale, namespace: "thesisDetail" });
    return restrictedFulltextResponse({
      locale,
      title: t("fulltextNotPublic"),
      linkText: t("fulltextSeeRecord", { title: pub.title ?? slug }),
      href: `${locale === "km" ? "/km" : ""}${articlePath(slug)}`,
    });
  }

  return servePublicPdf({
    request,
    fileUrl: pub.pdf_url as string,
    filename: pub.title ?? slug,
    version: { contentHash: pub.content_hash ?? null, fileUrl: pub.pdf_url as string, updatedAt: pub.updated_at ?? null },
    head,
  });
}

export function GET(request: Request, ctx: Params) {
  return handle(request, ctx, false);
}

export function HEAD(request: Request, ctx: Params) {
  return handle(request, ctx, true);
}
