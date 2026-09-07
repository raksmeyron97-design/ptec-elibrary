/* scripts/audit-khmer-corpus.ts
 *
 * Audit and categorize published books in the library corpus to diagnose
 * Khmer text health and damage modes (coeng dropped, coeng detached,
 * legacy font encoding, glyph spacing, or no text).
 *
 * Run:
 *   npx tsx scripts/audit-khmer-corpus.ts
 *   npx tsx scripts/audit-khmer-corpus.ts --limit 20
 *   npx tsx scripts/audit-khmer-corpus.ts --only <slug>
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyzeTextHealth, type TextDamageReason } from "../lib/semantic/text-quality";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const argv = process.argv.slice(2);
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};
const ONLY = valueOf("--only");
const LIMIT = Number(valueOf("--limit") ?? "0") || 0;

type BookMeta = {
  id: string;
  slug: string;
  title: string;
  book_files?: { file_url: string | null }[] | null;
  language: string | null;
};

type AuditResult = {
  slug: string;
  title: string;
  language: string | null;
  pageCount: number;
  script: string;
  verdict: "healthy" | "damaged" | "no-text" | "unknown";
  reasons: TextDamageReason[];
  sampleExcerpt: string;
};

async function fetchBookSample(bookId: string): Promise<{ pageCount: number; sample: string }> {
  // Fetch up to 10 pages for a representative sample
  const { data, error } = await db
    .from("book_pages")
    .select("page_no, content")
    .eq("record_type", "book")
    .eq("record_id", bookId)
    .order("page_no", { ascending: true })
    .limit(10);

  if (error) {
    console.warn(`    ⚠ Failed to fetch pages for ${bookId}: ${error.message}`);
    return { pageCount: 0, sample: "" };
  }

  const pages = data ?? [];
  const sample = pages.map((p) => p.content).join("\n\n");
  return { pageCount: pages.length, sample };
}

async function main() {
  console.log("\n========================================================");
  console.log(" 🔍 Khmer Corpus Audit & Categorization Tool");
  console.log(` Target Database: ${SUPABASE_URL}`);
  console.log("========================================================\n");

  let query = db
    .from("books")
    .select("id, slug, title, book_files(file_url), language")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (ONLY) query = query.eq("slug", ONLY);
  if (LIMIT > 0) query = query.limit(LIMIT);

  const { data: books, error } = await query;
  if (error) {
    console.error("✖ Failed to fetch books:", error.message);
    process.exit(1);
  }

  const allBooks = (books ?? []) as BookMeta[];
  console.log(`Examining ${allBooks.length} published book(s)...\n`);

  const results: AuditResult[] = [];
  const reasonTally: Record<string, number> = {};
  const verdictTally: Record<string, number> = {
    healthy: 0,
    damaged: 0,
    "no-text": 0,
    unknown: 0,
  };
  const categoryCounts = {
    legacyFont: 0,
    coengMissing: 0,
    coengDetached: 0,
    glyphSpacing: 0,
    orphanedVowels: 0,
    scannedOrEmpty: 0,
  };

  for (const book of allBooks) {
    const { pageCount, sample } = await fetchBookSample(book.id);

    if (pageCount === 0 || sample.trim().length === 0) {
      verdictTally["no-text"]++;
      categoryCounts.scannedOrEmpty++;
      results.push({
        slug: book.slug,
        title: book.title,
        language: book.language,
        pageCount: 0,
        script: "unknown",
        verdict: "no-text",
        reasons: [],
        sampleExcerpt: "(no text in book_pages)",
      });
      continue;
    }

    const health = analyzeTextHealth(sample);
    verdictTally[health.verdict] = (verdictTally[health.verdict] ?? 0) + 1;

    if (health.verdict === "damaged") {
      let isLegacy = false;
      let isMissing = false;
      let isDetached = false;
      let isSpacing = false;
      let isOrphan = false;

      for (const r of health.reasons) {
        reasonTally[r] = (reasonTally[r] ?? 0) + 1;
        if (r === "khmer-legacy-font") isLegacy = true;
        if (r === "khmer-coeng-missing") isMissing = true;
        if (r === "khmer-coeng-detached") isDetached = true;
        if (r === "khmer-glyph-spacing") isSpacing = true;
        if (r === "khmer-vowels-orphaned") isOrphan = true;
      }

      if (isLegacy) categoryCounts.legacyFont++;
      if (isMissing) categoryCounts.coengMissing++;
      if (isDetached) categoryCounts.coengDetached++;
      if (isSpacing) categoryCounts.glyphSpacing++;
      if (isOrphan) categoryCounts.orphanedVowels++;
    }

    results.push({
      slug: book.slug,
      title: book.title,
      language: book.language,
      pageCount,
      script: health.script,
      verdict: health.verdict,
      reasons: health.reasons,
      sampleExcerpt: sample.slice(0, 100).replace(/\s+/g, " "),
    });
  }

  // Summary Report
  console.log("--------------------------------------------------------");
  console.log("📊 Summary by Verdict:");
  console.log(`  Healthy (ready for topics/search):  ${verdictTally.healthy}`);
  console.log(`  Damaged (Khmer font/coeng defects): ${verdictTally.damaged}`);
  console.log(`  No text (scanned / unindexed):     ${verdictTally["no-text"]}`);
  console.log(`  Unknown (too short sample):        ${verdictTally.unknown}`);
  console.log("--------------------------------------------------------");

  console.log("🔬 Breakdown of Khmer Damage Modes:");
  console.log(`  1. Legacy Font (Latin/IPA cmap):   ${categoryCounts.legacyFont}`);
  console.log(`  2. Coeng Missing (dropped ្):       ${categoryCounts.coengMissing}`);
  console.log(`  3. Coeng Detached (spaced off ្):   ${categoryCounts.coengDetached}`);
  console.log(`  4. Glyph-level Spacing:             ${categoryCounts.glyphSpacing}`);
  console.log(`  5. Orphaned Dependent Vowels:       ${categoryCounts.orphanedVowels}`);
  console.log(`  6. Scanned / No text extracted:     ${categoryCounts.scannedOrEmpty}`);
  console.log("--------------------------------------------------------\n");

  const damagedBooks = results.filter((r) => r.verdict === "damaged");
  if (damagedBooks.length > 0) {
    console.log(`Top ${Math.min(15, damagedBooks.length)} Damaged Books for Pilot Inspection:`);
    for (const b of damagedBooks.slice(0, 15)) {
      console.log(`  • [${b.slug}] "${b.title}"`);
      console.log(`    Reasons: ${b.reasons.join(", ")}`);
      console.log(`    Sample:  ${b.sampleExcerpt}`);
    }
  }

  console.log("\n✅ Audit complete.");
}

main().catch((err) => {
  console.error("✖ Fatal error during audit:", err);
  process.exit(1);
});
