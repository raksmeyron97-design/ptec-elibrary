"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResearchReportData {
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
  is_published?: boolean;
}

export interface ResearchCohort {
  id: string;
  program_code: string;
  number: number;
  label: string | null;
  sort_order: number;
  created_at: string;
}

export interface ResearchAcademicYear {
  id: string;
  cohort_id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

// ── Report queries ─────────────────────────────────────────────────────────────

export async function getResearchReports({
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
    query = query.ilike("title", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching research reports:", error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getResearchReportById(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("research_reports")
    .select(`*, departments(name)`)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching report:", error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function incrementResearchViewCount(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("increment_research_view_count", { row_id: id });

  await supabase.from("view_logs").insert({
    content_type: "research_report",
    content_id: id,
  });
  if (error) {
    console.error("Failed to increment view count:", error);
  }
}

export async function incrementResearchDownloadCount(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("increment_research_download_count", { row_id: id });
  if (error) {
    console.error("Failed to increment download count:", error);
  }
}

export async function toggleReportPublishStatus(id: string, isPublished: boolean) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("research_reports")
    .update({ is_published: isPublished })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { success: true };
}

export async function createResearchReport(formData: ResearchReportData) {
  const supabase = await createClient();
  const { error } = await supabase.from("research_reports").insert([formData]);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { success: true };
}

export async function deleteResearchReport(id: string) {
  const supabase = await createClient();

  await supabase.from("view_logs").delete().eq("content_type", "research_report").eq("content_id", id);

  const { error } = await supabase.from("research_reports").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { success: true };
}

export async function updateResearchReport(id: string, formData: ResearchReportData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("research_reports")
    .update(formData)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { success: true };
}

// ── Cohort lookup actions ─────────────────────────────────────────────────────

export async function getResearchCohorts(): Promise<{ data: ResearchCohort[] | null; error: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("research_cohorts")
    .select("id, program_code, number, label, sort_order, created_at")
    .order("program_code", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ResearchCohort[], error: null };
}

export async function addResearchCohort({
  programCode,
  number,
  label,
}: {
  programCode: string;
  number: number;
  label?: string;
}): Promise<{ data: ResearchCohort | null; error: string | null }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { data: null, error: "Forbidden" };

  // Check for existing cohort (graceful duplicate handling)
  const { data: existing } = await supabase
    .from("research_cohorts")
    .select("id, program_code, number, label, sort_order, created_at")
    .eq("program_code", programCode)
    .eq("number", number)
    .maybeSingle();

  if (existing) return { data: existing as ResearchCohort, error: null };

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
    if (retry) return { data: retry as ResearchCohort, error: null };
    return { data: null, error: insertErr.message };
  }

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { data: newRow as ResearchCohort, error: null };
}

export async function updateResearchCohort(
  id: string,
  updates: { number?: number; label?: string | null; sort_order?: number },
): Promise<{ success: boolean; error?: string }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { success: false, error: "Forbidden" };

  const { error } = await supabase.from("research_cohorts").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { success: true };
}

export async function deleteResearchCohort(id: string): Promise<{ success: boolean; error?: string }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { success: false, error: "Forbidden" };

  // Cascade will remove associated academic years (ON DELETE CASCADE)
  const { error } = await supabase.from("research_cohorts").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { success: true };
}

// ── Academic year lookup actions ──────────────────────────────────────────────

export async function getResearchAcademicYears(): Promise<{ data: ResearchAcademicYear[] | null; error: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("research_academic_years")
    .select("id, cohort_id, label, sort_order, created_at")
    .order("sort_order", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ResearchAcademicYear[], error: null };
}

export async function addResearchAcademicYear({
  cohortId,
  label,
}: {
  cohortId: string;
  label: string;
}): Promise<{ data: ResearchAcademicYear | null; error: string | null }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { data: null, error: "Forbidden" };

  const trimmed = label.trim();
  if (!trimmed) return { data: null, error: "Academic year label is required" };

  // Graceful duplicate handling
  const { data: existing } = await supabase
    .from("research_academic_years")
    .select("id, cohort_id, label, sort_order, created_at")
    .eq("cohort_id", cohortId)
    .eq("label", trimmed)
    .maybeSingle();

  if (existing) return { data: existing as ResearchAcademicYear, error: null };

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
    if (retry) return { data: retry as ResearchAcademicYear, error: null };
    return { data: null, error: insertErr.message };
  }

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { data: newRow as ResearchAcademicYear, error: null };
}

export async function updateResearchAcademicYear(
  id: string,
  updates: { label?: string; sort_order?: number },
): Promise<{ success: boolean; error?: string }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { success: false, error: "Forbidden" };

  const payload: { label?: string; sort_order?: number } = {};
  if (updates.label !== undefined) payload.label = updates.label.trim();
  if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;

  if (!payload.label && updates.label !== undefined) {
    return { success: false, error: "Academic year label is required" };
  }

  const { error } = await supabase.from("research_academic_years").update(payload).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { success: true };
}

export async function deleteResearchAcademicYear(id: string): Promise<{ success: boolean; error?: string }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { success: false, error: "Forbidden" };

  const { error } = await supabase.from("research_academic_years").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/research-reports");
  revalidatePath("/research");

  return { success: true };
}
