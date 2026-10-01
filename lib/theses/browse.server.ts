// lib/theses/browse.server.ts
//
// The data behind the research browse pages (SEO Phase 3.5; rules in
// lib/theses/browse.ts). One read of every published thesis's few browse
// columns, cached under the theses tag every thesis save already fires, so a
// new thesis appears on its year and programme pages with no second
// revalidation to keep in step.

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { pagedScan } from "@/lib/db/paged-scan";
import { TAGS } from "@/lib/cache/revalidate";
import {
  parseBrowseMinWorks,
  programGroups,
  programSegment,
  yearGroups,
  type BrowseThesisRow,
} from "@/lib/theses/browse";

const SCAN_CAP = 50_000;

async function loadRows(): Promise<BrowseThesisRow[]> {
  const { data, error, truncated } = await pagedScan<BrowseThesisRow>(
    (from, to) =>
      createServiceClient()
        .from("research_reports")
        .select("id, slug, title, author_names, academic_year, published_at, program")
        .eq("is_published", true)
        .order("id", { ascending: true })
        .range(from, to),
    SCAN_CAP,
  );
  // A failed or partial read throws rather than caching "no year has five
  // theses" for an hour, which would 404 every browse page at once.
  if (error || truncated) throw new Error(`thesis browse rows: ${error?.message ?? "truncated"}`);
  return data;
}

const cachedRows = unstable_cache(loadRows, ["thesis-browse-rows-v1"], { revalidate: 3600, tags: [TAGS.theses] });

type ProgramName = { en: string | null; km: string | null };

async function loadProgramNames(): Promise<[string, ProgramName][]> {
  const { data, error } = await createServiceClient().from("research_programs").select("code, name_en, name_km");
  if (error) throw new Error(`research programs: ${error.message}`);
  return ((data ?? []) as { code: string; name_en: string | null; name_km: string | null }[]).map((p) => [
    programSegment(p.code),
    { en: p.name_en?.trim() || null, km: p.name_km?.trim() || null },
  ]);
}

const cachedProgramNames = unstable_cache(loadProgramNames, ["thesis-program-names-v1"], {
  revalidate: 3600,
  tags: [TAGS.theses],
});

/** THESIS_BROWSE_MIN_WORKS (default 5). */
export function browseMinWorks(): number {
  return parseBrowseMinWorks(process.env.THESIS_BROWSE_MIN_WORKS);
}

export const getThesisYearGroups = cache(async () => yearGroups(await cachedRows(), browseMinWorks()));
export const getThesisProgramGroups = cache(async () => programGroups(await cachedRows(), browseMinWorks()));

/** A programme's name in the page's language, from the programme table; the
 *  segment itself when the table has no row for it. */
export const programName = cache(async (segment: string, locale: string): Promise<string> => {
  try {
    const names = new Map(await cachedProgramNames());
    const name = names.get(segment);
    return (locale === "km" ? name?.km ?? name?.en : name?.en ?? name?.km) ?? segment;
  } catch {
    return segment;
  }
});
