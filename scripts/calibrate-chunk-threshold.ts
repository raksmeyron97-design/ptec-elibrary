// scripts/calibrate-chunk-threshold.ts
//
//   npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/calibrate-chunk-threshold.ts
//
// WHY
// ───
// `CHUNK_MIN_SIMILARITY` exists so a scoped question the document cannot
// answer retrieves NOTHING, rather than the document's four least-unrelated
// pages. At 0.3 it does not do that: measured against production, a question
// about zebrafish cardiac regeneration scores 0.686–0.704 against a research
// methods textbook, and a diesel turbocharger question scores 0.641–0.665.
// Gemini's embedding space is not centred at zero, so 0.3 admits everything
// and `no-evidence correctness` was 0/8.
//
// A threshold picked by eye from three probes would be no better grounded, so
// this measures both distributions against labels that already exist:
//   ON-TOPIC  — the retrieval benchmark's scoped questions, whose answering
//               pages were verified against real `book_pages` text.
//   OFF-TOPIC — fixed questions about subjects this library does not hold,
//               asked of those same books.
// It then reports the separation and what each candidate cut-off would cost.

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { generateEmbedding } from "../lib/ai/provider";

const OFF_TOPIC = [
  "What does the book say about zebrafish cardiac regeneration protocols?",
  "How do I repair a diesel engine turbocharger?",
  "What is the optimal cooling layout for a cryptocurrency mining rig?",
];

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const doc = JSON.parse(readFileSync("scripts/retrieval-benchmark/questions.json", "utf8"));
  const questions = (Array.isArray(doc) ? doc : doc.questions).filter(
    (q: any) => q.category === "single_document" && q.scope?.slug,
  );

  const { data: books } = await db.from("books").select("id,slug,title").eq("is_published", true);
  const bySlug = new Map((books ?? []).map((b: any) => [b.slug, b]));

  const onTopic: number[] = [];
  const offTopic: number[] = [];

  const offVecs = await Promise.all(OFF_TOPIC.map(async (q) => (await generateEmbedding(q))[0]));

  let n = 0;
  for (const q of questions) {
    const book = bySlug.get(q.scope.slug);
    if (!book) continue;
    n++;
    const vec = (await generateEmbedding(q.question))[0];
    const { data } = await db.rpc("match_record_chunks", {
      query_embedding: vec, p_record_type: "book", p_record_id: book.id,
      match_count: 1, min_similarity: 0,
    });
    if (data?.[0]) onTopic.push(Number(data[0].similarity));

    // one off-topic probe per book, rotating, so the off set spans the corpus
    const off = offVecs[n % offVecs.length];
    const { data: od } = await db.rpc("match_record_chunks", {
      query_embedding: off, p_record_type: "book", p_record_id: book.id,
      match_count: 1, min_similarity: 0,
    });
    if (od?.[0]) offTopic.push(Number(od[0].similarity));
  }

  const stat = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const pct = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
    return { n: s.length, min: s[0], p05: pct(5), p25: pct(25), median: pct(50), p75: pct(75), p95: pct(95), max: s[s.length - 1] };
  };

  console.log(`\nON-TOPIC  (top-1 similarity for a question the book answers)`);
  console.table([stat(onTopic)]);
  console.log(`OFF-TOPIC (top-1 similarity for a subject the book does not hold)`);
  console.table([stat(offTopic)]);

  console.log(`\ncandidate thresholds — kept = on-topic retained, leaked = off-topic admitted`);
  const rows = [];
  for (const t of [0.30, 0.60, 0.65, 0.68, 0.70, 0.72, 0.74, 0.75, 0.76, 0.78]) {
    rows.push({
      threshold: t,
      "on-topic kept": `${onTopic.filter((v) => v > t).length}/${onTopic.length}`,
      "off-topic leaked": `${offTopic.filter((v) => v > t).length}/${offTopic.length}`,
    });
  }
  console.table(rows);
}
main().catch((e) => { console.error(e); process.exit(1); });
