// lib/home-stats.ts
// Homepage statistics fetched with four parallel Supabase queries — no RPC needed.
// view/download sums are aggregated client-side (fine until books exceeds ~20k rows).
import { createServiceClient } from "@/lib/supabase/server";

export type HomeStats = {
  resources: number;
  views: number;
  downloads: number;
  members: number;
};

import { unstable_cache } from "next/cache";

export const getHomeStats = unstable_cache(
  async (): Promise<HomeStats> => {
    const db = createServiceClient();
    try {
      const [ebooks, physical, members, rows] = await Promise.all([
        db.from("books").select("id", { count: "exact", head: true }).eq("is_published", true),
        db.from("catalog_books").select("id", { count: "exact", head: true }).eq("is_active", true),
        db.from("profiles").select("id", { count: "exact", head: true }),
        db.from("books").select("view_count, download_count").eq("is_published", true),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const views     = (rows.data ?? []).reduce((s, r: any) => s + (r.view_count     ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const downloads = (rows.data ?? []).reduce((s, r: any) => s + (r.download_count ?? 0), 0);

      return {
        resources: (ebooks.count ?? 0) + (physical.count ?? 0),
        views,
        downloads,
        members: members.count ?? 0,
      };
    } catch (e) {
      console.error("[home-stats]", e);
      return { resources: 0, views: 0, downloads: 0, members: 0 };
    }
  },
  ["home-stats-counts"],
  { revalidate: 300, tags: ["home-stats"] }
);
