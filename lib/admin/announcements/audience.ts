import "server-only";

import type { createServiceClient } from "@/lib/supabase/server";
import { TARGETABLE_ROLES, type AudienceType } from "./shared";

type Db = ReturnType<typeof createServiceClient>;

export interface AudienceRule {
  type: AudienceType;
  roles: string[];
  userIds: string[];
}

export interface ResolvedAudience {
  /** Active, eligible user ids matching the rule — never invented, always a
   *  real query against profiles.status = 'active'. */
  userIds: string[];
  recipientCount: number;
  /** Enabled push_subscriptions among those users — a device count, distinct
   *  from the user count (one reader can have several devices). */
  deviceCount: number;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Resolve an audience rule into real, currently-eligible recipients. ALWAYS
 * excludes disabled/pending/blocked accounts (profiles.status <> 'active'),
 * regardless of audience type. Must be called again immediately before
 * publish — never trust a client-submitted id list or count.
 */
export async function resolveAudience(db: Db, rule: AudienceRule): Promise<ResolvedAudience> {
  const empty: ResolvedAudience = { userIds: [], recipientCount: 0, deviceCount: 0 };

  let candidateIds: string[] | null = null; // null = "no extra restriction yet"

  if (rule.type === "push_enabled") {
    const { data: subs } = await db.from("push_subscriptions").select("user_id").eq("enabled", true);
    candidateIds = uniq(((subs ?? []) as { user_id: string | null }[]).map((s) => s.user_id).filter((v): v is string => !!v));
    if (candidateIds.length === 0) return empty;
  }

  if (rule.type === "individual") {
    if (rule.userIds.length === 0) return empty;
    candidateIds = uniq(rule.userIds);
  }

  let query = db.from("profiles").select("id").eq("status", "active");

  if (rule.type === "role") {
    const roles = uniq(rule.roles.filter((r) => (TARGETABLE_ROLES as readonly string[]).includes(r)));
    if (roles.length === 0) return empty;
    query = query.in("role", roles);
  }

  if (candidateIds) {
    if (candidateIds.length === 0) return empty;
    query = query.in("id", candidateIds);
  }

  const { data: profiles, error } = await query;
  if (error) {
    // Fail closed for audience resolution — an unresolved audience must never
    // silently become "everyone".
    return empty;
  }

  const userIds = ((profiles ?? []) as { id: string }[]).map((p) => p.id);
  if (userIds.length === 0) return empty;

  const { count: deviceCount } = await db
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true)
    .in("user_id", userIds);

  return { userIds, recipientCount: userIds.length, deviceCount: deviceCount ?? 0 };
}

/** Cheap estimate for the composer preview — same resolver, counts only. */
export async function estimateAudience(db: Db, rule: AudienceRule): Promise<{ recipientCount: number; deviceCount: number }> {
  const resolved = await resolveAudience(db, rule);
  return { recipientCount: resolved.recipientCount, deviceCount: resolved.deviceCount };
}
