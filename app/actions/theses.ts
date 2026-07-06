"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { zimaDelete } from "@/lib/zima";
import { createAdminNotification } from "@/lib/admin-notifications";
import { requirePermission } from "@/lib/auth/requireAdmin";


const REVALIDATE_PATHS = [
  "/admin/theses",
  "/theses",
  "/theses/summary",
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThesisData {
  title: string;
  abstract: string;
  program?: string | null;
  faculty?: string | null;
  subject?: string | null;
  cohort?: string | null;
  academic_year?: string | null;
  author_names?: string | null;
  advisor_name?: string | null;
  cover_url?: string | null;
  file_url?: string | null;
  file_size_kb?: number | null;
  content_hash?: string | null;
  license?: string | null;
  is_published?: boolean;
  keywords?: string[];
  doi?: string | null;
  published_at?: string | null;
  references?: string | null;
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

  if (q) {
    const { data: kwMatches } = await supabase
      .from("research_reports")
      .select("id")
      .filter("keywords::text", "ilike", `%${q}%`)
      .eq("is_published", true);

    const kwIds = kwMatches?.map(r => r.id) ?? [];

    let orStr = `title.ilike.%${q}%,author_names.ilike.%${q}%,advisor_name.ilike.%${q}%,doi.ilike.%${q}%`;
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

export async function incrementThesisViewCount(id: string) {
  // Only count views from signed-in users (matches the book view-count behavior)
  // and prevents anonymous callers from spamming the counter via this action.
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return;

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("increment_research_view_count", { row_id: id });

  await supabase.from("view_logs").insert({
    content_type: "research_report",
    content_id: id,
    user_id: user.id,
  });
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
    const { data } = await supabase.from("research_reports").select("published_at").eq("id", id).single();
    if (data && !data.published_at) {
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

  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
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
  const { error } = await supabase.from("research_reports").insert([{
    ...formData,
    keywords: formData.keywords ?? [],
  }]);

  if (error) {
    return { success: false, error: error.message };
  }

  await createAdminNotification("new_report", `New thesis: "${formData.title}"`, undefined, "/theses");
  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
  return { success: true };
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
    .select("file_url, cover_url")
    .eq("id", id)
    .single();

  await supabase.from("view_logs").delete().eq("content_type", "research_report").eq("content_id", id);

  const { error } = await supabase.from("research_reports").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Best-effort Zima cleanup (non-fatal — DB row is already gone)
  for (const url of [row?.file_url, row?.cover_url]) {
    if (url) await zimaDelete(url as string).catch(() => null);
  }

  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
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
  const { error } = await supabase
    .from("research_reports")
    .update(formData)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
  return { success: true };
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

  const { error } = await supabase.from("research_faculties").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/theses");
  revalidatePath("/theses");

  return { success: true };
}
