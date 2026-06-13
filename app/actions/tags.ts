"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

export const getAllTags = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = createServiceClient();
    
    // Only surface tags/keywords from publicly visible content — never leak
    // metadata from unpublished books or reports.
    const [booksRes, catalogRes, researchRes] = await Promise.all([
      supabase.from("books").select("tags").eq("is_published", true),
      supabase.from("catalog_books").select("keywords"),
      supabase.from("research_reports").select("keywords").eq("is_published", true),
    ]);

    const allTags = new Set<string>();

    const processRow = (row: Record<string, unknown>, key: string) => {
      const arr = row[key];
      if (Array.isArray(arr)) {
        arr.forEach((t) => {
          const trimmed = String(t).trim();
          if (trimmed) allTags.add(trimmed);
        });
      }
    };

    booksRes.data?.forEach(r => processRow(r, "tags"));
    catalogRes.data?.forEach(r => processRow(r, "keywords"));
    researchRes.data?.forEach(r => processRow(r, "keywords"));

    return Array.from(allTags).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  },
  ["all-unique-tags"],
  { revalidate: 3600, tags: ["tags-cache"] }
);
