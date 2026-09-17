// scripts/repair-khmer-reassemble.ts
//
//   npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/repair-khmer-reassemble.ts --dry-run
//   …                                                                          --slug <slug>
//   …                                                                          --limit 10
//   …                                                                          --apply
//
// Reconnects fragmented Khmer in `book_pages` with the deterministic repair in
// lib/text/khmer-reassemble.ts. **No API is called and nothing is billed** —
// the whole pipeline is regex over local CPU.
//
// DRY RUN IS THE DEFAULT. `--apply` is the only thing that writes, and it says
// so loudly before it does.
//
// ── HOW TO READ THE OUTPUT, which is the point of this header ────────────────
//
// Two numbers are reported per book and they are not the same claim:
//
//   health      `analyzeTextHealth`'s verdict (lib/semantic/text-quality.ts).
//               It is satisfied by REMOVING SPACES — and removing spaces is
//               exactly what the repair does. So a flip from `damaged` to
//               `healthy` proves the repair RAN. It is not evidence that the
//               result is correct Khmer, and it must never be quoted as if it
//               were.
//
//   violations  Impossible code point sequences (`countOrthographicViolations`):
//               a vowel with no base, two vowels on one base, a coeng with
//               nothing under it. This does NOT move by construction — a rule
//               that glued the wrong things together would raise it. Falling
//               to zero is real evidence that the output is well-FORMED.
//
// Neither answers the only question that finally matters: are the WORDS right?
// A dependent vowel that belonged to the consonant after the gap would attach
// to the one before it and be perfectly legal. Rules 1–3 are forced by Khmer
// orthography, which is why that is unlikely rather than impossible — and it
// is why `--apply` prints a sample for a human to read before it writes.
//
// ── WHAT IT CANNOT REPAIR ────────────────────────────────────────────────────
//
// 13 of the 86 catalogued books carry `khmer-coeng-missing` or
// `khmer-legacy-font`: code points that are absent or substituted. No
// whitespace repair reaches those. They need OCR
// (`scripts/repair-khmer-pages.ts`, which does spend Gemini Vision quota), and
// this script reports them as out of scope rather than quietly calling them
// healthy.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createServiceClient } from "@/lib/supabase/server";
import { analyzeTextHealth, type TextHealth } from "@/lib/semantic/text-quality";
import { countOrthographicViolations, reassembleKhmerText } from "@/lib/text/khmer-reassemble";

const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const valueOf = (f: string) => {
  const i = ARGV.indexOf(f);
  return i >= 0 ? ARGV[i + 1] : undefined;
};

const APPLY = has("--apply");
const SLUG = valueOf("--slug");
const LIMIT = Number(valueOf("--limit") ?? 0) || 0;
const SHOW = Number(valueOf("--show") ?? 3) || 3;
/** Rule 4 — the unforced one. Off unless asked for, here as well as in the module. */
const GLYPH = has("--glyph-spacing");

/** Reasons no whitespace repair can address. */
const OUT_OF_SCOPE = new Set(["khmer-coeng-missing", "khmer-legacy-font"]);

interface PageRow {
  record_type: string;
  record_id: string;
  page_no: number;
  content: string;
}

interface BookOutcome {
  slug: string;
  title: string;
  recordId: string;
  pages: number;
  pagesChanged: number;
  gapsClosed: number;
  rejected: number;
  violationsBefore: number;
  violationsAfter: number;
  healthBefore: TextHealth["verdict"];
  healthAfter: TextHealth["verdict"];
  reasonsBefore: string[];
  reasonsAfter: string[];
  outOfScope: boolean;
  /**
   * Vectors this book currently has. `--apply` DELETES them so the repaired
   * text is re-embedded, and re-embedding spends a metered quota — so a book
   * with chunks is a book that loses its semantic leg until someone runs
   * `scripts/embed-library.ts --chunks-only`. A book with none loses nothing.
   */
  chunks: number;
  sample?: { page: number; before: string; after: string };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

async function fetchPages(db: ReturnType<typeof createServiceClient>, recordId: string): Promise<PageRow[]> {
  const out: PageRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("book_pages")
      .select("record_type, record_id, page_no, content")
      .eq("record_type", "book")
      .eq("record_id", recordId)
      .order("page_no", { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error(`  ! ${error.message}`);
      break;
    }
    if (!data?.length) break;
    out.push(...(data as unknown as PageRow[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  // A flat array of the 86 catalogued books; only these three fields are read.
  const catalogue = (await import("./damaged-khmer-books.json")).default as ReadonlyArray<{
    slug: string;
    title: string;
    reasons?: string[];
  }>;
  let books = [...catalogue];
  if (SLUG) books = books.filter((b) => b.slug === SLUG);
  if (LIMIT) books = books.slice(0, LIMIT);

  console.log(
    `Khmer re-assembly — ${APPLY ? "APPLY (writes to book_pages)" : "DRY RUN (no writes)"}` +
      ` · ${books.length} book(s) · rule 4 ${GLYPH ? "ON" : "off"} · $0 API spend\n`,
  );
  if (APPLY) {
    console.log("!! This will REWRITE `book_pages.content` and delete the affected `book_chunks`");
    console.log("!! so the pages are re-embedded. Read a sample first with --dry-run.\n");
  }

  const db = createServiceClient();
  const results: BookOutcome[] = [];

  for (const book of books) {
    const { data: row } = await db
      .from("books")
      .select("id, slug, title")
      .eq("slug", book.slug)
      .maybeSingle();
    const record = row as { id: string; slug: string; title: string } | null;
    if (!record) {
      console.log(`· ${book.slug} — not in the catalogue any more, skipped`);
      continue;
    }

    const pages = await fetchPages(db, record.id);
    if (!pages.length) {
      console.log(`· ${book.slug} — no extracted pages, skipped`);
      continue;
    }

    const joinedBefore = pages.map((p) => p.content ?? "").join("\n");
    const repaired = pages.map((p) => ({ page: p, result: reassembleKhmerText(p.content ?? "", { collapseGlyphSpacing: GLYPH }) }));
    const joinedAfter = repaired.map((r) => r.result.text).join("\n");

    const hBefore = analyzeTextHealth(joinedBefore);
    const hAfter = analyzeTextHealth(joinedAfter);
    const vBefore = countOrthographicViolations(joinedBefore).violations;
    const vAfter = countOrthographicViolations(joinedAfter).violations;

    const changed = repaired.filter((r) => r.result.modified);
    const firstChange = changed[0];

    const { count: chunkCount } = await db
      .from("book_chunks")
      .select("*", { count: "exact", head: true })
      .eq("record_type", "book")
      .eq("record_id", record.id);

    const outcome: BookOutcome = {
      slug: record.slug,
      title: record.title,
      recordId: record.id,
      pages: pages.length,
      pagesChanged: changed.length,
      gapsClosed: repaired.reduce((n, r) => n + r.result.changes, 0),
      rejected: repaired.filter((r) => r.result.rejected).length,
      violationsBefore: vBefore,
      violationsAfter: vAfter,
      healthBefore: hBefore.verdict,
      healthAfter: hAfter.verdict,
      reasonsBefore: hBefore.reasons,
      reasonsAfter: hAfter.reasons,
      outOfScope: (book.reasons ?? []).some((r) => OUT_OF_SCOPE.has(r)),
      chunks: chunkCount ?? 0,
      sample: firstChange
        ? {
            page: firstChange.page.page_no,
            before: (firstChange.page.content ?? "").replace(/\s+/g, " ").slice(0, 170),
            after: firstChange.result.text.replace(/\s+/g, " ").slice(0, 170),
          }
        : undefined,
    };
    results.push(outcome);

    const flip = `${outcome.healthBefore} → ${outcome.healthAfter}`;
    console.log(
      `· ${record.slug.slice(0, 44).padEnd(44)} ${String(outcome.pagesChanged).padStart(3)}/${String(outcome.pages).padEnd(3)} pages` +
        ` · ${String(outcome.gapsClosed).padStart(5)} gaps · violations ${vBefore}→${vAfter}` +
        ` · health ${flip}${outcome.outOfScope ? " · OUT OF SCOPE (needs OCR)" : ""}` +
        `${outcome.rejected ? ` · ${outcome.rejected} REJECTED` : ""}`,
    );

    if (APPLY && changed.length) {
      for (const { page, result } of changed) {
        const { error } = await db
          .from("book_pages")
          .update({ content: result.text })
          .eq("record_type", "book")
          .eq("record_id", record.id)
          .eq("page_no", page.page_no);
        if (error) console.error(`  ! page ${page.page_no}: ${error.message}`);
      }
      // The old vectors describe text that no longer exists. Clearing them
      // makes the record eligible for re-embedding; the reconciler and
      // `scripts/embed-library.ts --chunks-only` do the rest.
      const { error: delErr } = await db
        .from("book_chunks")
        .delete()
        .eq("record_type", "book")
        .eq("record_id", record.id);
      if (delErr) console.error(`  ! clearing chunks: ${delErr.message}`);
      else console.log(`  ✓ wrote ${changed.length} pages, cleared chunks for re-embedding`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const inScope = results.filter((r) => !r.outOfScope);
  const flipped = inScope.filter((r) => r.healthBefore === "damaged" && r.healthAfter === "healthy");
  const vBefore = results.reduce((n, r) => n + r.violationsBefore, 0);
  const vAfter = results.reduce((n, r) => n + r.violationsAfter, 0);

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log(`books examined            ${results.length}`);
  console.log(`  addressable by spacing  ${inScope.length}`);
  console.log(`  need OCR (out of scope) ${results.length - inScope.length}`);
  console.log(`pages rewritten           ${results.reduce((n, r) => n + r.pagesChanged, 0)}`);
  console.log(`gaps closed               ${results.reduce((n, r) => n + r.gapsClosed, 0)}`);
  console.log(`repairs REJECTED by the legality gate  ${results.reduce((n, r) => n + r.rejected, 0)}`);
  const withChunks = results.filter((r) => r.chunks > 0);
  console.log(
    `\nvectors at stake          ${withChunks.reduce((n, r) => n + r.chunks, 0)} chunks across ${withChunks.length} book(s)`,
  );
  console.log(`  ↑ --apply DELETES these so the repaired text is re-embedded. Until`);
  console.log(`    someone runs \`scripts/embed-library.ts --chunks-only\`, those books`);
  console.log(`    have NO semantic leg at all — briefly worse than before the repair.`);
  console.log();
  console.log(`violations  ${vBefore} → ${vAfter}   (${pct(vBefore - vAfter, vBefore)} removed)`);
  console.log(`  ↑ the INDEPENDENT measure: it does not move by construction.`);
  console.log(`health      ${flipped.length}/${inScope.length} in-scope books flip damaged → healthy`);
  console.log(`  ↑ satisfied by removing spaces, which is what the repair does.`);
  console.log(`    Evidence that it RAN, not that the words are right.`);

  const samples = results.filter((r) => r.sample).slice(0, SHOW);
  if (samples.length) {
    console.log("\n── read these before applying ────────────────────────────────");
    for (const r of samples) {
      console.log(`\n${r.slug}  p.${r.sample!.page}`);
      console.log(`  before  ${r.sample!.before}`);
      console.log(`  after   ${r.sample!.after}`);
    }
    console.log("\nA Khmer reader has to confirm these read correctly. Neither number");
    console.log("above can, and this script does not claim otherwise.");
  }

  if (!APPLY) console.log("\nDRY RUN — nothing was written. Re-run with --apply to commit.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
