// scripts/audit-orphans.ts
//
//   npx tsx scripts/audit-orphans.ts
//
// Derived rows whose parent resource no longer exists. Read-only, and it
// deletes NOTHING: an orphan is classified, never swept. Some of these rows
// are garbage, some are history someone may still need, and the difference is
// a policy decision rather than something a script should take on its own.
//
//   safe_cleanup   the row is unreachable and carries no history
//   needs_review   the row is unreachable but represents someone's work
//   historical     retained on purpose — audit and analytics evidence
//
// Every check is "rows in a derived table whose parent id is gone".

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

type Klass = "safe_cleanup" | "needs_review" | "historical";

/** A derived table, the column holding its parent id, and the parent table. */
const CHECKS: {
  table: string; fk: string; parent: string; klass: Klass; why: string;
  typeCol?: string; typeVal?: string;
}[] = [
  { table: "book_pages",   fk: "record_id", parent: "books", typeCol: "record_type", typeVal: "book",
    klass: "safe_cleanup", why: "extracted text for a deleted book — re-derivable, and it can surface in search" },
  { table: "book_chunks",  fk: "record_id", parent: "books", typeCol: "record_type", typeVal: "book",
    klass: "safe_cleanup", why: "embeddings for a deleted book — a ghost citation risk in AI answers" },
  { table: "resource_index_state", fk: "record_id", parent: "books", typeCol: "record_type", typeVal: "book",
    klass: "safe_cleanup", why: "index bookkeeping for a resource that is gone" },
  { table: "book_files",   fk: "book_id",   parent: "books",
    klass: "needs_review", why: "a stored PDF nothing references — check storage before removing the row" },
  { table: "reading_list_items", fk: "record_id", parent: "books", typeCol: "record_type", typeVal: "book",
    klass: "needs_review", why: "a reader saved this; a deleted book must disappear from their list" },
  { table: "book_annotations", fk: "book_id", parent: "books",
    klass: "needs_review", why: "a reader's own notes on a deleted book" },
  { table: "reviews",      fk: "book_id",   parent: "books",
    klass: "needs_review", why: "a reader's review of a deleted book" },
  { table: "file_health",  fk: "record_id", parent: "books", typeCol: "record_type", typeVal: "book",
    klass: "safe_cleanup", why: "health probe results for a resource that is gone" },
];

async function ids(db: any, table: string, col: string): Promise<Set<string>> {
  const out = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select(col).range(from, from + 999);
    if (error) throw new Error(`${table}.${col}: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) if (r[col]) out.add(r[col]);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const bookIds = await ids(db, "books", "id");
  console.log(`\nOrphan audit — ${bookIds.size} books exist — ${new Date().toISOString()}\n`);

  const rows: Record<string, unknown>[] = [];
  for (const c of CHECKS) {
    let childIds: Set<string>;
    try {
      if (c.typeCol) {
        const out = new Set<string>();
        let from = 0;
        for (;;) {
          const { data, error } = await db.from(c.table).select(c.fk)
            .eq(c.typeCol, c.typeVal!).range(from, from + 999);
          if (error) throw new Error(error.message);
          if (!data?.length) break;
          for (const r of data as any[]) if (r[c.fk]) out.add(r[c.fk]);
          if (data.length < 1000) break;
          from += 1000;
        }
        childIds = out;
      } else {
        childIds = await ids(db, c.table, c.fk);
      }
    } catch (err) {
      rows.push({ table: c.table, parents: "ERR", orphans: (err as Error).message.slice(0, 40), class: "—" });
      continue;
    }
    const orphans = [...childIds].filter((id) => !bookIds.has(id));
    rows.push({
      table: c.table, parents: childIds.size, orphans: orphans.length,
      class: orphans.length ? c.klass : "clean",
    });
    if (orphans.length) console.log(`  ${c.table}: ${orphans.length} orphaned — ${c.why}`);
  }
  console.table(rows);
  const total = rows.reduce((n, r) => n + (typeof r.orphans === "number" ? (r.orphans as number) : 0), 0);
  console.log(total === 0 ? "No orphaned rows found." : `${total} orphaned rows — classified above, none deleted.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
export {};
