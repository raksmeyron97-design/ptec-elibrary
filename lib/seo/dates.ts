// lib/seo/dates.ts
//
// Publication dates at the precision the library actually knows. Pure.
//
// Books store `${year}-01-01` because the admin form and the bulk importer
// collect a YEAR (app/(admin)/admin/(protected)/books/actions.ts). Every
// surface then published that padded value as a day: `citation_publication_date
// = 2026-01-01`, JSON-LD `datePublished: "2016-01-01"`, `article:published_time`
// (docs/seo/AUDIT-VERIFICATION.md F3, F9). Theses did the same with a
// `timestamptz` holding midnight on 1 January.
//
// The rule is to REDUCE precision, never to guess: a date on 1 January is
// published as its year alone. That is true whether the source really meant
// "some day in 2016" or truly "1 January 2016" — the year is right in both
// cases, and nothing is claimed that the data does not support. Any other
// date keeps its day. Dates are read in UTC, because a server in another time
// zone must not move 2023-01-01T00:00Z into 2022.

export type PublicationDate = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  precision: "year" | "day";
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a stored date or timestamp. Null for blank or unparseable input. */
export function parsePublicationDate(value: string | null | undefined): PublicationDate | null {
  const raw = value?.trim();
  if (!raw) return null;
  let year: number, month: number, day: number;
  const m = raw.match(DATE_ONLY);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    [year, month, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  }
  if (!Number.isInteger(year) || year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, precision: month === 1 && day === 1 ? "year" : "day" };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 8601 at the known precision: "2016" or "2016-05-12" (JSON-LD, Open Graph). */
export function isoDateAtPrecision(...candidates: Array<string | null | undefined>): string | undefined {
  for (const c of candidates) {
    const d = parsePublicationDate(c);
    if (d) return d.precision === "year" ? String(d.year) : `${d.year}-${pad(d.month)}-${pad(d.day)}`;
  }
  return undefined;
}

/** Highwire / Google Scholar form at the known precision: "2016" or "2016/05/12". */
export function scholarDateAtPrecision(...candidates: Array<string | null | undefined>): string | undefined {
  for (const c of candidates) {
    const d = parsePublicationDate(c);
    if (d) return d.precision === "year" ? String(d.year) : `${d.year}/${pad(d.month)}/${pad(d.day)}`;
  }
  return undefined;
}

/**
 * A moment as Phnom Penh local time with its offset — "2026-10-05T09:00:00+07:00"
 * (SEO Phase 4). An event's start is stored as an instant (UTC); schema.org
 * wants the local wall-clock time a visitor would read on the poster, and an
 * explicit offset so no consumer has to guess the zone. Cambodia keeps +07:00
 * all year (no daylight saving), so the offset is a constant. A date-only or
 * unparseable value is returned as given.
 */
export function phnomPenhIso(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/T\d{2}:\d{2}/.test(value)) return value;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  const local = new Date(time + 7 * 60 * 60 * 1000).toISOString().slice(0, 19);
  return `${local}+07:00`;
}

/**
 * Is a stored date the year-only placeholder an import wrote (1 January of
 * the year the record was created)? Until Phase 1 (D11) a blank year was
 * saved as the current year, so "2026" on a book imported in 2026 is most
 * likely "unknown". It flags; it never corrects.
 */
export function isPlaceholderDate(publishedAt: string | null | undefined, createdAt: string | null | undefined): boolean {
  const m = publishedAt?.match(/^(\d{4})-01-01/);
  if (!m || !createdAt) return false;
  return Number(m[1]) === new Date(createdAt).getUTCFullYear();
}

/**
 * The publication date a page may show and emit (SEO Phase 5.5): the stored
 * date, or null when it is an import placeholder — "the year alone or
 * nothing; never guess". A librarian's correction (any other date) is shown
 * as stored. docs/seo/suspect-publication-years.csv lists the records.
 */
export function trustedPublicationDate(
  publishedAt: string | null | undefined,
  createdAt: string | null | undefined,
): string | null {
  if (!publishedAt) return null;
  return isPlaceholderDate(publishedAt, createdAt) ? null : publishedAt;
}

