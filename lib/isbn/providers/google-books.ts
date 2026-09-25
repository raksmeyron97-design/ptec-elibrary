/**
 * Google Books — `GET /books/v1/volumes?q=isbn:<isbn>`.
 *
 * Measured 2026-09-25: WITHOUT an API key every request is charged to Google's
 * shared default project, whose daily quota was already exhausted (429,
 * "Queries per day … project_number:624717413613"). Keyless use is therefore
 * best-effort at most; GOOGLE_BOOKS_API_KEY makes it dependable. After a 429
 * the provider pauses itself for an hour rather than spending one failed call
 * on every lookup.
 *
 * Google's `isbn:` query also returns near misses, so a volume is kept only if
 * its own industryIdentifiers carry this ISBN — an edition we cannot tie to
 * the ISBN is not evidence about it. No cover: Google's image host is not in
 * the site's CSP, and widening a security policy for a thumbnail is not a
 * trade worth making; Open Library supplies covers.
 */
import type { FetchLike, IsbnCandidate, ProviderResult } from "../types";
import { fetchJson, isObj, plainText, str, strArr, yearFrom } from "./fetch-json";

const ENDPOINT = "https://www.googleapis.com/books/v1/volumes";
export const GOOGLE_QUOTA_PAUSE_MS = 60 * 60 * 1000;

export interface GoogleBooksOptions {
  fetch: FetchLike;
  apiKey?: string | null;
  timeoutMs?: number;
  now?: () => number;
}

export function createGoogleBooksProvider(o: GoogleBooksOptions) {
  const now = o.now ?? Date.now;
  let pausedUntil = 0;
  const keyless = !o.apiKey;
  const quotaMessage = keyless
    ? "Google Books refused a request without an API key (shared daily quota exhausted). Set GOOGLE_BOOKS_API_KEY."
    : "Google Books quota exceeded for this API key.";

  return async function lookupGoogleBooks(isbn13: string, isbn10: string | null): Promise<ProviderResult> {
    if (now() < pausedUntil) return { status: "error", kind: "quota", message: `${quotaMessage} Paused for up to an hour.` };

    const url = `${ENDPOINT}?q=isbn:${isbn13}${o.apiKey ? `&key=${encodeURIComponent(o.apiKey)}` : ""}`;
    const a = await fetchJson(o.fetch, url, o.timeoutMs ?? 6_000);
    if (!a.ok) {
      if (a.kind === "quota") {
        pausedUntil = now() + GOOGLE_QUOTA_PAUSE_MS;
        return { status: "error", kind: "quota", message: quotaMessage };
      }
      // The URL can carry the key: never put it in a message.
      return { status: "error", kind: a.kind, message: `Google Books ${a.status ? `answered ${a.status}` : a.kind === "timeout" ? "timed out" : "is unreachable"}.` };
    }
    if (a.status === 404 || !isObj(a.body)) return { status: "not_found" };

    const items = Array.isArray(a.body.items) ? a.body.items : [];
    const candidates: IsbnCandidate[] = [];
    for (const item of items) {
      if (!isObj(item) || !isObj(item.volumeInfo)) continue;
      const v = item.volumeInfo;
      const ids = Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : [];
      const carries = ids.some(
        (id) => isObj(id) && typeof id.identifier === "string" && (id.identifier === isbn13 || (isbn10 !== null && id.identifier.toUpperCase() === isbn10)),
      );
      const title = str(v.title);
      if (!carries || !title) continue;
      candidates.push({
        provider: "google_books",
        providerRecordId: str(item.id) ?? isbn13,
        title,
        subtitle: str(v.subtitle),
        authors: strArr(v.authors),
        publisher: str(v.publisher),
        year: yearFrom(v.publishedDate),
        language: str(v.language),
        pageCount: typeof v.pageCount === "number" && v.pageCount > 0 ? v.pageCount : null,
        edition: null,
        subjects: strArr(v.categories),
        description: plainText(v.description),
        // Google thumbnails are ~128 px wide, under the cover pipeline's 300×450
        // minimum — every one would be refused, so none is offered.
        coverSource: null,
        isbn13,
        isbn10,
      });
    }
    return candidates.length ? { status: "found", candidates } : { status: "not_found" };
  };
}
