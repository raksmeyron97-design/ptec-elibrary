"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeReadingStats, type ReadingStats, type ReadingProgressRow } from "@/lib/dashboard/reading-stats";

export type { ReadingStats };

export async function getReadingStats(): Promise<ReadingStats | null> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();
  const { data: progress } = await db
    .from("reading_progress")
    .select("progress_pct, last_read_at, books(pages, categories(name))")
    .eq("user_id", user.id)
    .gt("progress_pct", 0);

  return computeReadingStats((progress ?? []) as unknown as ReadingProgressRow[]);
}
