/**
 * Centralized thesis download permission engine — the SINGLE source of truth
 * for whether a reader may download a thesis PDF. Every surface (thesis detail
 * button, status endpoint, secure download route, admin UI) resolves through
 * `resolveDownloadPolicy` (pure) so the rule can never drift between them.
 *
 * Business rule (default policy):
 *   • Published theses ranked #1–#10 are protected → download blocked.
 *   • Ranked #11+ → download allowed after auth + a complete Download Profile.
 *   • Admin override 'allow'/'block' wins over the automatic ranking.
 *
 * The pure resolver takes structured inputs (fully unit-testable); the DB-backed
 * `evaluateThesisDownload` wrapper gathers rank + profile completeness and calls
 * it. The final decision is ALWAYS re-evaluated server-side at download time.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDownloadProfileStatus } from "@/lib/profile/download-profile";
import type { DownloadProfileField } from "@/lib/profile/download-profile-shared";

/** How many top-ranked published theses are protected by default. */
export const TOP_N_PROTECTED = 10;

export type DownloadOverride = "inherit" | "allow" | "block";

export type ThesisDownloadReason =
  | "ALLOWED"
  | "AUTHENTICATION_REQUIRED"
  | "PROFILE_INCOMPLETE"
  | "TOP_TEN_RESTRICTED"
  | "ADMIN_BLOCKED"
  | "FILE_UNAVAILABLE"
  | "THESIS_UNPUBLISHED";

export type ThesisDownloadDecision = {
  allowed: boolean;
  reason: ThesisDownloadReason;
  rank: number | null;
  isTopTen: boolean;
  /** Policy independent of the current user (ranking + admin override only). */
  effectivePolicy: "allowed" | "blocked";
  policySource: "automatic-ranking" | "admin-override";
  missingProfileFields?: DownloadProfileField[];
};

export type ResolveInput = {
  isPublished: boolean;
  hasFile: boolean;
  override: DownloadOverride;
  /** Global Top-N rank (1-based) among published theses; null if unranked. */
  rank: number | null;
  authenticated: boolean;
  profileComplete: boolean;
  missingProfileFields?: DownloadProfileField[];
};

function normalizeOverride(value: unknown): DownloadOverride {
  return value === "allow" || value === "block" ? value : "inherit";
}

/**
 * Pure decision function. Check order matters (Phase 21): thesis availability
 * first, then the policy-level block (which is safe to reveal even to anonymous
 * users so the public UI can render the correct locked state), then the
 * per-user auth / profile / file gates.
 */
export function resolveDownloadPolicy(input: ResolveInput): ThesisDownloadDecision {
  const override = normalizeOverride(input.override);
  const rank = input.rank;
  const isTopTen = rank != null && rank >= 1 && rank <= TOP_N_PROTECTED;

  const effectivePolicy: "allowed" | "blocked" =
    override === "allow"
      ? "allowed"
      : override === "block"
        ? "blocked"
        : isTopTen
          ? "blocked"
          : "allowed";

  const policySource: "automatic-ranking" | "admin-override" =
    override === "inherit" ? "automatic-ranking" : "admin-override";

  const base = { rank, isTopTen, effectivePolicy, policySource } as const;

  // 1. Unpublished theses are never downloadable (guards a thesis unpublished
  //    after the page loaded). Ranking view already excludes them → rank null.
  if (!input.isPublished) {
    return { allowed: false, reason: "THESIS_UNPUBLISHED", ...base };
  }

  // 2. Policy-level block (admin block, or automatic Top-10). Returned before
  //    the auth/profile gates so an anonymous visitor still sees "protected"
  //    rather than being pushed through a sign-in flow that would fail anyway.
  if (effectivePolicy === "blocked") {
    return {
      allowed: false,
      reason: override === "block" ? "ADMIN_BLOCKED" : "TOP_TEN_RESTRICTED",
      ...base,
    };
  }

  // 3. Per-user gates (only reached when policy permits download).
  if (!input.authenticated) {
    return { allowed: false, reason: "AUTHENTICATION_REQUIRED", ...base };
  }
  if (!input.profileComplete) {
    return {
      allowed: false,
      reason: "PROFILE_INCOMPLETE",
      ...base,
      missingProfileFields: input.missingProfileFields ?? [],
    };
  }
  if (!input.hasFile) {
    return { allowed: false, reason: "FILE_UNAVAILABLE", ...base };
  }

  return { allowed: true, reason: "ALLOWED", ...base };
}

/** Minimal thesis shape the engine needs from `research_reports`. */
export type ThesisPolicyRow = {
  id: string;
  is_published: boolean | null;
  status?: string | null;
  file_url: string | null;
  download_override?: string | null;
};

/** Look up a single thesis's global Top-N rank (null when not publicly ranked). */
export async function getThesisRank(
  service: SupabaseClient,
  reportId: string,
): Promise<number | null> {
  const { data, error } = await service
    .from("research_report_rankings")
    .select("rank")
    .eq("report_id", reportId)
    .maybeSingle();
  if (error) return null;
  return (data?.rank as number | undefined) ?? null;
}

/** Rank map for the current Top-N (id → rank) — for listing/detail badges. */
export async function getTopThesisRanks(
  service: SupabaseClient,
  topN = TOP_N_PROTECTED,
): Promise<Map<string, number>> {
  const { data, error } = await service
    .from("research_report_rankings")
    .select("report_id, rank")
    .lte("rank", topN)
    .order("rank", { ascending: true });
  const map = new Map<string, number>();
  if (error || !data) return map;
  for (const r of data as { report_id: string; rank: number }[]) {
    map.set(r.report_id, r.rank);
  }
  return map;
}

/**
 * DB-backed evaluation: gathers rank + (if signed in) profile completeness,
 * then resolves the decision. `service` must be a service-role client (reads
 * the ranking view + profile row, both service-only).
 */
export async function evaluateThesisDownload(args: {
  service: SupabaseClient;
  report: ThesisPolicyRow;
  userId: string | null;
}): Promise<ThesisDownloadDecision> {
  const { service, report, userId } = args;

  const isPublished =
    report.is_published === true &&
    (report.status == null || report.status === "published");

  // Rank is only meaningful for published theses; skip the query otherwise.
  const rank = isPublished ? await getThesisRank(service, report.id) : null;

  let profileComplete = false;
  let missingProfileFields: DownloadProfileField[] = [];
  if (userId) {
    const status = await getDownloadProfileStatus(userId, service);
    profileComplete = status.complete;
    missingProfileFields = status.missingFields;
  }

  return resolveDownloadPolicy({
    isPublished,
    hasFile: !!report.file_url,
    override: normalizeOverride(report.download_override),
    rank,
    authenticated: !!userId,
    profileComplete,
    missingProfileFields,
  });
}
