/**
 * Open Library — edition first, then authors.
 *
 * Measured 2026-09-25: `/api/books?bibkeys=ISBN:…` answers 404 for an ISBN
 * that `/isbn/<isbn>.json` resolves, so the edition endpoint is the source.
 * An edition record carries this ISBN's own title, publisher, date, pages,
 * edition statement and cover — but no author names, only keys.
 *
 * Author names come from `/search.json?isbn=`, and ONLY author names and
 * subjects: that endpoint answers at the WORK level, merging every edition —
 * for "Effective Java" it returned four publishers, five years and three
 * languages. Taking a publisher or year from it would put another edition's
 * facts on this record. Authors do not vary by edition, so they are safe; if
 * the search call fails, the edition is still returned without them.
 *
 * The cover is a SOURCE, not a URL to show: `covers.openlibrary.org` redirects
 * to archive.org, which the CSP blocks (a record saved with it showed a broken
 * cover). The server fetches and stores it on Save — lib/isbn/cover-source.ts.
 *
 * Latency, measured 2026-09-25: the edition endpoint answers in 3.0–3.7 s and
 * search in ~0.9 s, so the two run in PARALLEL (search does not depend on the
 * edition) and each gets 10 s — a 6 s budget timed out a real lookup.
 */
import type { FetchLike, IsbnCandidate, ProviderResult } from "../types";
import { fetchJson, isObj, str, strArr, yearFrom } from "./fetch-json";
import { openLibraryCoverSource } from "../cover-source";

const BASE = "https://openlibrary.org";

export interface OpenLibraryOptions {
  fetch: FetchLike;
  timeoutMs?: number;
}

export function createOpenLibraryProvider(o: OpenLibraryOptions) {
  const timeout = o.timeoutMs ?? 10_000;

  return async function lookupOpenLibrary(isbn13: string, isbn10: string | null): Promise<ProviderResult> {
    const [ed, s] = await Promise.all([
      fetchJson(o.fetch, `${BASE}/isbn/${isbn13}.json`, timeout),
      fetchJson(o.fetch, `${BASE}/search.json?isbn=${isbn13}&fields=author_name,subject&limit=1`, timeout),
    ]);
    if (!ed.ok) {
      return { status: "error", kind: ed.kind, message: `Open Library ${ed.status ? `answered ${ed.status}` : ed.kind === "timeout" ? "timed out" : "is unreachable"}.` };
    }
    if (ed.status === 404 || !isObj(ed.body)) return { status: "not_found" };
    const e = ed.body;
    const title = str(e.title);
    if (!title) return { status: "not_found" };

    // Best effort: a failed author lookup must not lose the edition.
    let authors: string[] = [];
    let subjects: string[] = [];
    if (s.ok && isObj(s.body) && Array.isArray(s.body.docs) && isObj(s.body.docs[0])) {
      authors = strArr(s.body.docs[0].author_name);
      subjects = strArr(s.body.docs[0].subject).slice(0, 8);
    }
    if (authors.length === 0) {
      const by = str(e.by_statement);
      if (by) authors = [by.replace(/^by\s+/i, "").replace(/[.;]\s*$/, "")];
    }

    const langKey = Array.isArray(e.languages) && isObj(e.languages[0]) ? str(e.languages[0].key) : null;
    const coverId = Array.isArray(e.covers) ? e.covers.find((c): c is number => typeof c === "number" && c > 0) : undefined;
    const candidate: IsbnCandidate = {
      provider: "open_library",
      providerRecordId: str(e.key) ?? `ISBN:${isbn13}`,
      title,
      subtitle: str(e.subtitle),
      authors,
      publisher: strArr(e.publishers)[0] ?? null,
      year: yearFrom(e.publish_date),
      language: langKey ? langKey.replace(/^\/languages\//, "") : null,
      pageCount: typeof e.number_of_pages === "number" && e.number_of_pages > 0 ? e.number_of_pages : null,
      edition: str(e.edition_name),
      subjects,
      description: null,
      coverSource: coverId ? openLibraryCoverSource(coverId) : null,
      isbn13,
      isbn10,
    };
    return { status: "found", candidates: [candidate] };
  };
}
