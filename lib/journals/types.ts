/* eslint-disable @typescript-eslint/no-explicit-any */
// Pure, browser-safe types + row mappers for journals, volumes and issues
// (migration 0148). Articles stay `Publication` (lib/publications) — the
// `publications` table was deliberately not renamed; see
// docs/JOURNALS-ARCHITECTURE.md.

export interface Journal {
  id: string;
  slug: string;
  code: string | null;
  title: string;
  title_km: string | null;
  short_title: string | null;
  description: string | null;
  description_km: string | null;
  publisher_name: string | null;
  publisher_name_km: string | null;
  issn: string | null;
  e_issn: string | null;
  print_issn: string | null;
  language: string | null;
  country: string | null;
  frequency: string | null;
  logo_url: string | null;
  cover_url: string | null;
  aims_scope: string | null;
  aims_scope_km: string | null;
  website_url: string | null;
  contact_email: string | null;
  aliases: string[];
  is_published: boolean;
  is_indexable: boolean;
  updated_at: string | null;
}

export interface JournalVolume {
  id: string;
  journal_id: string;
  volume_number: string;
  label: string | null;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  cover_url: string | null;
  description: string | null;
  is_published: boolean;
}

export interface JournalIssue {
  id: string;
  journal_id: string;
  volume_id: string | null;
  issue_number: string | null;
  issue_label: string | null;
  title: string | null;
  title_km: string | null;
  slug: string;
  published_date: string | null;
  cover_url: string | null;
  description: string | null;
  description_km: string | null;
  is_special_issue: boolean;
  is_published: boolean;
  /** Joined when the query embedded it; null for a journal without volumes. */
  volume?: JournalVolume | null;
}

export const JOURNAL_SELECT =
  "id, slug, code, title, title_km, short_title, description, description_km, " +
  "publisher_name, publisher_name_km, issn, e_issn, print_issn, language, country, " +
  "frequency, logo_url, cover_url, aims_scope, aims_scope_km, website_url, " +
  "contact_email, aliases, is_published, is_indexable, updated_at";

export const VOLUME_SELECT =
  "id, journal_id, volume_number, label, year, start_date, end_date, cover_url, description, is_published";

export const ISSUE_SELECT =
  "id, journal_id, volume_id, issue_number, issue_label, title, title_km, slug, " +
  "published_date, cover_url, description, description_km, is_special_issue, is_published";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function mapRowToJournal(row: any): Journal {
  return {
    id: row.id,
    slug: row.slug,
    code: str(row.code),
    title: row.title,
    title_km: str(row.title_km),
    short_title: str(row.short_title),
    description: str(row.description),
    description_km: str(row.description_km),
    publisher_name: str(row.publisher_name),
    publisher_name_km: str(row.publisher_name_km),
    issn: str(row.issn),
    e_issn: str(row.e_issn),
    print_issn: str(row.print_issn),
    language: str(row.language),
    country: str(row.country),
    frequency: str(row.frequency),
    logo_url: str(row.logo_url),
    cover_url: str(row.cover_url),
    aims_scope: str(row.aims_scope),
    aims_scope_km: str(row.aims_scope_km),
    website_url: str(row.website_url),
    contact_email: str(row.contact_email),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    is_published: row.is_published === true,
    is_indexable: row.is_indexable !== false,
    updated_at: row.updated_at ?? null,
  };
}

export function mapRowToVolume(row: any): JournalVolume {
  return {
    id: row.id,
    journal_id: row.journal_id,
    volume_number: row.volume_number,
    label: str(row.label),
    year: typeof row.year === "number" ? row.year : null,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    cover_url: str(row.cover_url),
    description: str(row.description),
    is_published: row.is_published !== false,
  };
}

export function mapRowToIssue(row: any): JournalIssue {
  const vol = row.journal_volumes ?? row.volume;
  return {
    id: row.id,
    journal_id: row.journal_id,
    volume_id: row.volume_id ?? null,
    issue_number: str(row.issue_number),
    issue_label: str(row.issue_label),
    title: str(row.title),
    title_km: str(row.title_km),
    slug: row.slug,
    published_date: row.published_date ?? null,
    cover_url: str(row.cover_url),
    description: str(row.description),
    description_km: str(row.description_km),
    is_special_issue: row.is_special_issue === true,
    is_published: row.is_published !== false,
    ...(vol !== undefined ? { volume: vol ? mapRowToVolume(vol) : null } : {}),
  };
}

/** The journal title in the reader's language, falling back to the English one. */
export function journalTitle(journal: Pick<Journal, "title" | "title_km">, locale: string): string {
  return locale === "km" && journal.title_km ? journal.title_km : journal.title;
}

/**
 * "Vol. 7, No. 2" / "ភាគ ៧ លេខ ២" — built from the numbers the row actually
 * carries. An issue with an admin label shows the label; a special issue with
 * only a title shows the title. Nothing is invented for a missing part.
 */
export function issueLabel(
  issue: Pick<JournalIssue, "issue_number" | "issue_label" | "title" | "title_km"> & {
    volume?: Pick<JournalVolume, "volume_number"> | null;
  },
  locale: string,
): string {
  if (issue.issue_label) return issue.issue_label;
  const vol = issue.volume?.volume_number ?? null;
  const num = issue.issue_number;
  const parts: string[] = [];
  if (locale === "km") {
    if (vol) parts.push(`ភាគ ${vol}`);
    if (num) parts.push(`លេខ ${num}`);
  } else {
    if (vol) parts.push(`Vol. ${vol}`);
    if (num) parts.push(`No. ${num}`);
  }
  if (parts.length > 0) return parts.join(locale === "km" ? " " : ", ");
  return (locale === "km" && issue.title_km) || issue.title || "";
}

/** "18 June 2025" / Khmer month names with Latin digits (the site's numerals). */
export function formatJournalDate(date: string | null | undefined, locale: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "km" ? "km-KH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** A language code as a name in the reader's language ("en" → "English"). */
export function languageName(code: string | null | undefined, locale: string): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([locale === "km" ? "km" : "en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
