import "server-only";

// lib/theses/record.server.ts
//
// Everything the thesis record page reads, and nothing about who is reading.
//
// The page used to read the row through the cookie-bound Supabase client and
// then ask the session who the viewer was — a `cookies()` read that put
// /theses/[slug] on the list of public routes rendered per request
// (lib/cache/cache-safety.test.ts). Every read here is either the anon
// cookie-free client (RLS: published theses only) or the service client for
// the two service-only facts (the download rank and the canonical credits),
// so the route can be shared-cached. The viewer's half of the access decision
// is resolved in the browser against /api/theses/[id]/download-status.
//
// Each read is wrapped in React `cache()`, so generateMetadata and the page
// share one row read and one contributor read per request — they used to run
// two different selects and could resolve two different author lists. The
// row read is also tagged (see cachedRow), which is how an admin edit
// invalidates the cached page.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createServiceClient } from "@/lib/supabase/server";
import { getPublicResourceContributors } from "@/lib/resources/public-contributors";
import { getOrgIdentity } from "@/lib/system-settings/config";
import {
  evaluateThesisDownload,
  resolveDownloadPolicy,
  type ThesisDownloadDecision,
  type ThesisPolicyRow,
} from "@/lib/theses/download-permission";
import type { ResearchReport } from "@/lib/theses/report-fields";
import { TAGS } from "@/lib/cache/revalidate";
import type { RelatedReason, RelatedThesis } from "@/lib/theses/record";

const ROW_SELECT = "*, departments(name)";

/**
 * One published row, cached under the theses tags. Every thesis mutation
 * calls revalidateThesis(), which revalidates TAGS.theses — and a page that
 * read a tagged entry is regenerated with it, so an edit reaches this
 * shared-cached page without anyone naming its slug. A failed read THROWS:
 * caching "not found" for an hour after one timeout would 404 a real thesis.
 */
function cachedRow(column: "slug" | "id", value: string, tags: string[]) {
  return unstable_cache(
    async (): Promise<ResearchReport | null> => {
      const { data, error } = await createPublicClient()
        .from("research_reports")
        .select(ROW_SELECT)
        .eq(column, value)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw new Error(`thesis read failed: ${error.message}`);
      return data ?? null;
    },
    ["thesis-record-row", column, value],
    { revalidate: 3600, tags },
  )();
}

/** A published thesis by slug, or null. */
export const readThesisBySlug = cache((slug: string) =>
  cachedRow("slug", slug, [TAGS.theses, TAGS.thesis(slug)]),
);

/** A published thesis by id — the legacy /theses/[uuid] URLs. */
export const readThesisById = cache((id: string) => cachedRow("id", id, [TAGS.theses]));

/** The canonical credits (legacy byline as the fallback), once per request. */
export const readThesisContributors = cache(async (id: string, byline: string | null) => {
  const org = await getOrgIdentity();
  return getPublicResourceContributors("thesis", id, { byline, org });
});

/**
 * The download engine's decision for an ANONYMOUS reader — the record-level
 * half of the access state: no file, protected (Top N or an admin block), or
 * sign in. The engine's own reads degrade rather than throw; if it throws
 * anyway (no service credentials) the same pure engine decides with exactly
 * that degradation. The file route re-decides every request regardless.
 */
export async function anonymousThesisDecision(row: ResearchReport): Promise<ThesisDownloadDecision> {
  try {
    return await evaluateThesisDownload({
      service: createServiceClient(),
      report: row as ThesisPolicyRow,
      userId: null,
    });
  } catch {
    return resolveDownloadPolicy({
      isPublished: true,
      hasFile: !!row.file_url,
      override: row.download_override,
      rank: null,
      authenticated: false,
      profileComplete: false,
    });
  }
}

// ── Related theses: three honest reasons ──────────────────────────────────

const RELATED_SELECT = "id, slug, title, author_names, academic_year";
const PER_LEG = 3;

/** `ilike` without wildcards is a case-insensitive equality — once `%`, `_`
 *  and `\` in the value are escaped. */
function exactInsensitive(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Up to three theses per reason, each reason a real relation the reader can
 * see on the card: the same advisor, the same program AND cohort, the same
 * program AND faculty. A thesis appears under its first reason only, never
 * the current one. The old component ran four SERIAL `select("*")` queries —
 * one against a `department` column the table does not have — and topped the
 * list up with "popular" theses that were related to nothing.
 *
 * A leg that fails is omitted, never reported as "no related theses".
 */
export async function readRelatedTheses(row: ResearchReport): Promise<RelatedThesis[]> {
  const client = createPublicClient();
  const base = () =>
    client
      .from("research_reports")
      .select(RELATED_SELECT)
      .eq("is_published", true)
      .neq("id", row.id)
      .order("view_count", { ascending: false })
      .limit(PER_LEG * 3);

  const advisor = typeof row.advisor_name === "string" ? row.advisor_name.trim() : "";
  const legs: Array<[RelatedReason, PromiseLike<{ data: unknown[] | null; error: unknown }> | null]> = [
    [
      "advisor",
      // PostgREST also reads `*` as a wildcard; a name holding one is matched
      // exactly instead of escaped.
      advisor
        ? advisor.includes("*")
          ? base().eq("advisor_name", advisor)
          : base().ilike("advisor_name", exactInsensitive(advisor))
        : null,
    ],
    ["cohort", row.program && row.cohort ? base().eq("program", row.program).eq("cohort", row.cohort) : null],
    ["faculty", row.program && row.faculty ? base().eq("program", row.program).eq("faculty", row.faculty) : null],
  ];

  const results = await Promise.all(
    legs.map(async ([reason, query]) => {
      if (!query) return { reason, rows: [] as Record<string, unknown>[] };
      try {
        const { data, error } = await query;
        return { reason, rows: error ? [] : ((data ?? []) as Record<string, unknown>[]) };
      } catch {
        return { reason, rows: [] as Record<string, unknown>[] };
      }
    }),
  );

  const seen = new Set<string>([String(row.id)]);
  const out: RelatedThesis[] = [];
  for (const { reason, rows } of results) {
    let taken = 0;
    for (const r of rows) {
      if (taken >= PER_LEG) break;
      const id = String(r.id);
      if (seen.has(id)) continue;
      seen.add(id);
      taken += 1;
      out.push({
        slug: String(r.slug ?? r.id),
        title: String(r.title ?? ""),
        byline: typeof r.author_names === "string" && r.author_names.trim() ? r.author_names.trim() : null,
        academicYear: typeof r.academic_year === "string" && r.academic_year.trim() ? r.academic_year.trim() : null,
        reason,
      });
    }
  }
  return out;
}
