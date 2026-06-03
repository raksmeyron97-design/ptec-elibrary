"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getResearchReports({
  departmentId,
  cohort,
  academicYear,
  q,
  publishedOnly = true,
}: {
  departmentId?: string;
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
  // Using RPC if exists, otherwise normal update bypassing RLS because we just increment
  const { error } = await supabase.rpc("increment_research_view_count", { row_id: id });
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

export async function createResearchReport(formData: any) {
  const supabase = await createClient();
  const { error } = await supabase.from("research_reports").insert([formData]);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath("/admin/research-reports");
  revalidatePath("/research");
  
  return { success: true };
}
