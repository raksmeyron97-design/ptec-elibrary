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
  JOURNAL_SELECT,
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
import { compareIssuesNewestFirst } from "@/lib/journals/order";
import { safeExternalUrl } from "@/lib/authors/links";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: JournalErrorCode };

/** Stable codes the form translates (adminJournals.error*). Never raw DB text. */
export type JournalErrorCode = "errorGeneric" | "errorTitleRequired" | "errorSlug" | "errorDuplicate" | "errorInUse";

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
  const [journals, articles] = await Promise.all([
    supabase.from("journals").select(JOURNAL_SELECT).order("title"),
    supabase.from("publications").select("journal_id, issue_id").not("journal_id", "is", null),
  ]);
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

export type AdminJournalDetail = {
  journal: Journal;
  volumes: JournalVolume[];
  issues: (JournalIssue & { articleCount: number })[];
};

export async function getJournalForAdmin(id: string): Promise<AdminJournalDetail | null> {
  const { supabase } = await requirePermission("publications", "read");
  const [journal, volumes, issues, articles] = await Promise.all([
    supabase.from("journals").select(JOURNAL_SELECT).eq("id", id).maybeSingle(),
    supabase.from("journal_volumes").select(VOLUME_SELECT).eq("journal_id", id),
    supabase
      .from("journal_issues")
      .select(`${ISSUE_SELECT}, journal_volumes!journal_issues_volume_in_journal(${VOLUME_SELECT})`)
      .eq("journal_id", id),
    supabase.from("publications").select("issue_id").eq("journal_id", id).not("issue_id", "is", null),
  ]);
  if (!journal.data) return null;
  const counts = new Map<string, number>();
  for (const r of (articles.data ?? []) as { issue_id: string }[]) counts.set(r.issue_id, (counts.get(r.issue_id) ?? 0) + 1);
  return {
    journal: mapRowToJournal(journal.data),
    volumes: (volumes.data ?? []).map(mapRowToVolume),
    issues: (issues.data ?? [])
      .map(mapRowToIssue)
      .sort(compareIssuesNewestFirst)
      .map((i) => ({ ...i, articleCount: counts.get(i.id) ?? 0 })),
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
};

const opt = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

function normalizeInput(input: JournalInput): { row: Record<string, unknown> } | { error: JournalErrorCode } {
  const title = journalCleanName(input.title);
  if (!title) return { error: "errorTitleRequired" };
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
    },
  };
}

export async function createJournal(input: JournalInput): Promise<Result<{ id: string }>> {
  const { supabase, userId } = await requireAction("journals.create");
  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };
  const { data, error } = await supabase.from("journals").insert(normalized.row).select("id, slug").single();
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
  const { data, error } = await supabase.from("journals").update(normalized.row).eq("id", id).select("id, slug");
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
