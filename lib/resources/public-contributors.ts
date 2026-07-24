import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { ResourceType } from "./types";

// Cookieless, cache-backed author read for PUBLIC, prerendered detail pages.
//
// Unlike lib/resources/contributors.ts (which uses the cookie-bound anon client
// and is fine in dynamic/admin contexts), this variant uses the service client
// wrapped in unstable_cache so a public page stays statically renderable — it
// never touches cookies. It reads only published-resource authors, which are
// public anyway; the service client just avoids the cookie dependency.
//
// DEFENSIVE: before the canonical migrations (0104–0109) are applied the
// resource_contributors table does not exist, the query returns null, and this
// yields [] — so every caller falls back cleanly to its legacy author field.
// Once contributors are backfilled it transparently returns them in order.
//
// Cache key includes the (resourceType, resourceId) arguments automatically.
export const getPublicResourceAuthors = unstable_cache(
  async (resourceType: ResourceType, resourceId: string): Promise<string[]> => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("resource_contributors")
      .select("display_name_override, contributors:contributor_id ( display_name )")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .eq("role", "author")
      .order("sequence", { ascending: true });
    if (!data) return [];
    // PostgREST types a single-FK embed as an array; it is an object at runtime.
    const rows = data as unknown as Array<{
      display_name_override: string | null;
      contributors: { display_name: string } | { display_name: string }[] | null;
    }>;
    const out: string[] = [];
    for (const r of rows) {
      const c = Array.isArray(r.contributors) ? r.contributors[0] : r.contributors;
      const name = r.display_name_override ?? c?.display_name ?? "";
      if (name.trim().length > 0) out.push(name);
    }
    return out;
  },
  ["public-resource-authors"],
  { revalidate: 300, tags: ["books", "theses"] },
);
