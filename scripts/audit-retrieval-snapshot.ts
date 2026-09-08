// scripts/audit-retrieval-snapshot.ts
//
//   npx tsx scripts/audit-retrieval-snapshot.ts
//
// READ-ONLY production inventory for the retrieval-quality audit. Answers the
// questions a benchmark cannot: how much of the collection is even eligible to
// be retrieved. Coverage and retrieval quality are different failures with
// different fixes, and a recall number that mixes them names neither.
//
// Every statement here is a SELECT. Nothing in this file writes.

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log(`# Retrieval audit snapshot`);
  console.log(`target: ${url}`);
  console.log(`taken:  ${new Date().toISOString()}\n`);

  async function count(table: string, apply: (q: any) => any = (q) => q) {
    const { count, error } = await apply(
      db.from(table).select("*", { count: "exact", head: true }),
    );
    if (error) return `ERR ${error.message}`;
    return count ?? 0;
  }

  // ── 1. Index health, straight from the view the admin panel reads ──────────
  const { data: health, error: healthErr } = await db
    .from("public_resource_index_health")
    .select("*");
  console.log("## Index health (public_resource_index_health)");
  if (healthErr) console.log(`ERROR: ${healthErr.message}`);
  else console.table(health);

  // ── 2. Books ───────────────────────────────────────────────────────────────
  console.log("\n## Books");
  const published = await count("books", (q: any) => q.eq("is_published", true));
  console.log(`published books:            ${published}`);
  console.log(`total book rows:            ${await count("books")}`);

  // ── 3. Embedding coverage ──────────────────────────────────────────────────
  console.log("\n## Embedding coverage");
  console.log(`books w/ embedding:         ${await count("books", (q: any) =>
    q.eq("is_published", true).not("embedding", "is", null))}`);
  console.log(`books w/o embedding:        ${await count("books", (q: any) =>
    q.eq("is_published", true).is("embedding", null))}`);
  console.log(`book_chunks rows:           ${await count("book_chunks")}`);
  console.log(`book_chunks w/o embedding:  ${await count("book_chunks", (q: any) =>
    q.is("embedding", null))}`);
  console.log(`book_pages rows:            ${await count("book_pages")}`);


  // ── 4. Freshness / recency ─────────────────────────────────────────────────
  console.log("\n## Recency");
  const now = Date.now();
  for (const days of [7, 30]) {
    const since = new Date(now - days * 86400_000).toISOString();
    console.log(`books created last ${days}d:   ${await count("books", (q: any) =>
      q.eq("is_published", true).gte("created_at", since))}`);
  }

  // ── 5. Metadata gaps ───────────────────────────────────────────────────────
  console.log("\n## Metadata gaps (published books)");
  console.log(`missing author_names:       ${await count("books", (q: any) =>
    q.eq("is_published", true).is("author_names", null))}`);
  console.log(`missing category:           ${await count("books", (q: any) =>
    q.eq("is_published", true).is("category_id", null))}`);
  console.log(`missing isbn:               ${await count("books", (q: any) =>
    q.eq("is_published", true).is("isbn", null))}`);
  console.log(`missing description:        ${await count("books", (q: any) =>
    q.eq("is_published", true).is("description", null))}`);

  // ── 6. Index state distribution ────────────────────────────────────────────
  console.log("\n## resource_index_state by status");
  const { data: states, error: stErr } = await db
    .from("resource_index_state")
    .select("record_type,status,failure_kind");
  if (stErr) console.log(`ERROR: ${stErr.message}`);
  else {
    const tally: Record<string, number> = {};
    for (const r of states ?? []) {
      const k = `${r.record_type}/${r.status}${r.failure_kind ? `:${r.failure_kind}` : ""}`;
      tally[k] = (tally[k] ?? 0) + 1;
    }
    console.table(Object.entries(tally).map(([k, v]) => ({ bucket: k, n: v })));
  }

}

main().catch((e) => { console.error(e); process.exit(1); });
