/* scripts/repair-khmer-pages.ts
 *
 * Repairs broken Khmer-script book text in book_pages using Gemini Vision OCR.
 *
 * Usage:
 *   npx tsx scripts/repair-khmer-pages.ts --list
 *   npx tsx scripts/repair-khmer-pages.ts --index 1
 *   npx tsx scripts/repair-khmer-pages.ts --slug <book-slug>
 *   npx tsx scripts/repair-khmer-pages.ts --next 5
 *   npx tsx scripts/repair-khmer-pages.ts --all
 *
 * A repair replaces book_pages and DELETES the book_chunks and
 * resource_semantic_insights derived from the text it replaced — they were
 * computed from the damage. Pass --embed to rebuild the chunks in the same
 * run, or leave them for `npx tsx scripts/embed-library.ts`, which is the
 * cheaper order when a batch has already spent the day's Gemini quota on OCR.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { installDomMatrixPolyfill } from "../lib/polyfills/dom-matrix";
import {
  budgetedBatches,
  deleteRecordPages,
  insertBatch,
  resolvePdfUrl,
} from "../lib/pdf-page-index";
import { embedRecordChunks } from "../lib/chunk-embed";
import { sourceDigest, writeIndexState } from "../lib/indexing/state";
import { analyzeTextHealth } from "../lib/semantic/text-quality";
import { toAllowedStorageUrl } from "../lib/zima";

installDomMatrixPolyfill();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_API_KEY) {
  console.error("✖ Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY are required.");
  process.exit(1);
}

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};

const LIST_MODE = has("--list");
const ALL_MODE = has("--all");
const FORCE_REDO = has("--force");
const SLUG = valueOf("--slug");
const INDEX_ARG = valueOf("--index");
const NEXT_COUNT = Number(valueOf("--next") ?? "0") || 0;
const LIMIT_ARG = Number(valueOf("--limit") ?? "0") || 0;
const DRY_RUN = has("--dry-run");
const VERBOSE = has("--verbose");
const BATCH_SIZE = Number(valueOf("--batch-size") ?? "8") || 8;
const MAX_PAGES = Number(valueOf("--max-pages") ?? "0") || 0;
const REEMBED = has("--embed");

type DamagedBookEntry = {
  slug: string;
  title: string;
  reasons: string[];
};

function loadDamagedBooks(): DamagedBookEntry[] {
  const jsonPath = path.resolve(__dirname, "damaged-khmer-books.json");
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch {
      return [];
    }
  }
  return [];
}

type ExtractedPage = {
  pageNo: number;
  content: string;
};

async function withRetry<T>(label: string, fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  const backoffs = [3000, 8000, 20000, 45000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (attempt === maxRetries) break;

      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.includes("ResourceExhausted") ||
        err?.message?.includes("quota");

      const delay = isRateLimit ? (attempt + 1) * 30000 : (backoffs[attempt] ?? 15000);
      console.warn(
        `    ⚠ [${label}] ${isRateLimit ? "Rate limit (429)" : "failed"} (${err instanceof Error ? err.message : err}). Backing off for ${delay / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function getPdfTotalPages(bytes: ArrayBuffer): Promise<number> {
  installDomMatrixPolyfill();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  await loadingTask.destroy();
  return numPages;
}

async function transcribePageBatch(
  base64Pdf: string,
  startPage: number,
  endPage: number,
): Promise<ExtractedPage[]> {
  const pageRangeStr = startPage === endPage ? `Page ${startPage}` : `Pages ${startPage} to ${endPage}`;

  return await withRetry(`OCR ${pageRangeStr}`, async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        responseMimeType: "application/json",
      },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: base64Pdf } },
            {
              text: `Extract and transcribe all text on ${pageRangeStr} of this PDF document verbatim into clean, well-formed Khmer Unicode prose.\n` +
                `Requirements:\n` +
                `1. Output a JSON array of objects with schema: [{"pageNo": number, "content": string}].\n` +
                `2. Preserve exact Khmer words, subjoined consonants (ជើងអក្សរ), dependent/independent vowels, and punctuation.\n` +
                `3. Never separate coeng (្) or vowels from consonants with spaces.\n` +
                `4. If a page contains no text (e.g. blank page or illustration only), return content as an empty string.\n` +
                `5. Do not include summary or commentary outside the JSON array.`,
            },
          ],
        },
      ],
    });

    const rawJson = response.text || "[]";
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: any) => ({
        pageNo: Number(item.pageNo),
        content: String(item.content ?? "").trim(),
      })).filter((p) => p.pageNo >= startPage && p.pageNo <= endPage && p.content.length > 0);
    } catch (e) {
      console.warn(`    ⚠ Failed to parse JSON for ${pageRangeStr}, raw response was:`, rawJson.slice(0, 150));
      throw e;
    }
  });
}

async function repairBookBySlug(slug: string): Promise<"repaired" | "skipped" | "failed"> {
  console.log(`\n--------------------------------------------------------`);
  console.log(` 📖 Processing: "${slug}"`);
  console.log(`--------------------------------------------------------`);

  // 1. Fetch book record
  const { data: book, error: bookErr } = await db
    .from("books")
    .select("id, slug, title, book_files(file_url)")
    .eq("slug", slug)
    .single();

  if (bookErr || !book) {
    console.error(`✖ Could not find published book with slug "${slug}":`, bookErr?.message);
    return "failed";
  }

  // Idempotency: check if already healthy
  if (!FORCE_REDO) {
    const { data: existingPages } = await db
      .from("book_pages")
      .select("content")
      .eq("record_type", "book")
      .eq("record_id", book.id)
      .limit(5);

    if (existingPages && existingPages.length > 0) {
      const sample = existingPages.map((p) => p.content).join("\n\n");
      const currentHealth = analyzeTextHealth(sample);
      if (currentHealth.verdict === "healthy") {
        console.log(`   ⏩ SKIPPING: "${book.title}" is ALREADY HEALTHY in book_pages.`);
        return "skipped";
      }
    }
  }

  const files = (book.book_files ?? []) as Array<{ file_url: string | null }>;
  const rawFileUrl = files.map((f) => f.file_url).filter((u): u is string => !!u)[0];

  if (!rawFileUrl) {
    console.error(`✖ No PDF file found for book "${book.title}" (${book.id})`);
    return "failed";
  }

  console.log(`   Title: "${book.title}"`);
  console.log(`   ID:    ${book.id}`);

  // 2. Resolve PDF URL
  const resolved = await resolvePdfUrl(rawFileUrl);
  if (!resolved) {
    console.error("✖ Could not resolve PDF storage URL.");
    return "failed";
  }

  const url = toAllowedStorageUrl(resolved);
  if (!url) {
    console.error("✖ Resolved URL refused by allow-list:", resolved);
    return "failed";
  }

  // 3. Download PDF
  console.log("   📥 Downloading PDF file...");
  let arrayBuffer: ArrayBuffer;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`✖ Failed to fetch PDF (${res.status} ${res.statusText})`);
      return "failed";
    }
    arrayBuffer = await res.arrayBuffer();
  } catch (err) {
    console.error("✖ Network download error:", err);
    return "failed";
  }

  console.log(`      Size: ${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);

  const base64Pdf = Buffer.from(arrayBuffer).toString("base64");
  let totalPagesInPdf = 0;
  try {
    totalPagesInPdf = await getPdfTotalPages(arrayBuffer.slice(0));
  } catch (err) {
    console.error("✖ PDF parse error:", err);
    return "failed";
  }

  const targetPages = MAX_PAGES > 0 ? Math.min(MAX_PAGES, totalPagesInPdf) : totalPagesInPdf;
  console.log(`      Total PDF Pages: ${totalPagesInPdf} (processing ${targetPages})`);

  // 4. Batch OCR via Gemini Vision
  console.log(`   🤖 Running OCR in batches of ${BATCH_SIZE} pages...`);
  const allExtractedPages: ExtractedPage[] = [];

  for (let pFrom = 1; pFrom <= targetPages; pFrom += BATCH_SIZE) {
    const pTo = Math.min(pFrom + BATCH_SIZE - 1, targetPages);
    process.stdout.write(`      Pages ${pFrom}–${pTo}... `);
    try {
      const batchResult = await transcribePageBatch(base64Pdf, pFrom, pTo);
      allExtractedPages.push(...batchResult);
      console.log(`Done (${batchResult.length} pages)`);
    } catch (err) {
      console.error(`\n✖ Batch OCR failed for pages ${pFrom}-${pTo}:`, err);
      return "failed";
    }
    // Polite throttle to stay well below rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`   ✅ Extracted ${allExtractedPages.length} non-empty pages.`);

  if (allExtractedPages.length === 0) {
    console.warn("   ⚠ No extractable pages from OCR. Skipping write.");
    return "failed";
  }

  // 5. Evaluate Text Health Gate
  const sampleForHealthCheck = allExtractedPages
    .slice(0, 10)
    .map((p) => p.content)
    .join("\n\n");

  const health = analyzeTextHealth(sampleForHealthCheck);
  console.log(`   🩺 Text Health Verdict: ${health.verdict.toUpperCase()}`);
  console.log(`      Khmer: ${(health.khmerRatio * 100).toFixed(1)}% | Coeng: ${health.coengDensity.toFixed(3)} | Dangling: ${health.danglingCoengRatio.toFixed(3)}`);

  if (health.verdict === "damaged") {
    console.error("   ❌ Refusing to update database: Text health check FAILED.");
    console.error("      Reasons:", health.reasons);
    return "failed";
  }

  if (DRY_RUN) {
    console.log("   ℹ️ DRY RUN enabled. No changes written to database.");
    return "repaired";
  }

  // 6. Write to Supabase book_pages safely
  console.log("   💾 Writing to Supabase book_pages...");
  try {
    await deleteRecordPages(db, "book", book.id);

    // Deduplicate by pageNo to guarantee no duplicate key violation (23505)
    const pageMap = new Map<number, string>();
    for (const p of allExtractedPages) {
      const existing = pageMap.get(p.pageNo);
      if (!existing || p.content.length > existing.length) {
        pageMap.set(p.pageNo, p.content);
      }
    }
    const deduplicatedPages = Array.from(pageMap.entries())
      .map(([pageNo, content]) => ({ pageNo, content }))
      .sort((a, b) => a.pageNo - b.pageNo);

    const batches = budgetedBatches(deduplicatedPages);
    for (let i = 0; i < batches.length; i++) {
      await insertBatch(db, "book", book.id, batches[i]);
      if (VERBOSE) console.log(`      Batch ${i + 1}/${batches.length} inserted.`);
    }

    // 7. Discard everything derived from the text we just replaced.
    // book_chunks and resource_semantic_insights were computed from the
    // garbled pages; leaving them means semantic search and the assistant
    // keep serving the damage this run exists to remove, from a record that
    // now reads as healthy. Deleting is not optional — re-embedding is,
    // because it spends the metered Gemini quota the OCR pass just used.
    console.log("   🧹 Clearing chunks and semantic insights derived from the old text...");
    const { error: chunkErr } = await db
      .from("book_chunks")
      .delete()
      .eq("record_type", "book")
      .eq("record_id", book.id);
    if (chunkErr) throw new Error(`book_chunks delete: ${chunkErr.message}`);

    const { error: insightErr } = await db
      .from("resource_semantic_insights")
      .delete()
      .eq("record_type", "book")
      .eq("record_id", book.id);
    if (insightErr) throw new Error(`resource_semantic_insights delete: ${insightErr.message}`);

    let chunkCount = 0;
    if (REEMBED) {
      console.log("   🧠 Re-embedding chunks from the repaired text...");
      const embedded = await embedRecordChunks({ recordType: "book", recordId: book.id, db });
      chunkCount = embedded.embedded ? embedded.chunks : 0;
      console.log(`      ${chunkCount} chunk(s) embedded.`);
    } else {
      console.log("   ℹ️ Chunks cleared, not rebuilt. Run: npx tsx scripts/embed-library.ts");
    }

    // 8. Update resource_index_state
    const digest = sourceDigest(rawFileUrl);
    await writeIndexState(db, {
      recordType: "book",
      recordId: book.id,
      status: "indexed",
      pages: allExtractedPages.length,
      chunks: chunkCount,
      sourceDigest: digest,
    });
  } catch (err) {
    console.error("   ✖ Database write error:", err);
    return "failed";
  }

  console.log(`   🎉 SUCCESS! "${book.title}" repaired successfully.`);
  return "repaired";
}

async function main() {
  const damagedList = loadDamagedBooks();

  if (LIST_MODE) {
    console.log("\n========================================================");
    console.log(` 📚 Damaged Khmer Books List (${damagedList.length} books)`);
    console.log("========================================================\n");
    damagedList.forEach((b, idx) => {
      console.log(` [${idx + 1}] "${b.title}"`);
      console.log(`     Slug:    ${b.slug}`);
      console.log(`     Defects: ${b.reasons.join(", ")}`);
    });
    console.log("\n💡 Usage:");
    console.log("   npx tsx scripts/repair-khmer-pages.ts --index <number>");
    console.log("   npx tsx scripts/repair-khmer-pages.ts --next 3");
    console.log("   npx tsx scripts/repair-khmer-pages.ts --all\n");
    return;
  }

  let slugsToRepair: string[] = [];

  if (ALL_MODE) {
    slugsToRepair = damagedList.map((b) => b.slug);
    if (LIMIT_ARG > 0) slugsToRepair = slugsToRepair.slice(0, LIMIT_ARG);
  } else if (INDEX_ARG) {
    const idx = Number(INDEX_ARG) - 1;
    if (idx < 0 || idx >= damagedList.length) {
      console.error(`✖ Invalid index ${INDEX_ARG}. Must be between 1 and ${damagedList.length}.`);
      process.exit(1);
    }
    slugsToRepair = [damagedList[idx].slug];
  } else if (NEXT_COUNT > 0) {
    slugsToRepair = damagedList.slice(0, NEXT_COUNT).map((b) => b.slug);
  } else if (SLUG) {
    slugsToRepair = [SLUG];
  } else {
    console.log("\n========================================================");
    console.log(" 🛠️ Khmer Page Repair Tool");
    console.log("========================================================\n");
    console.log("Usage options:");
    console.log("  --all              Repair all damaged books (skips already healthy)");
    console.log("  --all --limit 5    Repair the next 5 damaged books");
    console.log("  --list             List all damaged books with index numbers");
    console.log("  --index <number>   Repair book by index (e.g. --index 1)");
    console.log("  --next <count>     Repair the next N damaged books in order");
    console.log("  --slug <slug>      Repair a specific book by slug");
    console.log("  --dry-run          Test OCR without writing to database");
    console.log("  --embed            Re-embed chunks immediately (spends Gemini quota)\n");
    return;
  }

  console.log(`\nStarting repair for ${slugsToRepair.length} book(s) ${DRY_RUN ? "(DRY RUN)" : "(LIVE UPDATE)"}...\n`);
  
  let repairedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < slugsToRepair.length; i++) {
    console.log(`\n========================================================`);
    console.log(` 🔄 [Book ${i + 1} of ${slugsToRepair.length}]`);
    console.log(`========================================================`);
    
    const outcome = await repairBookBySlug(slugsToRepair[i]);
    if (outcome === "repaired") repairedCount++;
    else if (outcome === "skipped") skippedCount++;
    else failedCount++;

    // Small pause between books
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n========================================================");
  console.log(" 🏁 Batch Repair Summary:");
  console.log(`   Total Processed:  ${slugsToRepair.length}`);
  console.log(`   Repaired (Live):  ${repairedCount}`);
  console.log(`   Skipped (Healthy): ${skippedCount}`);
  console.log(`   Failed / Errors:  ${failedCount}`);
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("✖ Fatal repair error:", err);
  process.exit(1);
});
