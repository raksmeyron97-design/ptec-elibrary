"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidateLocalizedPath as revalidatePath, revalidateThesis } from "@/lib/cache/revalidate";
import { after } from "next/server";
import { headers } from "next/headers";
import { zimaDelete } from "@/lib/zima";
import { createAdminNotification } from "@/lib/admin-notifications";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { indexPdfPagesSafe } from "@/lib/pdf-page-index";
import { logAdminAction } from "@/app/actions/audit";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeStatus, slugify, type ThesisStatus } from "@/lib/admin/theses-shared";
import { validateThesisPublish, firstValidationError } from "@/lib/admin/thesis-validation";
import { isGenericThesisTitle } from "@/lib/seo/thesis-seo";
import { logContentView } from "@/lib/analytics/events";


// Admin-side paths only; public tags/paths/counters are handled by the
// central revalidateThesis() helper — see revalidateAllTheses() below.
const REVALIDATE_PATHS = [
  "/admin/theses",
  "/theses/summary",
];

/** Every thesis mutation goes through here: busts the research_reports +
 *  collection-stats tags, the /theses listing (both locales), the homepage
 *  shelf, and the admin paths above. */
function revalidateAllTheses() {
  revalidateThesis();
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

/** Best-effort request metadata for audit logs — never blocks the action. */
async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    return { ip, userAgent: h.get("user-agent") ?? undefined };
  } catch {
    return {};
  }
}

async function enforceRateLimit(userId: string) {
  const { success } = await rateLimit(`thesis-mutate:${userId}`, 30, 60_000);
  if (!success) throw new Error("Too many changes — please wait a moment and try again.");
}

/** Strip PostgREST filter metacharacters before building .or(...) strings. */
function sanitizeSearchTerm(input: string): string {
  return input
    .replace(/[%,()\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// Server actions are callable with arbitrary JSON — the ThesisData interface
// only exists at compile time. Whitelist columns so extra keys (view_count,
// verified_at, …) can never reach the insert/update.
const THESIS_FIELDS = [
  "title", "slug", "abstract", "program", "faculty", "subject", "cohort",
  "academic_year", "author_names", "advisor_name", "co_advisor_name",
  "cover_url", "cover_alt_text", "file_url", "file_size_kb", "content_hash",
  "supplementary_files", "license", "is_published", "status", "scheduled_at",
  "keywords", "doi", "published_at", "defense_date", "submitted_date",
  "references", "thesis_type", "language", "seo_title", "seo_description",
  "og_image",
] as const satisfies readonly (keyof ThesisData)[];

function sanitizeThesisData(formData: ThesisData, { requireCore = false } = {}): { data?: Partial<ThesisData>; error?: string } {
  const data: Record<string, unknown> = {};
  for (const key of THESIS_FIELDS) {
    if (key in formData) data[key] = formData[key];
  }
  if (requireCore && !(typeof data.title === "string" && data.title.trim())) {
    return { error: "Title is required" };
  }
  if (data.published_at) {
    const year = new Date(String(data.published_at)).getFullYear();
    const current = new Date().getFullYear();
    if (Number.isNaN(year) || year < 1900 || year > current + 1) {
      return { error: `Publication year must be between 1900 and ${current + 1}` };
    }
  }
  if (typeof data.status === "string") data.status = normalizeStatus(data.status);
  return { data: data as Partial<ThesisData> };
}

/** Blocks the transition to published/scheduled when required fields (spec §26) are missing. */
function checkPublishReady(merged: Partial<ThesisData>): string | null {
  if (merged.status !== "published" && merged.status !== "scheduled") return null;
  // A generic title ("Report" / "របាយការណ៍" / "Thesis") is too weak for academic
  // discovery. Block publication unless an authorized admin has recorded that
  // the official title was verified against the source document.
  if (
    isGenericThesisTitle(merged.title as string) &&
    !(merged as { official_title_verified?: boolean }).official_title_verified
  ) {
    return 'This title is too generic for an academic record (e.g. "Report", "Thesis", "របាយការណ៍"). Enter the thesis’s official title, or mark the official title as verified to publish an exception.';
  }
  const errors = validateThesisPublish({
    title: (merged.title as string) ?? "",
    slug: (merged.slug as string) ?? "",
    program: (merged.program as string) ?? null,
    cohort: (merged.cohort as string) ?? null,
    academicYear: (merged.academic_year as string) ?? null,
    authorNames: (merged.author_names as string) ?? null,
    advisorName: (merged.advisor_name as string) ?? null,
    fileUrl: (merged.file_url as string) ?? null,
    coverUrl: (merged.cover_url as string) ?? null,
    abstract: (merged.abstract as string) ?? null,
    keywords: (merged.keywords as string[]) ?? [],
    references: (merged.references as string) ?? null,
    license: (merged.license as string) ?? null,
  });
  return firstValidationError(errors);
}

async function uniqueThesisSlug(supabase: ReturnType<typeof createServiceClient>, base: string, ignoreId?: string): Promise<string> {
  let slug = base || "thesis";
  let n = 1;
  while (true) {
    const { data } = await supabase.from("research_reports").select("id").eq("slug", slug).limit(1);
    const taken = (data ?? []).some((r: { id: string }) => r.id !== ignoreId);
    if (!taken) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/** Server Action wrapper for the client-side live-availability check. */
export async function checkThesisSlugAvailable(slug: string, ignoreId?: string): Promise<boolean> {
  const clean = slugify(slug);
  if (!clean) return false;
  const supabase = createServiceClient();
  const { data } = await supabase.from("research_reports").select("id").eq("slug", clean).limit(1);
  return !(data ?? []).some((r: { id: string }) => r.id !== ignoreId);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThesisData {
  title: string;
  slug?: string;
  abstract: string;
  program?: string | null;
  faculty?: string | null;
  subject?: string | null;
  cohort?: string | null;
  academic_year?: string | null;
  author_names?: string | null;
  advisor_name?: string | null;
  co_advisor_name?: string | null;
  cover_url?: string | null;
  cover_alt_text?: string | null;
  file_url?: string | null;
  file_size_kb?: number | null;
  content_hash?: string | null;
  supplementary_files?: { url: string; filename: string; mimeType: string; size: number; description?: string }[];
  license?: string | null;
  is_published?: boolean;
  status?: ThesisStatus;
  scheduled_at?: string | null;
  keywords?: string[];
  doi?: string | null;
  published_at?: string | null;
  defense_date?: string | null;
  submitted_date?: string | null;
  references?: string | null;
  thesis_type?: string | null;
  language?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image?: string | null;
}

export interface ThesisCohort {
  id: string;
  program_code: string;
  number: number;
  label: string | null;
  sort_order: number;
  created_at: string;
}

export interface ThesisAcademicYear {
  id: string;
  cohort_id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export interface ThesisProgram {
  id: string;
  code: string;
  name_en: string;
  name_km: string;
  duration_years: number;
  has_faculty: boolean;
  sort_order: number;
  created_at: string;
}

export interface ThesisFaculty {
  id: string;
  program_code: string;
  code: string;
  name_en: string;
  name_km: string;
  has_subject: boolean;
  sort_order: number;
  created_at: string;
}

// ── Thesis queries ─────────────────────────────────────────────────────────────

export async function getTheses({
  departmentId,
  program,
  faculty,
  cohort,
  academicYear,
  q,
  publishedOnly = true,
}: {
  departmentId?: string;
  program?: string;
  faculty?: string;
  cohort?: string;
  academicYear?: string;
  q?: string;
  publishedOnly?: boolean;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("research_reports")
    .select(`*, departments(name)`)
    .order("created_at", { ascending: false });

  if (publishedOnly) {
    query = query.eq("is_published", true);
  }

  if (departmentId) {
    query = query.eq("department_id", departmentId);
  }

  if (program) {
    query = query.eq("program", program);
  }

  if (faculty) {
    query = query.eq("faculty", faculty);
  }

  if (cohort) {
    query = query.eq("cohort", cohort);
  }

  if (academicYear) {
    query = query.eq("academic_year", academicYear);
  }

  const term = q ? sanitizeSearchTerm(q) : "";
  if (term) {
    const { data: kwMatches } = await supabase
      .from("research_reports")
      .select("id")
      .filter("keywords::text", "ilike", `%${term}%`)
      .eq("is_published", true);

    const kwIds = kwMatches?.map(r => r.id) ?? [];

    let orStr = `title.ilike.%${term}%,author_names.ilike.%${term}%,advisor_name.ilike.%${term}%,doi.ilike.%${term}%`;
    if (kwIds.length > 0) {
      orStr += `,id.in.(${kwIds.join(",")})`;
    }
    query = query.or(orStr);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching theses:", error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getThesisById(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("research_reports")
    .select(`*, departments(name)`)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching thesis:", error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getThesisBySlug(slug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("research_reports")
    .select(`*, departments(name)`)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Error fetching thesis by slug:", error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function incrementThesisViewCount(id: string) {
  // The lifetime counter stays signed-in-only (spam-resistant public badge);
  // view_logs analytics record every human visitor — anonymous included,
  // bot-filtered and rate-limited inside logContentView.
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  let error: { message: string } | null = null;
  if (user) {
    const supabase = createServiceClient();
    ({ error } = await supabase.rpc("increment_research_view_count", { row_id: id }));
  }

  await logContentView("research_report", id);
  if (error) {
    console.error("Failed to increment view count:", error);
  }
}

export async function incrementThesisDownloadCount(id: string) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return;

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("increment_research_download_count", { row_id: id });
  if (error) {
    console.error("Failed to increment download count:", error);
  }

  // Timestamped log so thesis downloads appear in period analytics.
  // Best-effort: the content columns arrive with migration 0072 — until it
  // is applied this insert fails harmlessly and only the counter above runs.
  const { error: logError } = await supabase.from("download_logs").insert({
    content_type: "research_report",
    content_id: id,
    user_id: user.id,
  });
  if (logError) {
    console.warn("[incrementThesisDownloadCount] download_logs insert skipped:", logError.message);
  }
}

export async function toggleThesisPublishStatus(id: string, isPublished: boolean) {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const updatePayload: { is_published: boolean; published_at?: string } = { is_published: isPublished };

  if (isPublished) {
    const { data } = await supabase
      .from("research_reports")
      .select("title, slug, program, cohort, academic_year, author_names, advisor_name, file_url, cover_url, abstract, keywords, references, license, published_at")
      .eq("id", id)
      .single();
    if (!data) return { success: false, error: "Thesis not found" };

    const publishError = checkPublishReady({ ...data, status: "published" });
    if (publishError) return { success: false, error: publishError };

    if (!data.published_at) {
      updatePayload.published_at = new Date().toISOString();
    }
  }

  const { error } = await supabase
    .from("research_reports")
    .update(updatePayload)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  const meta = await requestMeta();
  await logAdminAction(admin.user.id, isPublished ? "thesis.publish" : "thesis.unpublish", "research_reports", id, meta);

  revalidateAllTheses();
  return { success: true };
}

export async function createThesis(formData: ThesisData) {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }

  const { supabase } = admin;
  const sanitized = sanitizeThesisData(formData, { requireCore: true });
  if (sanitized.error || !sanitized.data) {
    return { success: false, error: sanitized.error ?? "Invalid thesis data" };
  }

  const slugBase = slugify(formData.slug || formData.title);
  const slug = await uniqueThesisSlug(supabase, slugBase);
  sanitized.data.slug = slug;

  const publishError = checkPublishReady(sanitized.data);
  if (publishError) return { success: false, error: publishError };

  const { data: created, error } = await supabase.from("research_reports").insert([{
    ...sanitized.data,
    keywords: formData.keywords ?? [],
  }]).select("id").single();

  if (error) {
    return { success: false, error: error.message };
  }

  const meta = await requestMeta();
  await logAdminAction(admin.user.id, "thesis.create", "research_reports", created?.id, { title: formData.title, status: sanitized.data.status, ...meta });

  await createAdminNotification("new_report", `New thesis: "${formData.title}"`, undefined, "/theses");
  revalidateAllTheses();

  // Full-text page indexing (book_pages) — background, non-blocking, log-only on failure.
  if (created?.id && formData.file_url) {
    const fileUrl = formData.file_url;
    after(() => indexPdfPagesSafe("research", created.id, fileUrl));
  }

  return { success: true, id: created?.id as string | undefined };
}

export async function deleteThesis(id: string) {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  // Fetch URLs before deleting so we can clean up R2 afterwards
  const { data: row } = await supabase
    .from("research_reports")
    .select("title, file_url, cover_url")
    .eq("id", id)
    .single();

  await supabase.from("view_logs").delete().eq("content_type", "research_report").eq("content_id", id);
  // Full-text page index + chunk embeddings (no FK — polymorphic record_id, migrations 0066/0082)
  await supabase.from("book_pages").delete().eq("record_type", "research").eq("record_id", id);
  await supabase.from("book_chunks").delete().eq("record_type", "research").eq("record_id", id);

  const { error } = await supabase.from("research_reports").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Best-effort Zima cleanup (non-fatal — DB row is already gone)
  for (const url of [row?.file_url, row?.cover_url]) {
    if (url) await zimaDelete(url as string).catch(() => null);
  }

  const meta = await requestMeta();
  await logAdminAction(admin.user.id, "thesis.delete", "research_reports", id, { title: row?.title, ...meta });

  revalidateAllTheses();
  return { success: true };
}

export async function updateThesis(id: string, formData: ThesisData) {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }

  const { supabase } = admin;

  const sanitized = sanitizeThesisData(formData);
  if (sanitized.error || !sanitized.data) {
    return { success: false, error: sanitized.error ?? "Invalid thesis data" };
  }

  // Detect a new/replaced PDF so we can re-run full-text indexing below.
  const { data: before } = await supabase
    .from("research_reports")
    .select("file_url")
    .eq("id", id)
    .single();

  if (typeof formData.slug === "string") {
    const slugBase = slugify(formData.slug);
    sanitized.data.slug = await uniqueThesisSlug(supabase, slugBase, id);
  }

  const publishError = checkPublishReady(sanitized.data);
  if (publishError) return { success: false, error: publishError };

  const { error } = await supabase
    .from("research_reports")
    .update(sanitized.data)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  const meta = await requestMeta();
  await logAdminAction(admin.user.id, "thesis.update", "research_reports", id, { title: formData.title, status: sanitized.data.status, ...meta });

  revalidateAllTheses();

  // Full-text page indexing (book_pages) — only when the PDF actually changed.
  const newFileUrl = formData.file_url;
  if (newFileUrl && newFileUrl !== before?.file_url) {
    after(() => indexPdfPagesSafe("research", id, newFileUrl));
  }

  return { success: true };
}

// ── Status transitions, duplication, bulk actions (Manage Theses list) ───────

async function setThesisStatus(id: string, status: ThesisStatus, extra?: Record<string, unknown>) {
  const admin = await requirePermission("research", "write");
  await enforceRateLimit(admin.user.id);
  const { supabase } = admin;

  if (status === "published" || status === "scheduled") {
    const { data: existing } = await supabase
      .from("research_reports")
      .select("title, slug, program, cohort, academic_year, author_names, advisor_name, file_url, cover_url, abstract, keywords, references, license")
      .eq("id", id)
      .single();
    if (!existing) throw new Error("Thesis not found");
    const publishError = checkPublishReady({ ...existing, status });
    if (publishError) throw new Error(publishError);
  }

  const { data: row, error } = await supabase
    .from("research_reports")
    .update({ status, ...extra })
    .eq("id", id)
    .select("title, slug")
    .single();
  if (error) throw new Error(error.message);

  const actionMap: Record<ThesisStatus, string> = {
    published: "thesis.publish",
    draft: "thesis.unpublish",
    pending_review: "thesis.submit_for_review",
    scheduled: "thesis.schedule",
    archived: "thesis.archive",
    rejected: "thesis.reject",
  };
  const meta = await requestMeta();
  await logAdminAction(admin.user.id, actionMap[status], "research_reports", id, { title: row.title, ...meta });

  revalidateAllTheses();
}

export async function archiveThesis(id: string) {
  await setThesisStatus(id, "archived");
}

export async function unarchiveThesis(id: string) {
  await setThesisStatus(id, "draft");
}

export async function scheduleThesis(id: string, scheduledAt: string) {
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    throw new Error("Scheduled time must be a valid future date/time");
  }
  await setThesisStatus(id, "scheduled", { scheduled_at: when.toISOString() });
}

export async function duplicateThesis(id: string) {
  const admin = await requirePermission("research", "write");
  await enforceRateLimit(admin.user.id);
  const { supabase, user } = admin;

  const { data: source, error: fetchError } = await supabase
    .from("research_reports")
    .select(
      "title, abstract, program, faculty, subject, cohort, academic_year, author_names, advisor_name, license, keywords, references, doi",
    )
    .eq("id", id)
    .single();
  if (fetchError || !source) throw new Error("Thesis not found");

  const { data: copy, error: insertError } = await supabase
    .from("research_reports")
    .insert({
      ...source,
      title: `${source.title} (Copy)`,
      status: "draft",
      is_published: false,
      // Cover/PDF are intentionally not copied — every thesis file must be
      // uploaded/verified individually, never silently shared between rows.
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`Duplicate failed: ${insertError.message}`);

  const meta = await requestMeta();
  await logAdminAction(user.id, "thesis.duplicate", "research_reports", copy.id, { sourceId: id, ...meta });

  revalidateAllTheses();
  return { success: true, id: copy.id as string };
}

export type BulkThesisAction = "publish" | "unpublish" | "archive" | "delete" | "cohort" | "academicYear" | "program";

export async function bulkUpdateTheses(
  ids: string[],
  action: BulkThesisAction,
  payload?: { cohort?: string; academicYear?: string; program?: string },
): Promise<{ success: number; failed: number }> {
  const admin = await requirePermission("research", "write");
  await enforceRateLimit(admin.user.id);
  const { supabase, user } = admin;

  if (!ids.length) return { success: 0, failed: 0 };

  if (action === "delete") {
    const { data: rows } = await supabase.from("research_reports").select("id, file_url, cover_url").in("id", ids);
    await supabase.from("view_logs").delete().eq("content_type", "research_report").in("content_id", ids);
    await supabase.from("book_pages").delete().eq("record_type", "research").in("record_id", ids);
    await supabase.from("book_chunks").delete().eq("record_type", "research").in("record_id", ids);
    const { error, count } = await supabase.from("research_reports").delete({ count: "exact" }).in("id", ids);

    for (const row of rows ?? []) {
      for (const url of [row.file_url, row.cover_url]) {
        if (url) await zimaDelete(url as string).catch(() => null);
      }
    }

    const meta = await requestMeta();
    await logAdminAction(user.id, "thesis.bulk_action", "research_reports", undefined, { action, ids, ...meta });
    revalidateAllTheses();
    if (error) return { success: count ?? 0, failed: ids.length - (count ?? 0) };
    return { success: count ?? ids.length, failed: 0 };
  }

  let update: Record<string, unknown>;
  if (action === "cohort") {
    if (!payload?.cohort) throw new Error("Cohort is required");
    update = { cohort: payload.cohort };
  } else if (action === "academicYear") {
    if (!payload?.academicYear) throw new Error("Academic year is required");
    update = { academic_year: payload.academicYear };
  } else if (action === "program") {
    if (!payload?.program) throw new Error("Program is required");
    update = { program: payload.program };
  } else {
    const statusMap: Record<"publish" | "unpublish" | "archive", ThesisStatus> = {
      publish: "published",
      unpublish: "draft",
      archive: "archived",
    };
    update = { status: statusMap[action] };
  }

  const { error, count } = await supabase.from("research_reports").update(update, { count: "exact" }).in("id", ids);

  const meta = await requestMeta();
  await logAdminAction(user.id, "thesis.bulk_action", "research_reports", undefined, { action, ids, payload, ...meta });

  revalidateAllTheses();
  if (error) return { success: 0, failed: ids.length };
  return { success: count ?? ids.length, failed: 0 };
}

// ── Cohort lookup actions ─────────────────────────────────────────────────────

export async function getThesisCohorts(): Promise<{ data: ThesisCohort[] | null; error: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("research_cohorts")
    .select("id, program_code, number, label, sort_order, created_at")
    .order("program_code", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ThesisCohort[], error: null };
}

export async function addThesisCohort({
  programCode,
  number,
  label,
}: {
  programCode: string;
  number: number;
  label?: string;
}): Promise<{ data: ThesisCohort | null; error: string | null }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
  const { supabase } = admin;

  // Check for existing cohort (graceful duplicate handling)
  const { data: existing } = await supabase
    .from("research_cohorts")
    .select("id, program_code, number, label, sort_order, created_at")
    .eq("program_code", programCode)
    .eq("number", number)
    .maybeSingle();

  if (existing) return { data: existing as ThesisCohort, error: null };

  const { data: newRow, error: insertErr } = await supabase
    .from("research_cohorts")
    .insert({ program_code: programCode, number, label: label ?? null, sort_order: number })
    .select("id, program_code, number, label, sort_order, created_at")
    .single();

  if (insertErr) {
    // Race condition — retry select
    const { data: retry } = await supabase
      .from("research_cohorts")
      .select("id, program_code, number, label, sort_order, created_at")
      .eq("program_code", programCode)
      .eq("number", number)
      .single();
    if (retry) return { data: retry as ThesisCohort, error: null };
    return { data: null, error: insertErr.message };
  }

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { data: newRow as ThesisCohort, error: null };
}

export async function updateThesisCohort(
  id: string,
  updates: { number?: number; label?: string | null; sort_order?: number },
): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const { error } = await supabase.from("research_cohorts").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}

export async function deleteThesisCohort(id: string): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const { data: cohort } = await supabase
    .from("research_cohorts")
    .select("program_code, number")
    .eq("id", id)
    .single();
  if (cohort) {
    const { count } = await supabase
      .from("research_reports")
      .select("id", { count: "exact", head: true })
      .eq("program", cohort.program_code)
      .eq("cohort", String(cohort.number));
    if (count && count > 0) {
      return { success: false, error: `${count} thesis${count === 1 ? "" : "es"} use this cohort — reassign them before deleting.` };
    }
  }

  // Cascade will remove associated academic years (ON DELETE CASCADE)
  const { error } = await supabase.from("research_cohorts").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}

// ── Academic year lookup actions ──────────────────────────────────────────────

export async function getThesisAcademicYears(): Promise<{ data: ThesisAcademicYear[] | null; error: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("research_academic_years")
    .select("id, cohort_id, label, sort_order, created_at")
    .order("sort_order", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ThesisAcademicYear[], error: null };
}

export async function addThesisAcademicYear({
  cohortId,
  label,
}: {
  cohortId: string;
  label: string;
}): Promise<{ data: ThesisAcademicYear | null; error: string | null }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const trimmed = label.trim();
  if (!trimmed) return { data: null, error: "Academic year label is required" };

  // Graceful duplicate handling
  const { data: existing } = await supabase
    .from("research_academic_years")
    .select("id, cohort_id, label, sort_order, created_at")
    .eq("cohort_id", cohortId)
    .eq("label", trimmed)
    .maybeSingle();

  if (existing) return { data: existing as ThesisAcademicYear, error: null };

  // Sort order = next position
  const { count } = await supabase
    .from("research_academic_years")
    .select("id", { count: "exact", head: true })
    .eq("cohort_id", cohortId);

  const { data: newRow, error: insertErr } = await supabase
    .from("research_academic_years")
    .insert({ cohort_id: cohortId, label: trimmed, sort_order: (count ?? 0) + 1 })
    .select("id, cohort_id, label, sort_order, created_at")
    .single();

  if (insertErr) {
    const { data: retry } = await supabase
      .from("research_academic_years")
      .select("id, cohort_id, label, sort_order, created_at")
      .eq("cohort_id", cohortId)
      .eq("label", trimmed)
      .single();
    if (retry) return { data: retry as ThesisAcademicYear, error: null };
    return { data: null, error: insertErr.message };
  }

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { data: newRow as ThesisAcademicYear, error: null };
}

export async function updateThesisAcademicYear(
  id: string,
  updates: { label?: string; sort_order?: number },
): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const payload: { label?: string; sort_order?: number } = {};
  if (updates.label !== undefined) payload.label = updates.label.trim();
  if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;

  if (!payload.label && updates.label !== undefined) {
    return { success: false, error: "Academic year label is required" };
  }

  const { error } = await supabase.from("research_academic_years").update(payload).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}

export async function deleteThesisAcademicYear(id: string): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const { data: year } = await supabase.from("research_academic_years").select("label").eq("id", id).single();
  if (year?.label) {
    const { count } = await supabase
      .from("research_reports")
      .select("id", { count: "exact", head: true })
      .eq("academic_year", year.label);
    if (count && count > 0) {
      return { success: false, error: `${count} thesis${count === 1 ? "" : "es"} use this academic year — reassign them before deleting.` };
    }
  }

  const { error } = await supabase.from("research_academic_years").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}

// ── Program lookup actions ────────────────────────────────────────────────────

export async function getThesisPrograms(): Promise<{ data: ThesisProgram[] | null; error: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("research_programs")
    .select("id, code, name_en, name_km, duration_years, has_faculty, sort_order, created_at")
    .order("sort_order", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as ThesisProgram[], error: null };
}

export async function addThesisProgram({
  code,
  nameEn,
  nameKm,
  durationYears,
  hasFaculty,
}: {
  code: string;
  nameEn: string;
  nameKm: string;
  durationYears: number;
  hasFaculty: boolean;
}): Promise<{ data: ThesisProgram | null; error: string | null }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const trimmedCode = code.trim().toLowerCase().replace(/\s+/g, "_");
  if (!trimmedCode) return { data: null, error: "Program code is required" };
  if (!nameEn.trim()) return { data: null, error: "English name is required" };

  // Check for existing
  const { data: existing } = await supabase
    .from("research_programs")
    .select("id, code, name_en, name_km, duration_years, has_faculty, sort_order, created_at")
    .eq("code", trimmedCode)
    .maybeSingle();

  if (existing) return { data: existing as ThesisProgram, error: null };

  // Sort order = next position
  const { count } = await supabase
    .from("research_programs")
    .select("id", { count: "exact", head: true });

  const { data: newRow, error: insertErr } = await supabase
    .from("research_programs")
    .insert({
      code: trimmedCode,
      name_en: nameEn.trim(),
      name_km: nameKm.trim() || nameEn.trim(),
      duration_years: durationYears,
      has_faculty: hasFaculty,
      sort_order: (count ?? 0) + 1,
    })
    .select("id, code, name_en, name_km, duration_years, has_faculty, sort_order, created_at")
    .single();

  if (insertErr) {
    const { data: retry } = await supabase
      .from("research_programs")
      .select("id, code, name_en, name_km, duration_years, has_faculty, sort_order, created_at")
      .eq("code", trimmedCode)
      .single();
    if (retry) return { data: retry as ThesisProgram, error: null };
    return { data: null, error: insertErr.message };
  }

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { data: newRow as ThesisProgram, error: null };
}

export async function updateThesisProgram(
  id: string,
  updates: { code?: string; name_en?: string; name_km?: string; duration_years?: number; has_faculty?: boolean; sort_order?: number },
): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const { error } = await supabase.from("research_programs").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}

export async function deleteThesisProgram(id: string): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const { data: program } = await supabase.from("research_programs").select("code").eq("id", id).single();
  if (program?.code) {
    const { count } = await supabase
      .from("research_reports")
      .select("id", { count: "exact", head: true })
      .eq("program", program.code);
    if (count && count > 0) {
      return { success: false, error: `${count} thesis${count === 1 ? "" : "es"} use this program — reassign them before deleting.` };
    }
  }

  // CASCADE will remove associated faculties
  const { error } = await supabase.from("research_programs").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}

// ── Faculty lookup actions ────────────────────────────────────────────────────

export async function getThesisFaculties(): Promise<{ data: ThesisFaculty[] | null; error: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("research_faculties")
    .select("id, program_code, code, name_en, name_km, has_subject, sort_order, created_at")
    .order("program_code", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as ThesisFaculty[], error: null };
}

export async function addThesisFaculty({
  programCode,
  code,
  nameEn,
  nameKm,
  hasSubject,
}: {
  programCode: string;
  code: string;
  nameEn: string;
  nameKm: string;
  hasSubject?: boolean;
}): Promise<{ data: ThesisFaculty | null; error: string | null }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const trimmedCode = code.trim().toLowerCase().replace(/\s+/g, "_");
  if (!trimmedCode) return { data: null, error: "Faculty code is required" };
  if (!nameEn.trim()) return { data: null, error: "English name is required" };

  // Check for existing
  const { data: existing } = await supabase
    .from("research_faculties")
    .select("id, program_code, code, name_en, name_km, has_subject, sort_order, created_at")
    .eq("program_code", programCode)
    .eq("code", trimmedCode)
    .maybeSingle();

  if (existing) return { data: existing as ThesisFaculty, error: null };

  const { count } = await supabase
    .from("research_faculties")
    .select("id", { count: "exact", head: true })
    .eq("program_code", programCode);

  const { data: newRow, error: insertErr } = await supabase
    .from("research_faculties")
    .insert({
      program_code: programCode,
      code: trimmedCode,
      name_en: nameEn.trim(),
      name_km: nameKm.trim() || nameEn.trim(),
      has_subject: hasSubject ?? false,
      sort_order: (count ?? 0) + 1,
    })
    .select("id, program_code, code, name_en, name_km, has_subject, sort_order, created_at")
    .single();

  if (insertErr) {
    const { data: retry } = await supabase
      .from("research_faculties")
      .select("id, program_code, code, name_en, name_km, has_subject, sort_order, created_at")
      .eq("program_code", programCode)
      .eq("code", trimmedCode)
      .single();
    if (retry) return { data: retry as ThesisFaculty, error: null };
    return { data: null, error: insertErr.message };
  }

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { data: newRow as ThesisFaculty, error: null };
}

export async function updateThesisFaculty(
  id: string,
  updates: { code?: string; name_en?: string; name_km?: string; has_subject?: boolean; sort_order?: number },
): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const { error } = await supabase.from("research_faculties").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}

export async function deleteThesisFaculty(id: string): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const { data: faculty } = await supabase.from("research_faculties").select("program_code, code").eq("id", id).single();
  if (faculty) {
    const { count } = await supabase
      .from("research_reports")
      .select("id", { count: "exact", head: true })
      .eq("program", faculty.program_code)
      .eq("faculty", faculty.code);
    if (count && count > 0) {
      return { success: false, error: `${count} thesis${count === 1 ? "" : "es"} use this faculty — reassign them before deleting.` };
    }
  }

  const { error } = await supabase.from("research_faculties").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Thesis Download Access — admin override (tri-state: inherit | allow | block).
// The effective download policy is resolved by the centralized permission
// engine (lib/theses/download-permission.ts); this only persists the admin's
// intent + an audit trail. `inherit` = follow the automatic Top-10 ranking.
// ─────────────────────────────────────────────────────────────────────────────
type DownloadOverride = "inherit" | "allow" | "block";

function isDownloadOverride(v: unknown): v is DownloadOverride {
  return v === "inherit" || v === "allow" || v === "block";
}

export async function setThesisDownloadOverride(
  id: string,
  override: DownloadOverride,
  reason?: string,
) {
  if (!isDownloadOverride(override)) {
    return { success: false, error: "Invalid download policy." };
  }
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;

  const { data: prev } = await supabase
    .from("research_reports")
    .select("download_override, title")
    .eq("id", id)
    .maybeSingle();
  if (!prev) return { success: false, error: "Thesis not found" };

  const { error } = await supabase
    .from("research_reports")
    .update({
      download_override: override,
      download_override_reason: reason?.trim().slice(0, 500) || null,
      download_override_updated_by: admin.user.id,
      download_override_updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  const meta = await requestMeta();
  await logAdminAction(admin.user.id, "thesis.download_override", "research_reports", id, {
    title: prev.title,
    previous_override: prev.download_override ?? "inherit",
    new_override: override,
    reason: reason ?? null,
    ...meta,
  });

  revalidateAllTheses();
  revalidatePath("/theses");
  return { success: true };
}

export async function bulkSetThesisDownloadOverride(
  ids: string[],
  override: DownloadOverride,
) {
  if (!isDownloadOverride(override)) {
    return { success: false, error: "Invalid download policy." };
  }
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("research", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase } = admin;
  const cleanIds = [...new Set(ids)].filter(Boolean).slice(0, 200);
  if (cleanIds.length === 0) return { success: false, error: "No theses selected." };

  const { data, error } = await supabase
    .from("research_reports")
    .update({
      download_override: override,
      download_override_updated_by: admin.user.id,
      download_override_updated_at: new Date().toISOString(),
    })
    .in("id", cleanIds)
    .select("id");

  if (error) return { success: false, error: error.message };

  const affected = data?.length ?? 0;
  const meta = await requestMeta();
  await logAdminAction(admin.user.id, "thesis.download_override_bulk", "research_reports", undefined, {
    new_override: override,
    count: affected,
    ...meta,
  });

  revalidateAllTheses();
  revalidatePath("/theses");
  return { success: true, count: affected, failed: cleanIds.length - affected };
}
