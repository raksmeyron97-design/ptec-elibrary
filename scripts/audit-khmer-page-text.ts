// scripts/audit-khmer-page-text.ts
//
//   npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/audit-khmer-page-text.ts
//
// HOW MUCH OF THE KHMER FULL TEXT IS READABLE?
//
// A Khmer answer is only as good as the pages it quotes, and a Khmer PDF whose
// font has no usable ToUnicode map extracts as a stream of correctly-encoded
// but WRONG code points — real Khmer characters in an order that spells
// nothing. Measured by hand during the 2026-09-17 AI quality audit, one
// retrieved passage read:
//
//   តាម្ ំណ្ត រ់ សម្ក្ សប រ ីម្ បីតាម្ ដ្ឋន្ វឌ្ ឍន្ ភាពរបស់សិសស។
//
// Nothing downstream can tell that from Khmer prose: it passes every filter,
// clears the lexical floor, and reaches the model as evidence. Only a reader
// can see it — which is why it needs a number rather than an anecdote.
//
// THE TEST IS STRUCTURAL, and deliberately conservative. Khmer writes a
// syllable as a consonant plus zero or more dependent marks with no spaces, so
// well-formed Khmer has LONG runs and FEW spaces. Mojibake of this kind breaks
// into short fragments separated by spaces, because the broken glyph mapping
// emits a space wherever the font had a ligature. So the signal is: a page
// whose Khmer runs are mostly one or two characters long. Real Khmer never
// looks like that, and a page of Khmer single letters is not something a
// cataloguer would publish.
//
// Read-only: one bounded sample of `book_pages`, no writes.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createServiceClient } from "@/lib/supabase/server";

import { assessKhmerText } from "@/lib/ai/page-quality";

/** Pages sampled. Bounded so the audit costs one query per batch. */
const SAMPLE = Number(process.argv.find((a) => a.startsWith("--sample="))?.split("=")[1] ?? 4000);

const KHMER = /[\u1780-\u17FF]/u;

async function main() {
  const db = createServiceClient();
  let khmerPages = 0;
  let brokenPages = 0;
  let scanned = 0;
  const brokenRecords = new Set<string>();
  const khmerRecords = new Set<string>();
  const examples: string[] = [];
  const stats: { meanRun: number; orphanShare: number; unreadable: boolean }[] = [];

  for (let from = 0; from < SAMPLE; from += 1000) {
    const { data, error } = await db
      .from("book_pages")
      .select("record_id, page_no, content")
      .order("record_id", { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error(error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data as { record_id: string; page_no: number; content: string }[]) {
      scanned++;
      if (!KHMER.test(row.content ?? "")) continue;
      const v = assessKhmerText(row.content);
      if (!v.khmer) continue;
      khmerPages++;
      khmerRecords.add(row.record_id);
      stats.push({ meanRun: v.meanRun, orphanShare: v.orphanShare, unreadable: v.unreadable });
      if (v.unreadable) {
        brokenPages++;
        brokenRecords.add(row.record_id);
        if (examples.length < 3) examples.push(`${row.record_id} p.${row.page_no}: ${row.content.slice(0, 110)}`);
      }
    }
  }

  // The distributions the thresholds are set from. Printed so moving either
  // number means re-reading this table rather than guessing.
  const q = (xs: number[], p: number) => {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };
  const f = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : "  —  ");
  console.log("\n            meanRun                        orphanShare");
  console.log("            p05    p50    p95      |  p05    p50    p95    max");
  for (const [label, rows] of [["readable", stats.filter((x) => !x.unreadable)], ["unreadable", stats.filter((x) => x.unreadable)]] as const) {
    const mr = rows.map((x) => x.meanRun);
    const os = rows.map((x) => x.orphanShare);
    console.log(
      `  ${label.padEnd(10)}${f(q(mr, 0.05))}  ${f(q(mr, 0.5))}  ${f(q(mr, 0.95))}   |  ${f(q(os, 0.05))}  ${f(q(os, 0.5))}  ${f(q(os, 0.95))}  ${f(Math.max(...os))}`,
    );
  }

  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
  console.log(`scanned pages            ${scanned}`);
  console.log(`Khmer-language pages     ${khmerPages}  (${pct(khmerPages, scanned)} of sample)`);
  console.log(`  of those, unreadable   ${brokenPages}  (${pct(brokenPages, khmerPages)})`);
  console.log(`records with Khmer text  ${khmerRecords.size}`);
  console.log(`  with unreadable pages  ${brokenRecords.size}  (${pct(brokenRecords.size, khmerRecords.size)})`);
  if (examples.length) {
    console.log("\nexamples:");
    for (const e of examples) console.log("  " + e);
  }
  const orphanSuspect = stats.filter((x) => !x.unreadable && x.orphanShare > 0.12).length;
  console.log(
    `\nORPHANED MARKS (reported, NOT dropped): ${orphanSuspect} further pages (${pct(orphanSuspect, khmerPages)} of Khmer pages)` +
      ` carry more runs beginning with a dependent vowel than 95% of the readable population does.`,
  );
  console.log(
    "  These may be a second flavour of the same extraction fault, or they may be ordinary Khmer this heuristic",
  );
  console.log(
    "  cannot read — the two distributions overlap (see lib/ai/page-quality.ts), so no threshold separates them and",
  );
  console.log(
    "  nothing is filtered on it. Deciding needs a Khmer reader looking at the pages, not a bigger regex.",
  );
  console.log(
    "\nA page the fragmentation rule drops is still INDEXED and still findable by phrase search; it is only refused",
  );
  console.log("an evidence slot. Repair path: scripts/repair-khmer-pages.ts (Gemini Vision OCR).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
