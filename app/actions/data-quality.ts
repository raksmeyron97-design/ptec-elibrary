"use server";

// Data-quality dashboard (Area 1 of the roadmap, part 2 — license/verified
// badges were part 1, see migration 0062). Surfaces two signals to
// librarians: incomplete metadata, and files that no longer resolve.

import { requireLibrarian } from "@/lib/auth/requireAdmin";

export type ContentType = "book" | "research";

export interface MetadataGap {
  id: string;
  type: ContentType;
  title: string;
  completeness: number;
  missingFields: string[];
  editUrl: string;
}

const BOOK_CHECKS: { field: string; label: string; weight: number; check: (r: Record<string, unknown>) => boolean }[] = [
  { field: "author", label: "Author", weight: 20, check: (r) => !!r.author_id },
  { field: "category", label: "Category", weight: 15, check: (r) => !!r.category_id },
  { field: "cover", label: "Cover image", weight: 20, check: (r) => !!r.cover_url },
  { field: "description", label: "Description", weight: 20, check: (r) => !!(r.description as string)?.trim() },
  { field: "isbn", label: "ISBN", weight: 10, check: (r) => !!(r.isbn as string)?.trim() },
  { field: "publisher", label: "Publisher", weight: 10, check: (r) => !!(r.publisher as string)?.trim() },
  { field: "license", label: "License", weight: 5, check: (r) => r.license !== "unknown" && !!r.license },
];

const THESIS_CHECKS: { field: string; label: string; weight: number; check: (r: Record<string, unknown>) => boolean }[] = [
  { field: "advisor", label: "Advisor", weight: 15, check: (r) => !!(r.advisor_name as string)?.trim() },
  { field: "cover", label: "Cover image", weight: 20, check: (r) => !!r.cover_url },
  { field: "program", label: "Program", weight: 15, check: (r) => !!r.program },
  { field: "keywords", label: "Keywords", weight: 15, check: (r) => Array.isArray(r.keywords) && (r.keywords as unknown[]).length > 0 },
  { field: "doi", label: "DOI", weight: 10, check: (r) => !!(r.doi as string)?.trim() },
  { field: "license", label: "License", weight: 25, check: (r) => r.license !== "unknown" && !!r.license },
];

function scoreRow(
  row: Record<string, unknown>,
  checks: typeof BOOK_CHECKS,
): { completeness: number; missingFields: string[] } {
  let earned = 0;
  const missingFields: string[] = [];
  for (const c of checks) {
    if (c.check(row)) earned += c.weight;
    else missingFields.push(c.label);
  }
  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  return { completeness: Math.round((earned / total) * 100), missingFields };
}

/** Worst-first metadata completeness across books + theses. */
export async function getMetadataGaps(limit = 30): Promise<MetadataGap[]> {
  const { supabase } = await requireLibrarian();

  const [{ data: books }, { data: theses }] = await Promise.all([
    supabase
      .from("books")
      .select("id, title, author_id, category_id, cover_url, description, isbn, publisher, license")
      .eq("is_published", true),
    supabase
      .from("research_reports")
      .select("id, title, advisor_name, cover_url, program, keywords, doi, license")
      .eq("is_published", true),
  ]);

  const gaps: MetadataGap[] = [];

  for (const b of books ?? []) {
    const { completeness, missingFields } = scoreRow(b, BOOK_CHECKS);
    if (missingFields.length > 0) {
      gaps.push({ id: b.id, type: "book", title: b.title, completeness, missingFields, editUrl: `/admin/edit/${b.id}` });
    }
  }
  for (const r of theses ?? []) {
    const { completeness, missingFields } = scoreRow(r, THESIS_CHECKS);
    if (missingFields.length > 0) {
      gaps.push({ id: r.id, type: "research", title: r.title, completeness, missingFields, editUrl: `/admin/theses/edit/${r.id}` });
    }
  }

  return gaps.sort((a, b) => a.completeness - b.completeness).slice(0, limit);
}

export interface DataQualitySummary {
  totalBooks: number;
  totalTheses: number;
  avgBookCompleteness: number;
  avgThesisCompleteness: number;
  brokenFileCount: number;
  fileHealthCheckedAt: string | null;
}

export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  const { supabase } = await requireLibrarian();

  const [{ data: books }, { data: theses }, fileHealthResult] = await Promise.all([
    supabase.from("books").select("author_id, category_id, cover_url, description, isbn, publisher, license").eq("is_published", true),
    supabase.from("research_reports").select("advisor_name, cover_url, program, keywords, doi, license").eq("is_published", true),
    supabase.from("file_health").select("status, checked_at", { count: "exact" }).eq("status", "broken").order("checked_at", { ascending: false }).limit(1),
  ]);

  const bookScores = (books ?? []).map((b) => scoreRow(b, BOOK_CHECKS).completeness);
  const thesisScores = (theses ?? []).map((r) => scoreRow(r, THESIS_CHECKS).completeness);
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 100);

  // 42P01 = file_health table doesn't exist yet (migration 0065 not applied)
  const brokenFileCount = fileHealthResult.error ? 0 : (fileHealthResult.count ?? 0);
  const fileHealthCheckedAt = fileHealthResult.error ? null : (fileHealthResult.data?.[0]?.checked_at ?? null);

  return {
    totalBooks: books?.length ?? 0,
    totalTheses: theses?.length ?? 0,
    avgBookCompleteness: avg(bookScores),
    avgThesisCompleteness: avg(thesisScores),
    brokenFileCount,
    fileHealthCheckedAt,
  };
}

export interface BrokenFile {
  recordType: ContentType;
  recordId: string;
  field: string;
  url: string;
  httpStatus: number | null;
  title: string | null;
  editUrl: string;
}

/** Broken files from the last check run, joined back to their record's title. */
export async function getBrokenFiles(): Promise<BrokenFile[]> {
  const { supabase } = await requireLibrarian();

  const { data, error } = await supabase
    .from("file_health")
    .select("record_type, record_id, field, url, http_status")
    .eq("status", "broken")
    .order("checked_at", { ascending: false });

  if (error) return []; // table not migrated yet, or genuinely empty

  const bookIds = data.filter((r) => r.record_type === "book").map((r) => r.record_id);
  const researchIds = data.filter((r) => r.record_type === "research").map((r) => r.record_id);

  const [{ data: books }, { data: theses }] = await Promise.all([
    bookIds.length ? supabase.from("books").select("id, title").in("id", bookIds) : Promise.resolve({ data: [] }),
    researchIds.length ? supabase.from("research_reports").select("id, title").in("id", researchIds) : Promise.resolve({ data: [] }),
  ]);
  const titleMap = new Map([...(books ?? []), ...(theses ?? [])].map((r) => [r.id, r.title]));

  return data.map((r) => ({
    recordType: r.record_type as ContentType,
    recordId: r.record_id,
    field: r.field,
    url: r.url,
    httpStatus: r.http_status,
    title: titleMap.get(r.record_id) ?? null,
    editUrl: r.record_type === "book" ? `/admin/edit/${r.record_id}` : `/admin/theses/edit/${r.record_id}`,
  }));
}
