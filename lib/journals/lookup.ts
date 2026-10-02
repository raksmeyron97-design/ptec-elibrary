// Journal facts from authoritative public registries — Crossref's journals API
// and the ISSN Portal — turned into SUGGESTIONS for the admin form (decision
// 2026-10-02: prefill allowed). Pure and browser-safe; the network half is
// lib/journals/lookup-server.ts.
//
// Three rules:
//   * A suggestion is never saved by itself. The form shows it beside the
//     current value and the librarian accepts it field by field.
//   * Only facts a registry actually states. Crossref states title, publisher,
//     print/electronic ISSN and (sometimes) subjects; the ISSN Portal states
//     the linking ISSN, the medium of each ISSN and the country. Nothing is
//     inferred from one to fill a gap in the other.
//   * The typed ISSN never travels into a URL as typed: issnForRequest()
//     rebuilds it from parsed digits and a recomputed check digit.

import { normalizeIssn } from "@/lib/seo/identifiers";
import { countryCode } from "@/lib/journals/vocab";
import { plainText } from "@/lib/text/plain-text";

export type JournalSuggestion = {
  title?: string;
  publisher_name?: string;
  print_issn?: string;
  e_issn?: string;
  issn_l?: string;
  country?: string;
  subjects?: string[];
};

export type LookupSource = "crossref" | "issn_portal";

export type JournalLookupResult = {
  /** The ISSN that was looked up, normalised. */
  issn: string;
  /** Which registries answered with a record. */
  sources: LookupSource[];
  /** Registries that could not be reached (timeout, 5xx) — not the same as "no record". */
  unavailable: LookupSource[];
  suggestion: JournalSuggestion;
};

/**
 * The ISSN to put in a registry URL, built from numbers rather than copied
 * from the input: the first seven digits are parsed as an integer and the
 * check digit is recomputed. Null for anything that is not a valid ISSN.
 */
export function issnForRequest(raw: string | null | undefined): string | null {
  const valid = normalizeIssn(raw);
  if (!valid) return null;
  const body = Number.parseInt(valid.replace("-", "").slice(0, 7), 10);
  if (!Number.isSafeInteger(body) || body < 0) return null;
  const digits = String(body).padStart(7, "0");
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += (8 - i) * Number(digits[i]);
  const check = (11 - (sum % 11)) % 11;
  const checkChar = check === 10 ? "X" : String(check);
  return `${digits.slice(0, 4)}-${digits.slice(4)}${checkChar}`;
}

const text = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t || undefined;
};

/** Crossref `GET /journals/{issn}` → suggestion. Null when the body is not a journal record. */
export function parseCrossrefJournal(body: unknown): JournalSuggestion | null {
  const message = (body as { message?: unknown } | null)?.message as Record<string, unknown> | undefined;
  if (!message || typeof message !== "object") return null;
  const out: JournalSuggestion = {};
  const title = text(message.title);
  if (title) out.title = title;
  const publisher = text(message.publisher);
  if (publisher) out.publisher_name = publisher;
  const types = Array.isArray(message["issn-type"]) ? (message["issn-type"] as { type?: unknown; value?: unknown }[]) : [];
  for (const t of types) {
    const v = normalizeIssn(typeof t.value === "string" ? t.value : null);
    if (!v) continue;
    if (t.type === "print" && !out.print_issn) out.print_issn = v;
    if (t.type === "electronic" && !out.e_issn) out.e_issn = v;
  }
  const subjects = Array.isArray(message.subjects)
    ? (message.subjects as { name?: unknown }[]).map((s) => text(s?.name)).filter((s): s is string => !!s)
    : [];
  if (subjects.length > 0) out.subjects = [...new Set(subjects)];
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The ISSN Portal's record page → suggestion. The portal publishes no JSON to
 * anonymous clients; its record is a list of `<dt>Label:</dt><dd>…</dd>`
 * pairs, read here by label. A label the page does not carry contributes
 * nothing.
 *
 * `lookedUp` is the ISSN the page is about: its Medium says whether that
 * number is the print or the online one, and "Other media" names the other.
 */
export function parseIssnPortalRecord(html: string, lookedUp: string): JournalSuggestion | null {
  const fields = new Map<string, { text: string; html: string }>();
  const re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const label = plainText(m[1]).replace(/:$/, "").toLowerCase();
    if (!label || fields.has(label)) continue;
    fields.set(label, {
      html: m[2],
      text: plainText(m[2]),
    });
  }
  if (fields.size === 0) return null;

  const out: JournalSuggestion = {};
  const self = normalizeIssn(lookedUp);
  const title = fields.get("title proper")?.text.replace(/\s*[.;:/]\s*$/, "");
  if (title) out.title = title;

  const issnL = normalizeIssn(fields.get("issn-l")?.text.match(/\d{4}-?\d{3}[\dXx]/)?.[0]);
  if (issnL) out.issn_l = issnL;

  const medium = fields.get("medium")?.text.toLowerCase() ?? "";
  if (self && medium.startsWith("print")) out.print_issn = self;
  if (self && (medium.startsWith("online") || medium.startsWith("electronic"))) out.e_issn = self;

  // "Other media: <a href="/resource/ISSN/1938-1328">Online</a>"
  const other = fields.get("other media");
  if (other) {
    const linkRe = /href="\/resource\/ISSN\/(\d{4}-\d{3}[\dXx])"[^>]*>([^<]*)</g;
    for (let m = linkRe.exec(other.html); m; m = linkRe.exec(other.html)) {
      const v = normalizeIssn(m[1]);
      const kind = m[2].trim().toLowerCase();
      if (!v || v === self) continue;
      if (kind.startsWith("online") && !out.e_issn) out.e_issn = v;
      if (kind.startsWith("print") && !out.print_issn) out.print_issn = v;
    }
  }

  const country = countryCode(fields.get("country")?.text);
  if (country) out.country = country;

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * One suggestion from both registries. Crossref is preferred for the title
 * and publisher (it keeps the publisher's own capitalisation; the portal's
 * "title proper" is catalogued lower-case); the portal is the only source of
 * ISSN-L and country. An ISSN both name must agree — if they disagree about
 * which number is print, neither claim is suggested.
 */
export function mergeSuggestions(
  crossref: JournalSuggestion | null,
  portal: JournalSuggestion | null,
): JournalSuggestion {
  const out: JournalSuggestion = {};
  const title = crossref?.title ?? portal?.title;
  if (title) out.title = title;
  if (crossref?.publisher_name) out.publisher_name = crossref.publisher_name;
  for (const key of ["print_issn", "e_issn"] as const) {
    const a = crossref?.[key];
    const b = portal?.[key];
    if (a && b && a !== b) continue;
    const v = a ?? b;
    if (v) out[key] = v;
  }
  if (out.print_issn && out.print_issn === out.e_issn) delete out.e_issn;
  if (portal?.issn_l) out.issn_l = portal.issn_l;
  if (portal?.country) out.country = portal.country;
  if (crossref?.subjects?.length) out.subjects = crossref.subjects;
  return out;
}

/** The suggested fields that differ from what the form holds now — what the librarian is asked about. */
export function changedSuggestionFields(
  suggestion: JournalSuggestion,
  current: Partial<Record<keyof JournalSuggestion, string | string[] | null | undefined>>,
): (keyof JournalSuggestion)[] {
  const norm = (v: string | string[] | null | undefined) =>
    Array.isArray(v) ? v.map((s) => s.trim().toLowerCase()).sort().join("|") : (v ?? "").trim().toLowerCase();
  return (Object.keys(suggestion) as (keyof JournalSuggestion)[]).filter(
    (k) => norm(suggestion[k]) !== norm(current[k]),
  );
}
