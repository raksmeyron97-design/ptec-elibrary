"use server";
// app/admin/catalogs/publisher-actions.ts
// "Fetch from publisher link": read a book's description ("About this book")
// from the publisher's page a librarian pasted. Writes nothing — the text lands
// in the form's description field, and Save decides.
//
// Order: validate → page (lib/net/public-fetch.ts, public addresses only) →
// the page's own text (lib/catalogs/publisher-description.ts) → if the page
// gave none and its URL carries a DOI, Crossref's abstract.
//
// The User-Agent says who is asking. Measured 2026-10-04: Springer serves this
// one the real page, and serves a browser-imitating one a JavaScript challenge.

import { requirePermission } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { fetchPublicHtml } from "@/lib/net/public-fetch";
import { rememberPublisherFetch } from "@/lib/catalogs/publisher-fetch-memory";
import { canonicalValue } from "@/lib/catalogs/provenance";
import { ISBN_USER_AGENT } from "@/lib/isbn/providers/fetch-json";
import {
  crossrefAbstract,
  doiFromUrl,
  extractPublisherDescription,
  looksLikeBotWall,
  type DescriptionSource,
} from "@/lib/catalogs/publisher-description";

export type PublisherDescriptionError =
  | "invalid_url"
  | "blocked_address"
  | "rate_limited"
  | "unreachable"
  | "timeout"
  | "http"
  | "not_html"
  | "too_large"
  | "bot_wall"
  | "not_found";

export type PublisherDescriptionResult =
  | { ok: true; description: string; source: DescriptionSource; truncated: boolean; host: string }
  | { ok: false; error: PublisherDescriptionError; status?: number };

async function fromCrossref(doi: string): Promise<string | null> {
  try {
    // A fixed host and an encoded DOI: no part of the request is the pasted URL.
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { Accept: "application/json", "User-Agent": ISBN_USER_AGENT },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    return res.ok ? crossrefAbstract(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Remember what this server fetched, so the review's provenance can credit the
 * page only for text it really returned (lib/catalogs/publisher-fetch-memory.ts).
 */
function remembered(userId: string, result: PublisherDescriptionResult): PublisherDescriptionResult {
  if (result.ok) {
    const text = canonicalValue("description", {
      title: null, author: null, isbn: null, publisher: null, year: null, language: null, category: null,
      description: result.description, keywords: null, cover_url: null,
    });
    rememberPublisherFetch(userId, text, { host: result.host, source: result.source === "crossref" ? "crossref" : "publisher" });
  }
  return result;
}

export async function fetchPublisherDescription(rawUrl: string): Promise<PublisherDescriptionResult> {
  const { userId } = await requirePermission("catalog", "write");

  const url = typeof rawUrl === "string" ? rawUrl.trim().slice(0, 2048) : "";
  if (!url) return { ok: false, error: "invalid_url" };

  const policy = ratePolicy("publisherFetch");
  const allowed = await rateLimit(`publisher-fetch:${userId}`, policy.limit, policy.windowMs);
  if (!allowed.success) return { ok: false, error: "rate_limited" };

  const page = await fetchPublicHtml(url, { userAgent: ISBN_USER_AGENT, timeoutMs: 10_000 });
  const doi = doiFromUrl(url);

  if (page.ok && !looksLikeBotWall(page.body)) {
    const found = extractPublisherDescription(page.body);
    if (found) return remembered(userId, { ok: true, description: found.text, source: found.source, truncated: found.truncated, host: new URL(page.finalUrl).hostname });
  }
  // Refused addresses and malformed URLs are final; a DOI is not a way around them.
  if (!page.ok && (page.reason === "invalid_url" || page.reason === "blocked_address")) return { ok: false, error: page.reason };

  if (doi) {
    const abstract = await fromCrossref(doi);
    if (abstract) return remembered(userId, { ok: true, description: abstract, source: "crossref", truncated: false, host: "api.crossref.org" });
  }

  if (!page.ok) {
    // An HTTP 202/403/429/503 from a publisher is almost always a bot check.
    if (page.reason === "http" && [202, 403, 429, 503].includes(page.status ?? 0)) return { ok: false, error: "bot_wall", status: page.status };
    return { ok: false, error: page.reason === "too_many_redirects" ? "unreachable" : page.reason, status: page.status };
  }
  // A 202 "Accepted" is not a page: OUP's AWS WAF answers that way (measured 2026-10-04).
  return { ok: false, error: looksLikeBotWall(page.body) || page.status === 202 ? "bot_wall" : "not_found" };
}
