// Embedding progress, read from the DATABASE — the carriage-return progress
// writer makes the run's own log unreadable. Read-only.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { createServiceClient } = await import("../lib/supabase/server");
  const db = createServiceClient();

  const keys = async (table: string) => {
    const seen = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select("record_type, record_id").range(from, from + 999);
      if (error || !data?.length) break;
      for (const r of data as { record_type: string; record_id: string }[]) seen.add(`${r.record_type}:${r.record_id}`);
      if (data.length < 1000) break;
    }
    return seen;
  };

  const pages = await keys("book_pages");
  const chunked = await keys("book_chunks");
  const { count: totalChunks } = await db.from("book_chunks").select("*", { count: "exact", head: true });

  const pct = ((chunked.size / Math.max(1, pages.size)) * 100).toFixed(1);
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      records: chunked.size,
      ofRecords: pages.size,
      pct: Number(pct),
      remaining: pages.size - chunked.size,
      chunks: totalChunks ?? 0,
    }),
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
