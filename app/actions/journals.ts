"use server";

// Admin reads and writes for journals, volumes and issues (migration 0148).
//
// Authorization is the `publications` resource — journals are the shelf the
// articles sit on, not a separate grant — through the action registry
// (lib/admin/access-policy.ts: journals.create / journals.edit /
// journals.delete). Every function guards before it opens the service client.
//
// What these actions deliberately do NOT do: create a journal from an
// article's text, merge two journals, or move articles between them. Mapping
// is the database trigger's job and is deterministic; a wrong mapping is
// fixed by editing the journal's title/aliases or the article's journal name,
// both of which re-run that same rule.

import { requirePermission } from "@/lib/auth/requireAdmin";
import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { revalidateJournals } from "@/lib/cache/revalidate";
import {
  ISSUE_SELECT,
  JOURNAL_PROFILE_COLUMNS,
  JOURNAL_SELECT,
  JOURNAL_SELECT_BASE,
  VOLUME_SELECT,
  mapRowToIssue,
  mapRowToJournal,
  mapRowToVolume,
  type Journal,
  type JournalIssue,
  type JournalVolume,
} from "@/lib/journals/types";
import { journalCleanName, journalMatchKey, type JournalMappingStatus } from "@/lib/journals/mapping";
import { RESERVED_JOURNAL_SLUGS } from "@/lib/journals/urls";
import { isValidIssn, normalizeIssn } from "@/lib/seo/identifiers";
import { compareIssuesNewestFirst } from "@/lib/journals/order";
import { safeExternalUrl } from "@/lib/authors/links";
import { isMissingColumn } from "@/lib/journals/data";
import { lookupJournalByIssn } from "@/lib/journals/lookup-server";
import type { JournalLookupResult } from "@/lib/journals/lookup";
import {
  isAccessModel,
  isIndexServiceId,
  isLicenseId,
  isMetadataSource,
  isPeerReviewType,
  isTitleKmSource,
} from "@/lib/journals/vocab";
import { compareArticlesInIssue } from "@/lib/journals/order";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: JournalErrorCode };

/** Stable codes the form translates (adminJournals.error*). Never raw DB text. */
export type JournalErrorCode =
  | "errorGeneric"
  | "errorTitleRequired"
  | "errorSlug"
  | "errorDuplicate"
  | "errorInUse"
  /** A value outside the closed vocabularies in lib/journals/vocab.ts. */
  | "errorInvalidValue"
  /** The page was stale: the issue's articles changed since it was loaded. */
  | "errorStale"
  /** The 0166 columns are not in this database yet (the deploy window). */
  | "errorSchemaPending"
  | "errorIssnInvalid";

const SLUG_RE = /^[\p{Ll}\p{Lo}\p{M}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{M}\p{N}]+)*$/u;

function codeFor(error: { code?: string; message?: string } | null | undefined): JournalErrorCode {
  if (!error) return "errorGeneric";
  if (error.code === "23505") return "errorDuplicate";
  if (error.code === "23503") return "errorInUse";
  if (error.code === "23514") return "errorSlug";
  return "errorGeneric";
}

export type AdminJournalRow = Journal & { articleCount: number; issueCount: number };

export async function listJournalsForAdmin(): Promise<{ data: AdminJournalRow[]; error: string | null }> {
  const { supabase } = await requirePermission("publications", "read");
  const [first, articles] = await Promise.all([
    supabase.from("journals").select(JOURNAL_SELECT).order("title"),
    supabase.from("publications").select("journal_id, issue_id").not("journal_id", "is", null),
  ]);
  const journals = isMissingColumn(first.error)
    ? await supabase.from("journals").select(JOURNAL_SELECT_BASE).order("title")
    : first;
  if (journals.error) return { data: [], error: journals.error.message };
  const counts = new Map<string, { a: number; i: Set<string> }>();
  for (const r of (articles.data ?? []) as { journal_id: string; issue_id: string | null }[]) {
    const c = counts.get(r.journal_id) ?? { a: 0, i: new Set<string>() };
    c.a += 1;
    if (r.issue_id) c.i.add(r.issue_id);
    counts.set(r.journal_id, c);
  }
  return {
    data: (journals.data ?? []).map((row) => {
      const j = mapRowToJournal(row);
      return { ...j, articleCount: counts.get(j.id)?.a ?? 0, issueCount: counts.get(j.id)?.i.size ?? 0 };
    }),
    error: null,
  };
}

/** Every journal title and alias, for the article editor's journal-name suggestions. */
export async function journalNameOptions(): Promise<string[]> {
  const { supabase } = await requirePermission("publications", "read");
  const { data } = await supabase.from("journals").select("title, aliases");
  const names = new Set<string>();
  for (const j of (data ?? []) as { title: string; aliases: string[] | null }[]) {
    names.add(j.title);
    for (const a of j.aliases ?? []) names.add(a);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** One article as the issue editor lists it — enough to order a table of contents. */
export type AdminIssueArticle = {
  id: string;
  slug: string;
  title: string;
  page_start: string | null;
  page_end: string | null;
  article_no: string | null;
  publication_date: string | null;
  issue_position: number | null;
  is_published: boolean;
};

export type AdminJournalDetail = {
  journal: Journal;
  volumes: JournalVolume[];
  issues: (JournalIssue & { articleCount: number; articles: AdminIssueArticle[] })[];
  /** Published articles in the journal — the readiness panel's indexing rule. */
  publishedArticleCount: number;
};

const ADMIN_ARTICLE_COLUMNS = "id, slug, title, issue_id, page_start, page_end, article_no, publication_date, is_published";

export async function getJournalForAdmin(id: string): Promise<AdminJournalDetail | null> {
  const { supabase } = await requirePermission("publications", "read");
  const [first, volumes, issues, articlesFirst] = await Promise.all([
    supabase.from("journals").select(JOURNAL_SELECT).eq("id", id).maybeSingle(),
    supabase.from("journal_volumes").select(VOLUME_SELECT).eq("journal_id", id),
    supabase
      .from("journal_issues")
      .select(`${ISSUE_SELECT}, journal_volumes!journal_issues_volume_in_journal(${VOLUME_SELECT})`)
      .eq("journal_id", id),
    supabase.from("publications").select(`${ADMIN_ARTICLE_COLUMNS}, issue_position`).eq("journal_id", id),
  ]);
  const journal = isMissingColumn(first.error)
    ? await supabase.from("journals").select(JOURNAL_SELECT_BASE).eq("id", id).maybeSingle()
    : first;
  const articles = isMissingColumn(articlesFirst.error)
    ? await supabase.from("publications").select(ADMIN_ARTICLE_COLUMNS).eq("journal_id", id)
    : articlesFirst;
  if (!journal.data) return null;

  const byIssue = new Map<string, AdminIssueArticle[]>();
  let publishedArticleCount = 0;
  for (const r of (articles.data ?? []) as (Omit<AdminIssueArticle, "issue_position"> & {
    issue_id: string | null;
    issue_position?: number | null;
  })[]) {
    if (r.is_published) publishedArticleCount += 1;
    if (!r.issue_id) continue;
    const list = byIssue.get(r.issue_id) ?? [];
    list.push({ ...r, issue_position: r.issue_position ?? null });
    byIssue.set(r.issue_id, list);
  }
  return {
    journal: mapRowToJournal(journal.data),
    volumes: (volumes.data ?? []).map(mapRowToVolume),
    issues: (issues.data ?? [])
      .map(mapRowToIssue)
      .sort(compareIssuesNewestFirst)
      .map((i) => {
        const list = (byIssue.get(i.id) ?? []).sort(compareArticlesInIssue);
        return { ...i, articleCount: list.length, articles: list };
      }),
    publishedArticleCount,
  };
}

export type MappingReportRow = {
  id: string;
  slug: string;
  is_published: boolean;
  journal_name: string | null;
  volume: string | null;
  issue_no: string | null;
  mapping_status: JournalMappingStatus;
};

/** journal_mapping_report (0148) — every article that is NOT cleanly mapped, plus the totals. */
export async function getJournalMappingReport(): Promise<{
  counts: Record<JournalMappingStatus, number>;
  problems: MappingReportRow[];
  error: string | null;
}> {
  const { supabase } = await requirePermission("publications", "read");
  const { data, error } = await supabase
    .from("journal_mapping_report")
    .select("id, slug, is_published, journal_name, volume, issue_no, mapping_status");
  const counts: Record<JournalMappingStatus, number> = {
    mapped: 0, partial: 0, invalid: 0, ambiguous: 0, unmapped: 0, no_journal: 0,
  };
  if (error) return { counts, problems: [], error: error.message };
  const rows = (data ?? []) as MappingReportRow[];
  for (const r of rows) counts[r.mapping_status] = (counts[r.mapping_status] ?? 0) + 1;
  return {
    counts,
    problems: rows
      .filter((r) => r.mapping_status !== "mapped" && r.mapping_status !== "no_journal")
      .sort((a, b) => (a.journal_name ?? "").localeCompare(b.journal_name ?? "") || a.slug.localeCompare(b.slug)),
    error: null,
  };
}

export type JournalInput = {
  title: string;
  title_km?: string | null;
  short_title?: string | null;
  slug: string;
  code?: string | null;
  aliases?: string[];
  description?: string | null;
  description_km?: string | null;
  aims_scope?: string | null;
  aims_scope_km?: string | null;
  publisher_name?: string | null;
  publisher_name_km?: string | null;
  issn?: string | null;
  e_issn?: string | null;
  print_issn?: string | null;
  language?: string | null;
  country?: string | null;
  frequency?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  cover_url?: string | null;
  is_published: boolean;
  is_indexable: boolean;
  // ── 0166 profile ──
  title_km_source?: string | null;
  access_model?: string | null;
  default_license?: string | null;
  peer_review?: string | null;
  indexed_in?: string[];
  start_year?: number | string | null;
  subjects?: string[];
  issn_l?: string | null;
  author_guidelines_url?: string | null;
  editorial_board_url?: string | null;
  metadata_source?: string | null;
};

/** The 0166 column names, for writing a row to a database that predates them. */
const PROFILE_KEYS = JOURNAL_PROFILE_COLUMNS.split(",").map((k) => k.trim());

const opt = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

function normalizeInput(input: JournalInput): { row: Record<string, unknown> } | { error: JournalErrorCode } {
  const title = journalCleanName(input.title);
  if (!title) return { error: "errorTitleRequired" };
  const normalizedProfile = normalizeProfile(input);
  if ("error" in normalizedProfile) return { error: normalizedProfile.error };
  const { profile } = normalizedProfile;
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.length > 120 || (RESERVED_JOURNAL_SLUGS as readonly string[]).includes(slug)) {
    return { error: "errorSlug" };
  }
  // Aliases: cleaned, de-duplicated by match key, and never the title itself.
  const titleKey = journalMatchKey(title);
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const a of input.aliases ?? []) {
    const clean = journalCleanName(a);
    const key = journalMatchKey(clean);
    if (!clean || !key || key === titleKey || seen.has(key)) continue;
    seen.add(key);
    aliases.push(clean);
  }
  return {
    row: {
      title,
      slug,
      aliases,
      title_km: opt(input.title_km),
      short_title: opt(input.short_title),
      code: opt(input.code),
      description: opt(input.description),
      description_km: opt(input.description_km),
      aims_scope: opt(input.aims_scope),
      aims_scope_km: opt(input.aims_scope_km),
      publisher_name: opt(input.publisher_name),
      publisher_name_km: opt(input.publisher_name_km),
      // Stored as entered; only a check-digit-valid ISSN is ever PUBLISHED
      // (lib/seo/journal-seo.ts), and the form warns about the rest.
      issn: opt(input.issn),
      e_issn: opt(input.e_issn),
      print_issn: opt(input.print_issn),
      language: opt(input.language),
      country: opt(input.country),
      frequency: opt(input.frequency),
      website_url: safeExternalUrl(input.website_url),
      contact_email: opt(input.contact_email),
      cover_url: opt(input.cover_url),
      is_published: !!input.is_published,
      is_indexable: !!input.is_indexable,
      ...profile,
    },
  };
}

/**
 * The 0166 profile fields, validated against the closed vocabularies. Empty
 * means unknown (NULL / empty array) — never a default the page would then
 * publish as a fact.
 */
function normalizeProfile(input: JournalInput): { profile: Record<string, unknown> } | { error: JournalErrorCode } {
  const enumOrNull = (v: string | null | undefined, ok: (x: unknown) => boolean) => {
    const t = opt(v);
    if (t === null) return { value: null };
    return ok(t) ? { value: t } : null;
  };
  const titleKmSource = enumOrNull(input.title_km_source, isTitleKmSource);
  const access = enumOrNull(input.access_model, isAccessModel);
  const review = enumOrNull(input.peer_review, isPeerReviewType);
  const license = enumOrNull(input.default_license, isLicenseId);
  const source = enumOrNull(input.metadata_source, isMetadataSource);
  if (!titleKmSource || !access || !review || !license || !source) return { error: "errorInvalidValue" };

  const indexed = [...new Set(input.indexed_in ?? [])];
  if (!indexed.every(isIndexServiceId)) return { error: "errorInvalidValue" };

  const yearText = String(input.start_year ?? "").trim();
  const year = yearText === "" ? null : Number(yearText);
  if (year !== null && (!Number.isInteger(year) || year < 1600 || year > 2100)) return { error: "errorInvalidValue" };

  const subjects = [...new Set((input.subjects ?? []).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 20);
  const issnL = opt(input.issn_l);
  if (issnL && !isValidIssn(issnL)) return { error: "errorIssnInvalid" };

  return {
    profile: {
      // A Khmer title with no stated source is read as a translation; storing
      // the source only when there is a Khmer title keeps the two consistent.
      title_km_source: opt(input.title_km) ? titleKmSource.value : null,
      access_model: access.value,
      default_license: license.value,
      peer_review: review.value,
      indexed_in: indexed,
      start_year: year,
      subjects,
      issn_l: issnL ? normalizeIssn(issnL) : null,
      author_guidelines_url: safeExternalUrl(input.author_guidelines_url),
      editorial_board_url: safeExternalUrl(input.editorial_board_url),
      metadata_source: source.value,
    },
  };
}

/**
 * What to tell the librarian when 0166 has not reached this database: if any
 * new field holds a value, the save cannot keep it ("errorSchemaPending");
 * otherwise the caller may retry without the new columns.
 */
function profileWriteError(row: Record<string, unknown>): JournalErrorCode {
  const set = PROFILE_KEYS.some((k) => {
    const v = row[k];
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined;
  });
  return set ? "errorSchemaPending" : "errorGeneric";
}

/** A write failed because 0166 has not reached this database. */
function withoutProfile(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !PROFILE_KEYS.includes(k)));
}

export async function createJournal(input: JournalInput): Promise<Result<{ id: string }>> {
  const { supabase, userId } = await requireAction("journals.create");
  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };
  const { data, error } = await supabase.from("journals").insert(normalized.row).select("id, slug").single();
  if (isMissingColumn(error)) return { ok: false, error: profileWriteError(normalized.row) };
  if (error || !data) return { ok: false, error: codeFor(error) };
  // Articles already naming this journal (or an alias) are mapped now.
  await remapUnmapped(supabase);
  await logAdminAction(userId, "journal_create", "journals", data.id, { slug: data.slug });
  revalidateJournals(data.slug);
  return { ok: true, data: { id: data.id } };
}

export async function updateJournal(id: string, input: JournalInput): Promise<Result> {
  const { supabase, userId } = await requireAction("journals.edit");
  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };
  const { data: before } = await supabase.from("journals").select("slug").eq("id", id).maybeSingle();
  let { data, error } = await supabase.from("journals").update(normalized.row).eq("id", id).select("id, slug");
  if (isMissingColumn(error)) {
    // Before 0166 lands: save what this database can hold, but only when the
    // librarian set none of the new fields — otherwise say why it failed.
    if (profileWriteError(normalized.row) !== "errorSchemaPending") {
      ({ data, error } = await supabase.from("journals").update(withoutProfile(normalized.row)).eq("id", id).select("id, slug"));
    } else {
      return { ok: false, error: "errorSchemaPending" };
    }
  }
  if (error) return { ok: false, error: codeFor(error) };
  if (!data || data.length === 0) return { ok: false, error: "errorGeneric" };
  await remapUnmapped(supabase);
  await logAdminAction(userId, "journal_update", "journals", id, { slug: data[0].slug });
  revalidateJournals(data[0].slug);
  if (before?.slug && before.slug !== data[0].slug) revalidateJournals(before.slug);
  return { ok: true, data: undefined };
}

export async function deleteJournal(id: string): Promise<Result> {
  const { supabase, userId } = await requireAction("journals.delete");
  // publications.journal_id is ON DELETE RESTRICT: a journal that still holds
  // articles cannot be deleted, and the error says so (errorInUse).
  const { data, error } = await supabase.from("journals").delete().eq("id", id).select("id, slug");
  if (error) return { ok: false, error: codeFor(error) };
  if (!data || data.length === 0) return { ok: false, error: "errorGeneric" };
  await logAdminAction(userId, "journal_delete", "journals", id, { slug: data[0].slug });
  revalidateJournals(data[0].slug);
  return { ok: true, data: undefined };
}

export type IssueInput = {
  title?: string | null;
  title_km?: string | null;
  issue_label?: string | null;
  published_date?: string | null;
  description?: string | null;
  description_km?: string | null;
  cover_url?: string | null;
  is_special_issue: boolean;
  is_published: boolean;
};

/** Issue details. Numbers are not editable here: they come from the articles. */
export async function updateJournalIssue(issueId: string, input: IssueInput): Promise<Result> {
  const { supabase, userId } = await requireAction("journals.edit");
  const date = opt(input.published_date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "errorGeneric" };
  const { data, error } = await supabase
    .from("journal_issues")
    .update({
      title: opt(input.title),
      title_km: opt(input.title_km),
      issue_label: opt(input.issue_label),
      published_date: date,
      description: opt(input.description),
      description_km: opt(input.description_km),
      cover_url: opt(input.cover_url),
      is_special_issue: !!input.is_special_issue,
      is_published: !!input.is_published,
    })
    .eq("id", issueId)
    .select("id, journal_id, journals(slug)");
  if (error) return { ok: false, error: codeFor(error) };
  if (!data || data.length === 0) return { ok: false, error: "errorGeneric" };
  await logAdminAction(userId, "journal_issue_update", "journal_issues", issueId);
  const slug = (data[0] as { journals?: { slug?: string } | null }).journals?.slug ?? null;
  revalidateJournals(slug);
  return { ok: true, data: undefined };
}

export async function updateJournalVolume(volumeId: string, input: { year: number | null; label: string | null }): Promise<Result> {
  const { supabase, userId } = await requireAction("journals.edit");
  if (input.year !== null && (!Number.isInteger(input.year) || input.year < 1800 || input.year > 2200)) {
    return { ok: false, error: "errorGeneric" };
  }
  const { data, error } = await supabase
    .from("journal_volumes")
    .update({ year: input.year, label: opt(input.label) })
    .eq("id", volumeId)
    .select("id, journals(slug)");
  if (error) return { ok: false, error: codeFor(error) };
  if (!data || data.length === 0) return { ok: false, error: "errorGeneric" };
  await logAdminAction(userId, "journal_volume_update", "journal_volumes", volumeId);
  revalidateJournals((data[0] as { journals?: { slug?: string } | null }).journals?.slug ?? null);
  return { ok: true, data: undefined };
}

/**
 * Map every still-unmapped article whose journal name now resolves — after a
 * journal is created, renamed or gains an alias. This is 0148's own
 * `journal_remap_unmapped()`, the function the migration's backfill runs:
 * nothing here decides a mapping itself.
 */
async function remapUnmapped(supabase: Awaited<ReturnType<typeof requireAction>>["supabase"]) {
  const { error } = await supabase.rpc("journal_remap_unmapped");
  if (error) console.warn("[journals] remap after save failed:", error.message);
}

/**
 * Ask Crossref and the ISSN Portal what they hold for an ISSN. Read-only:
 * nothing is written — the form shows the answer as suggestions the librarian
 * accepts field by field (decision 2026-10-02).
 */
export async function lookupJournal(issn: string): Promise<Result<JournalLookupResult>> {
  await requireAction("journals.create");
  const result = await lookupJournalByIssn(issn);
  if (!result) return { ok: false, error: "errorIssnInvalid" };
  return { ok: true, data: result };
}

/**
 * Teach a journal another name an article uses (the mapping report's "add as
 * alias"), then let 0148's own rule map whatever now resolves. The alias goes
 * through the same cleaning and de-duplication as the form's alias list.
 */
export async function addJournalAlias(journalId: string, name: string): Promise<Result<{ mapped: number }>> {
  const { supabase, userId } = await requireAction("journals.edit");
  const clean = journalCleanName(name);
  const key = journalMatchKey(clean);
  if (!clean || !key) return { ok: false, error: "errorGeneric" };
  const { data: row, error: readError } = await supabase
    .from("journals")
    .select("id, slug, title, aliases")
    .eq("id", journalId)
    .maybeSingle();
  if (readError || !row) return { ok: false, error: "errorGeneric" };
  const current = (row.aliases ?? []) as string[];
  if (journalMatchKey(row.title) === key || current.some((a) => journalMatchKey(a) === key)) {
    return { ok: true, data: { mapped: 0 } };
  }
  const { data, error } = await supabase
    .from("journals")
    .update({ aliases: [...current, clean] })
    .eq("id", journalId)
    .select("id");
  if (error) return { ok: false, error: codeFor(error) };
  if (!data || data.length === 0) return { ok: false, error: "errorGeneric" };
  const { data: mapped, error: remapError } = await supabase.rpc("journal_remap_unmapped");
  if (remapError) console.warn("[journals] remap after alias failed:", remapError.message);
  await logAdminAction(userId, "journal_alias_add", "journals", journalId, { slug: row.slug });
  revalidateJournals(row.slug);
  return { ok: true, data: { mapped: typeof mapped === "number" ? mapped : 0 } };
}

/**
 * Set an issue's table-of-contents order in one statement
 * (set_issue_article_order, 0166). The order must name exactly the articles
 * in the issue now; a stale page is refused (40001 → errorStale) and nothing
 * changes.
 */
export async function reorderIssueArticles(issueId: string, articleIds: string[]): Promise<Result> {
  const { supabase, userId } = await requireAction("journals.edit");
  if (articleIds.length === 0 || new Set(articleIds).size !== articleIds.length) return { ok: false, error: "errorStale" };
  const { error } = await supabase.rpc("set_issue_article_order", { p_issue: issueId, p_ids: articleIds });
  if (error) {
    if (error.code === "40001" || /issue_set_changed/.test(error.message ?? "")) return { ok: false, error: "errorStale" };
    if (error.code === "42883" || error.code === "PGRST202") return { ok: false, error: "errorSchemaPending" };
    return { ok: false, error: codeFor(error) };
  }
  const { data: issue } = await supabase.from("journal_issues").select("id, journals(slug)").eq("id", issueId).maybeSingle();
  await logAdminAction(userId, "journal_issue_reorder", "journal_issues", issueId, { count: articleIds.length });
  revalidateJournals((issue as { journals?: { slug?: string } | null } | null)?.journals?.slug ?? null);
  return { ok: true, data: undefined };
}
