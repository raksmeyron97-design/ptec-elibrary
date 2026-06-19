/* scripts/embed-library.ts
 *
 * Backfill embeddings for books, research_reports, and catalog_books.
 *
 * Setup:
 *   npm i -D dotenv tsx
 *
 * Run:
 *   npx tsx scripts/embed-library.ts            # only rows missing an embedding
 *   npx tsx scripts/embed-library.ts --all      # re-embed everything
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY
 */

import { config } from "dotenv";
// tsx does NOT auto-load env like Next.js. Load .env.local then .env explicitly.
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.");
  console.error("  Loaded:", {
    url: Boolean(SUPABASE_URL),
    service_key: Boolean(SERVICE_KEY),
    gemini_key: Boolean(GEMINI_KEY),
  });
  process.exit(1);
}

const REEMBED_ALL = process.argv.includes("--all");

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768; // must match the vector(768) columns
const BATCH = 20; // texts per Gemini embed call
const PAGE = 200; // rows fetched per DB page

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

// ── Embedding ────────────────────────────────────────────────────────────────
function normalize(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / mag);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts,
    config: { outputDimensionality: EMBED_DIM, taskType: "RETRIEVAL_DOCUMENT" },
  });
  const embs = res.embeddings ?? [];
  if (embs.length !== texts.length) {
    throw new Error(`embedding count ${embs.length} != input ${texts.length}`);
  }
  return embs.map((e) => normalize(e.values ?? []));
}

function clean(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

// ── Per-table config ─────────────────────────────────────────────────────────
type TableJob = {
  table: string;
  select: string;
  toText: (row: any) => string;
};

const JOBS: TableJob[] = [
  {
    table: "books",
    select: "id, title, description, department, tags, embedding, authors(name), categories(name)",
    toText: (b) =>
      [
        clean(b.title),
        clean(b.authors?.name),
        clean(b.categories?.name),
        clean(b.department),
        clean(b.description),
        Array.isArray(b.tags) ? b.tags.map(clean).join(" ") : "",
      ]
        .filter(Boolean)
        .join(" — "),
  },
  {
    table: "research_reports",
    select: "id, title, abstract, author_names, keywords, department, subject, embedding",
    toText: (r) =>
      [
        clean(r.title),
        clean(r.author_names),
        clean(r.subject),
        clean(r.department),
        clean(r.abstract),
        Array.isArray(r.keywords) ? r.keywords.map(clean).join(" ") : "",
      ]
        .filter(Boolean)
        .join(" — "),
  },
  {
    table: "catalog_books",
    select: "id, title, description, author, category, department, keywords, embedding",
    toText: (c) =>
      [
        clean(c.title),
        clean(c.author),
        clean(c.category),
        clean(c.department),
        clean(c.description),
        Array.isArray(c.keywords) ? c.keywords.map(clean).join(" ") : "",
      ]
        .filter(Boolean)
        .join(" — "),
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────
async function processTable(job: TableJob): Promise<{ embedded: number; failed: number }> {
  console.log(`\n▶ ${job.table}`);
  let embedded = 0;
  let failed = 0;
  let skippedEmpty = 0;

  // Scan every row once via range pagination (works for both modes, no shifting
  // window and no infinite loop).
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await db
      .from(job.table)
      .select(job.select)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`  ✖ fetch failed:`, error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    // Pick rows that need embedding.
    const items = rows
      .filter((r: any) => REEMBED_ALL || r.embedding == null)
      .map((r: any) => ({ id: r.id as string, text: job.toText(r) }));

    const embeddable = items.filter((x) => x.text.length > 0);
    skippedEmpty += items.length - embeddable.length;

    for (let i = 0; i < embeddable.length; i += BATCH) {
      const slice = embeddable.slice(i, i + BATCH);

      let vecs: number[][];
      try {
        vecs = await embedBatch(slice.map((x) => x.text));
      } catch (e) {
        console.error(`\n  ✖ embed failed, retrying once:`, (e as Error).message);
        await new Promise((r) => setTimeout(r, 1500));
        vecs = await embedBatch(slice.map((x) => x.text)); // throws loudly if it fails again
      }

      // Update each row and CHECK the result — this is what surfaces silent failures.
      const results = await Promise.all(
        slice.map((x, k) => db.from(job.table).update({ embedding: vecs[k] }).eq("id", x.id)),
      );
      for (const r of results) {
        if (r.error) {
          failed++;
          if (failed <= 3) console.error(`\n  ✖ update error:`, r.error.message);
        } else {
          embedded++;
        }
      }
      process.stdout.write(`\r  embedded ${embedded}, failed ${failed}…`);
    }

    if (rows.length < PAGE) break;
  }

  console.log(
    `\r  ✔ ${job.table}: ${embedded} embedded, ${failed} failed, ${skippedEmpty} skipped (empty text)`,
  );
  return { embedded, failed };
}

// Verify final state straight from the DB so we KNOW it worked.
async function verify() {
  console.log("\n── Final state (live from DB) ──");
  for (const job of JOBS) {
    const { count: total } = await db
      .from(job.table)
      .select("id", { count: "exact", head: true });
    const { count: missing } = await db
      .from(job.table)
      .select("id", { count: "exact", head: true })
      .is("embedding", null);
    const ok = (missing ?? 0) === 0;
    console.log(`  ${ok ? "✔" : "✖"} ${job.table}: ${(total ?? 0) - (missing ?? 0)}/${total ?? 0} embedded`);
  }
}

(async () => {
  let totalFailed = 0;
  for (const job of JOBS) {
    const { failed } = await processTable(job);
    totalFailed += failed;
  }
  await verify();
  if (totalFailed > 0) {
    console.error(`\n⚠ ${totalFailed} update(s) failed — see errors above.`);
    process.exit(1);
  }
  console.log("\n✅ Done. Semantic search is now live.");
  process.exit(0);
})();