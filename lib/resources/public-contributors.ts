import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { ResourceType } from "./types";
import {
  resolveContributors,
  type CanonicalContributorRow,
  type ContributorReadResult,
} from "./contributor-view";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";
import type { ContributorRole } from "./types";

// Cookieless, cache-backed contributor read for PUBLIC, prerendered pages.
//
// Unlike lib/resources/contributors.ts (which uses the cookie-bound anon client
// and is fine in dynamic/admin contexts), this variant uses the service client
// wrapped in unstable_cache so a public page stays statically renderable — it
// never touches cookies. It reads only published-resource credits, which are
// public anyway; the service client just avoids the cookie dependency.
//
// ── A failed read is not an empty one ───────────────────────────────────────
//
// The original version of this file returned [] for every outcome — no rows,
// no table (pre-0105), a timeout, a permissions error. A caller could not tell
// "this work's author is unknown" from "the database did not answer", so a
// transient failure rendered a page with no byline, no author JSON-LD and no
// author link: an SEO relationship silently deleted for the life of the cache
// entry.
//
// The read now THROWS on a query error, which does two things at once: the
// failure is never cached (unstable_cache stores nothing for a rejected call),
// and the caller gets `source: "unavailable"` and falls back to the legacy
// byline instead of publishing an absence it cannot vouch for. A genuinely
// missing table — every row `null`, which is what PostgREST answers before the
// canonical migrations are applied — is still an ordinary empty result.

const SELECT =
  "role, sequence, display_name_override, " +
  "contributors:contributor_id ( id, display_name, name_km, contributor_type, source )";

type Embedded = {
  id: string;
  display_name: string;
  name_km: string | null;
  contributor_type: string | null;
  source: string | null;
};

type RawRow = {
  role: ContributorRole;
  sequence: number;
  display_name_override: string | null;
  // PostgREST types a single-FK embed as an array; it is an object at runtime.
  contributors: Embedded | Embedded[] | null;
};

function toCanonicalRow(row: RawRow): CanonicalContributorRow {
  const c = Array.isArray(row.contributors) ? row.contributors[0] : row.contributors;
  const type = c?.contributor_type;
  return {
    contributorId: c?.id ?? null,
    displayName: (row.display_name_override ?? c?.display_name ?? "").trim(),
    nameKm: c?.name_km ?? null,
    contributorType: type === "organization" || type === "person" ? type : null,
    recordSource: c?.source ?? null,
    role: row.role,
    sequence: typeof row.sequence === "number" ? row.sequence : 0,
  };
}

/**
 * Raw canonical credits for one resource. Throws when the query errors, so a
 * failure is neither cached nor mistaken for an empty result.
 */
const loadCanonicalRows = unstable_cache(
  async (resourceType: ResourceType, resourceId: string): Promise<CanonicalContributorRow[]> => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("resource_contributors")
      .select(SELECT)
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .order("sequence", { ascending: true });

    if (error) {
      // PostgREST's code for "relation does not exist" — the pre-0105 case,
      // which is an ordinary absence and must not degrade a page.
      if (error.code === "42P01") return [];
      throw new Error(`resource_contributors read failed: ${error.message}`);
    }
    return ((data ?? []) as unknown as RawRow[]).map(toCanonicalRow);
  },
  ["public-resource-contributors"],
  { revalidate: 300, tags: ["books", "theses", "publications"] },
);

/**
 * THE PUBLIC CONTRIBUTOR READ. Canonical credits when the graph has them, the
 * legacy byline when it does not, and an explicit `source` either way.
 *
 * Every public consumer — JSON-LD, the visible byline, citation exports, the
 * author link — should call this rather than reading either source directly,
 * so the four cannot disagree about who a work is by.
 */
export async function getPublicResourceContributors(
  resourceType: ResourceType,
  resourceId: string,
  legacy?: {
    byline?: string | null;
    bylines?: readonly (string | null | undefined)[] | null;
    org?: OrgIdentity;
  },
): Promise<ContributorReadResult> {
  let rows: CanonicalContributorRow[] | null = null;
  let available = true;
  try {
    rows = await loadCanonicalRows(resourceType, resourceId);
  } catch {
    available = false;
  }

  return resolveContributors({
    canonical: rows,
    canonicalAvailable: available,
    legacyByline: legacy?.byline,
    legacyBylines: legacy?.bylines,
    org: legacy?.org,
  });
}

/**
 * Author display names only, in recorded order.
 *
 * Kept as the compatibility shape for callers that genuinely need strings (a
 * `citation_author` meta tag, a joined byline). Anything that decides an
 * ENTITY TYPE must use `getPublicResourceContributors()` instead — re-deriving
 * a kind from one of these strings is the round trip SEO 3.2 removed.
 */
export async function getPublicResourceAuthors(
  resourceType: ResourceType,
  resourceId: string,
): Promise<string[]> {
  try {
    const rows = await loadCanonicalRows(resourceType, resourceId);
    return rows
      .filter((r) => r.role === "author" && r.displayName.length > 0)
      .map((r) => r.displayName);
  } catch {
    return [];
  }
}
