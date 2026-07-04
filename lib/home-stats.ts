// lib/home-stats.ts
// Homepage statistics fetched via the get_home_stats() RPC (migration 0024) —
// a single DB round-trip that aggregates counts/sums server-side.
import { createServiceClient } from "@/lib/supabase/server";

export type HomeStats = {
  resources: number;
  views: number;
  downloads: number;
  members: number;
};

import { unstable_cache } from "next/cache";

const EMPTY_STATS: HomeStats = { resources: 0, views: 0, downloads: 0, members: 0 };

export const getHomeStats = unstable_cache(
  async (): Promise<HomeStats> => {
    const db = createServiceClient();
    try {
      const { data, error } = await db.rpc("get_home_stats");
      if (error) throw error;

      const stats = data as Partial<HomeStats> | null;
      return {
        resources: Number(stats?.resources ?? 0),
        views: Number(stats?.views ?? 0),
        downloads: Number(stats?.downloads ?? 0),
        members: Number(stats?.members ?? 0),
      };
    } catch (e) {
      console.error("[home-stats]", e);
      return EMPTY_STATS;
    }
  },
  ["home-stats-counts"],
  { revalidate: 300, tags: ["home-stats"] }
);
