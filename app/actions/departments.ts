"use server";

// app/actions/departments.ts
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Returns every distinct, non-null department that has at least one
 * published book, sorted alphabetically.
 * Falls back to an empty array on error so the sidebar still renders.
 */
export async function getDepartments(): Promise<string[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("books")
    .select("departments!inner(name)")
    .eq("is_published", true);

  if (error) {
    console.error("[getDepartments]", error.message);
    return [];
  }

  // Deduplicate — Supabase doesn't support SELECT DISTINCT via the JS client
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const deptName = (row.departments as any)?.name;
    if (deptName) seen.add(deptName);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}