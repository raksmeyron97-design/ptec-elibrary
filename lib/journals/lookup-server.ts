// The network half of journal prefill (lib/journals/lookup.ts is the pure
// half). Two fixed hosts, one bounded request each, in parallel.
//
// "No record" and "could not ask" are different answers and stay different:
// a registry that times out or answers 5xx is reported as `unavailable`, so
// the form can say "Crossref did not answer" instead of implying the journal
// is unknown to it.
import "server-only";

import {
  issnForRequest,
  mergeSuggestions,
  parseCrossrefJournal,
  parseIssnPortalRecord,
  type JournalLookupResult,
  type JournalSuggestion,
  type LookupSource,
} from "@/lib/journals/lookup";

const CROSSREF_ORIGIN = "https://api.crossref.org";
const ISSN_PORTAL_ORIGIN = "https://portal.issn.org";
const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 512 * 1024;
// Crossref asks API clients to identify themselves; the ISSN Portal refuses
// requests without a user agent (403, measured 2026-10-02).
const USER_AGENT = "PTEC-eLibrary/1.0 (+https://library.ptec.edu.kh)";

type Outcome = { kind: "found"; suggestion: JournalSuggestion } | { kind: "none" } | { kind: "unavailable" };

async function boundedText(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const body = await res.text();
  return body.length > MAX_BODY_BYTES * 2 ? null : body;
}

async function askCrossref(issn: string): Promise<Outcome> {
  try {
    const url = new URL(CROSSREF_ORIGIN);
    url.pathname = `/journals/${issn}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) return { kind: "none" };
    if (!res.ok) return { kind: "unavailable" };
    const body = await boundedText(res);
    if (body === null) return { kind: "unavailable" };
    const suggestion = parseCrossrefJournal(JSON.parse(body));
    return suggestion ? { kind: "found", suggestion } : { kind: "none" };
  } catch {
    return { kind: "unavailable" };
  }
}

async function askIssnPortal(issn: string): Promise<Outcome> {
  try {
    const url = new URL(ISSN_PORTAL_ORIGIN);
    url.pathname = `/resource/ISSN/${issn}`;
    const res = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) return { kind: "none" };
    if (!res.ok) return { kind: "unavailable" };
    const body = await boundedText(res);
    if (body === null) return { kind: "unavailable" };
    const suggestion = parseIssnPortalRecord(body, issn);
    return suggestion ? { kind: "found", suggestion } : { kind: "none" };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Null when `raw` is not a valid ISSN (nothing is requested). */
export async function lookupJournalByIssn(raw: string): Promise<JournalLookupResult | null> {
  const issn = issnForRequest(raw);
  if (!issn) return null;
  const [crossref, portal] = await Promise.all([askCrossref(issn), askIssnPortal(issn)]);
  const sources: LookupSource[] = [];
  const unavailable: LookupSource[] = [];
  if (crossref.kind === "found") sources.push("crossref");
  if (crossref.kind === "unavailable") unavailable.push("crossref");
  if (portal.kind === "found") sources.push("issn_portal");
  if (portal.kind === "unavailable") unavailable.push("issn_portal");
  return {
    issn,
    sources,
    unavailable,
    suggestion: mergeSuggestions(
      crossref.kind === "found" ? crossref.suggestion : null,
      portal.kind === "found" ? portal.suggestion : null,
    ),
  };
}
