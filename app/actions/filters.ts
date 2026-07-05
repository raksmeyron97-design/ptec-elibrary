"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function getLanguages(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("books")
    .select("language")
    .eq("is_published", true)
    .not("language", "is", null);

  if (error || !data) {
    console.error("[getLanguages]", error?.message);
    return [];
  }

  const seen = new Set<string>();
  for (const row of data) {
    if (row.language) seen.add(row.language);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export async function getCategories(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("books")
    .select("categories!inner(name)")
    .eq("is_published", true);

  if (error || !data) {
    console.error("[getCategories]", error?.message);
    return [];
  }

  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of data as any[]) {
    const name = row.categories?.name;
    if (name) seen.add(name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export async function getFormats(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("book_files")
    .select("format")
    .not("format", "is", null);

  if (error || !data) {
    console.error("[getFormats]", error?.message);
    return [];
  }

  const seen = new Set<string>();
  for (const row of data) {
    // Standardize to uppercase for display if you like, or keep as is.
    // The format is typically "pdf", "epub", etc. We will keep it case-sensitive or standard.
    if (row.format) seen.add(row.format.toUpperCase());
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
