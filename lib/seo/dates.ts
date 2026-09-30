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
