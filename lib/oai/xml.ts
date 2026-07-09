// lib/oai/xml.ts
// Pure, browser-safe XML/OAI-PMH building blocks — no DB, no server-only
// imports, so this half of the OAI implementation is unit-testable without
// Supabase (mirrors the lib/seo/citation.ts split: pure builders separate
// from the server-only fetch layer in lib/oai/records.ts).

import { SITE_URL } from "@/lib/seo/site";
import { PTEC } from "@/lib/ptec";

export const OAI_METADATA_PREFIX = "oai_dc";
export const OAI_PAGE_SIZE = 50;

export type OaiSetSpec = "book" | "thesis" | "publication";

export const OAI_SETS: { setSpec: OaiSetSpec; setName: string }[] = [
  { setSpec: "book", setName: "E-Books" },
  { setSpec: "thesis", setName: "Theses & Research Reports" },
  { setSpec: "publication", setName: "Journal Publications" },
];

/** One harvestable item, already normalised from whichever table it came from. */
export interface OaiRecord {
  setSpec: OaiSetSpec;
  /** slug (or, if a table has no slug, a stable id) — the OAI identifier's local part. */
  localId: string;
  /** Full ISO-8601 UTC timestamp (seconds granularity) — drives header/datestamp and from/until. */
  datestamp: string;
  title: string;
  creators: string[];
  /** YYYY-MM-DD, or null when no usable date exists. */
  date: string | null;
  subjects: string[];
  description: string | null;
  identifierUrl: string;
  languages: string[];
  type: string;
}

export const OAI_ERROR_CODES = [
  "badArgument",
  "badResumptionToken",
  "badVerb",
  "cannotDisseminateFormat",
  "idDoesNotExist",
  "noRecordsMatch",
  "noSetHierarchy",
] as const;

export type OaiErrorCode = (typeof OAI_ERROR_CODES)[number];

export class OaiError extends Error {
  code: OaiErrorCode;
  constructor(code: OaiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// ── Escaping ─────────────────────────────────────────────────────────────

/** XML 1.0 forbids these control characters even when escaped as numeric refs. */
function stripInvalidXmlChars(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function escapeXml(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

// ── Date helpers ─────────────────────────────────────────────────────────

/** ISO-8601 UTC, seconds granularity, e.g. "2026-07-09T12:34:56Z". */
export function toOaiDatestamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function nowOaiDatestamp(): string {
  return toOaiDatestamp(new Date());
}

/** Dublin Core dc:date — plain YYYY-MM-DD, or null for unparseable/missing input. */
export function toDcDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const OAI_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const OAI_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Parses an OAI-PMH `from`/`until` argument. Accepts either granularity the
 * spec allows (date-only or full UTC datetime); date-only values are widened
 * to the start/end of that UTC day so range comparisons stay inclusive.
 * Returns null for anything that doesn't match either form or doesn't parse.
 */
export function parseOaiDateArg(raw: string, boundary: "start" | "end"): Date | null {
  let iso: string;
  if (OAI_DATE_TIME.test(raw)) {
    iso = raw;
  } else if (OAI_DATE_ONLY.test(raw)) {
    iso = boundary === "start" ? `${raw}T00:00:00Z` : `${raw}T23:59:59Z`;
  } else {
    return null;
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** True if a value matched the finer (datetime) granularity, for the from/until "same granularity" rule. */
export function isOaiDateTimeGranularity(raw: string): boolean {
  return OAI_DATE_TIME.test(raw);
}

// ── Language normalisation ──────────────────────────────────────────────

/** Best-effort free text → dc:language values. Unrecognised input passes through unchanged. */
export function normalizeDcLanguages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  if (lower === "km_en" || lower === "en_km") return ["km", "en"];
  if (lower === "en" || lower === "english") return ["en"];
  if (lower === "km" || lower === "khmer") return ["km"];
  return [trimmed];
}

// ── OAI identifiers ──────────────────────────────────────────────────────

export function oaiDomain(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim();
  if (root) return root;
  try {
    return new URL(SITE_URL).hostname;
  } catch {
    return "library.ptec.edu.kh";
  }
}

export function buildOaiIdentifier(setSpec: OaiSetSpec, localId: string): string {
  return `oai:${oaiDomain()}:${setSpec}/${localId}`;
}

export function parseOaiIdentifier(identifier: string): { setSpec: OaiSetSpec; localId: string } | null {
  const prefix = `oai:${oaiDomain()}:`;
  if (!identifier.startsWith(prefix)) return null;
  const rest = identifier.slice(prefix.length);
  const slashIdx = rest.indexOf("/");
  if (slashIdx <= 0 || slashIdx === rest.length - 1) return null;
  const setSpec = rest.slice(0, slashIdx);
  const localId = rest.slice(slashIdx + 1);
  if (setSpec !== "book" && setSpec !== "thesis" && setSpec !== "publication") return null;
  return { setSpec, localId };
}

// ── Resumption tokens ────────────────────────────────────────────────────

export interface ResumptionState {
  verb: "ListIdentifiers" | "ListRecords";
  metadataPrefix: string;
  from?: string;
  until?: string;
  set?: OaiSetSpec;
  offset: number;
}

export function encodeResumptionToken(state: ResumptionState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeResumptionToken(token: string): ResumptionState | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<ResumptionState>;
    if (parsed.verb !== "ListIdentifiers" && parsed.verb !== "ListRecords") return null;
    if (typeof parsed.metadataPrefix !== "string" || !parsed.metadataPrefix) return null;
    if (typeof parsed.offset !== "number" || !Number.isFinite(parsed.offset) || parsed.offset < 0) return null;
    if (parsed.from !== undefined && typeof parsed.from !== "string") return null;
    if (parsed.until !== undefined && typeof parsed.until !== "string") return null;
    if (parsed.set !== undefined && parsed.set !== "book" && parsed.set !== "thesis" && parsed.set !== "publication") {
      return null;
    }
    return {
      verb: parsed.verb,
      metadataPrefix: parsed.metadataPrefix,
      from: parsed.from,
      until: parsed.until,
      set: parsed.set,
      offset: parsed.offset,
    };
  } catch {
    return null;
  }
}

// ── Dublin Core (oai_dc) metadata ────────────────────────────────────────

export function buildDcMetadata(record: OaiRecord): string {
  const parts: string[] = [];
  parts.push(
    '<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">',
  );
  parts.push(tag("dc:title", record.title));
  for (const creator of record.creators) parts.push(tag("dc:creator", creator));
  parts.push(tag("dc:publisher", PTEC.name.en));
  for (const subject of record.subjects) parts.push(tag("dc:subject", subject));
  if (record.description) parts.push(tag("dc:description", record.description));
  if (record.date) parts.push(tag("dc:date", record.date));
  parts.push(tag("dc:type", record.type));
  parts.push(tag("dc:identifier", record.identifierUrl));
  for (const language of record.languages) parts.push(tag("dc:language", language));
  parts.push("</oai_dc:dc>");
  return parts.join("");
}

export function buildHeader(record: OaiRecord): string {
  return (
    "<header>" +
    tag("identifier", buildOaiIdentifier(record.setSpec, record.localId)) +
    tag("datestamp", record.datestamp) +
    tag("setSpec", record.setSpec) +
    "</header>"
  );
}

export function buildRecordXml(record: OaiRecord): string {
  return `<record>${buildHeader(record)}<metadata>${buildDcMetadata(record)}</metadata></record>`;
}

// ── Envelope ─────────────────────────────────────────────────────────────

export function buildRequestTag(baseUrl: string, verb: string | null, params: Record<string, string>): string {
  let attrs = "";
  if (verb) attrs += ` verb="${escapeXml(verb)}"`;
  for (const [key, value] of Object.entries(params)) {
    if (key === "verb") continue;
    attrs += ` ${key}="${escapeXml(value)}"`;
  }
  return `<request${attrs}>${escapeXml(baseUrl)}</request>`;
}

export function buildResumptionTokenTag(token: string, cursor: number, completeListSize: number): string {
  return `<resumptionToken cursor="${cursor}" completeListSize="${completeListSize}">${escapeXml(token)}</resumptionToken>`;
}

export function buildOaiPmhXml(requestTag: string, body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">\n' +
    `<responseDate>${nowOaiDatestamp()}</responseDate>\n` +
    `${requestTag}\n` +
    `${body}\n` +
    "</OAI-PMH>"
  );
}

export function buildErrorXml(baseUrl: string, verb: string | null, params: Record<string, string>, errors: OaiError[]): string {
  // Per the OAI-PMH spec, the <request> tag must not carry a verb attribute
  // when the verb itself was missing/illegal (badVerb), nor any of the other
  // arguments once we can't vouch for which ones were "legitimate".
  const verbWasBad = errors.some((e) => e.code === "badVerb");
  const requestTag = verbWasBad
    ? `<request>${escapeXml(baseUrl)}</request>`
    : buildRequestTag(baseUrl, verb, params);
  const body = errors.map((e) => `<error code="${escapeXml(e.code)}">${escapeXml(e.message)}</error>`).join("");
  return buildOaiPmhXml(requestTag, body);
}
