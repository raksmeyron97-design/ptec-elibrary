// scripts/calibrate-work-threshold.ts
//
//   npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/calibrate-work-threshold.ts
//
// WHAT THIS MEASURES
//
// `WORK_MIN_SIMILARITY` in lib/ai/retrieval.ts is the floor a book's METADATA
// vector must clear to be offered as a search result. It has been 0.25 since
// the semantic work search was written, and nothing has ever measured it.
//
// Its sibling, `CHUNK_MIN_SIMILARITY`, was 0.3 for the same reason and was
// found to be NO FILTER AT ALL: Gemini's embedding space is not centred at
// zero, so genuinely unrelated text scores 0.61–0.70 while on-topic text
// scores 0.68–0.83. It was recalibrated to 0.70 by a script exactly like this
// one, and the comment left behind says the number is "a property of the
// model, not of the library" — which is precisely why the OTHER floor, in the
// same file, against the same embedder, cannot still be 0.25 and be doing
// anything.
//
// The method is the same: ask the index a question the collection ANSWERS and
// a question it provably does not hold, and read the two distributions. A
// floor is only a filter where they separate.
//
// This is read-only. Every statement is a SELECT and an embedding call.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createServiceClient } from "@/lib/supabase/server";
import { embedQuery } from "@/lib/ai/retrieval";

/** Subjects this teacher-education collection is built around. */
const ON_TOPIC = [
  "action research in the classroom",
  "qualitative research methods",
  "how children learn to read",
  "educational assessment and evaluation",
  "teacher professional development",
  "curriculum design for primary school",
  "statistics for educational research",
  "classroom management",
];

/**
 * The same, in Khmer. Kept as its own set because the question this script
 * has to answer is whether ONE floor can serve both scripts: an embedder
 * trained mostly on English does not place a whole script's queries at the
 * same distances, and a floor chosen on English alone is then a different
 * filter in Khmer without anyone deciding that.
 */
const ON_TOPIC_KM = [
  "គរុកោសល្យ",
  "ការវាយតម្លៃសិស្ស",
  "ការស្រាវជ្រាវសកម្មភាព",
  "វិធីសាស្ត្រស្រាវជ្រាវ",
  "ការបង្រៀនភាសាខ្មែរ",
  "គណិតវិទ្យា",
  "ការគ្រប់គ្រងថ្នាក់រៀន",
  "កម្មវិធីសិក្សា",
  "ការអភិវឌ្ឍវិជ្ជាជីវៈគ្រូបង្រៀន",
  "ការអានសម្រាប់កុមារ",
];

/**
 * Subjects a teacher-education library provably does not hold. Deliberately
 * concrete and technical: a vague off-topic query is a weak control, because
 * the honest answer to it might really be a book on the shelf.
 */
const OFF_TOPIC = [
  "aortic valve replacement surgery",
  "byzantine fault tolerance in distributed systems",
  "cryptocurrency mining rig cooling",
  "submarine hull pressure design",
  "zebrafish cardiac regeneration",
  "espresso machine boiler maintenance",
  "medieval falconry equipment",
];

const OFF_TOPIC_KM = [
  "ការរុករករ៉ែក្នុងលំហ",
  "ការវះកាត់បេះដូង",
  "ការចិញ្ចឹមត្រីក្នុងទឹកសាប",
  "ការជួសជុលម៉ាស៊ីនត្រជាក់",
  "ការដាំដុះកាហ្វេនៅប្រេស៊ីល",
  "ការរចនាម៉ូតសម្លៀកបំពាក់",
  "ការបង្កាត់ពូជសត្វក្របី",
  "តារាសាស្ត្រនិងភពព្រះអង្គារ",
  "ការលេងអុកចត្រង្គកម្រិតខ្ពស់",
  "ការសាងសង់ស្ពានចង្អូរ",
];

const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : "  —  ");

async function topSimilarities(query: string): Promise<number[]> {
  const { vector } = await embedQuery(query);
  if (!vector) return [];
  const db = createServiceClient();
  // The floor is passed as 0 so the RAW distribution is visible: asking with
  // the floor already applied would only ever show what the floor admits.
  const { data, error } = await db.rpc("match_library", {
    query_embedding: vector,
    match_count: 5,
    min_similarity: 0,
  });
  if (error) {
    console.error("  match_library:", error.message);
    return [];
  }
  return ((data ?? []) as { similarity: number }[]).map((r) => Number(r.similarity));
}

async function main() {
  const db = createServiceClient();
  const { count } = await db
    .from("books")
    .select("*", { count: "exact", head: true })
    .eq("is_published", true)
    .not("embedding", "is", null);
  console.log(`books with a metadata embedding: ${count ?? "?"}\n`);

  const rows: Array<{ set: string; query: string; top1: number; top5: number[] }> = [];
  for (const [set, queries] of [
    ["on-topic", ON_TOPIC],
    ["off-topic", OFF_TOPIC],
    ["on-km", ON_TOPIC_KM],
    ["off-km", OFF_TOPIC_KM],
  ] as const) {
    for (const q of queries) {
      const sims = await topSimilarities(q);
      rows.push({ set, query: q, top1: sims[0] ?? NaN, top5: sims });
      console.log(`${set.padEnd(9)} ${fmt(sims[0] ?? NaN)}  ${q}`);
    }
  }

  console.log("\n            top-1 similarity");
  console.log("            min     p05     median  max");
  for (const set of ["on-topic", "off-topic", "on-km", "off-km"] as const) {
    const t = rows.filter((r) => r.set === set).map((r) => r.top1).filter(Number.isFinite);
    console.log(
      `  ${set.padEnd(10)}${fmt(Math.min(...t))}   ${fmt(pct(t, 0.05))}   ${fmt(pct(t, 0.5))}   ${fmt(Math.max(...t))}`,
    );
  }

  // What each candidate floor would admit. The number to choose is the one
  // that keeps the on-topic column high while emptying the off-topic one.
  console.log("\n  floor   latin: kept / admitted    khmer: kept / admitted");
  const on = rows.filter((r) => r.set === "on-topic");
  const off = rows.filter((r) => r.set === "off-topic");
  const onKm = rows.filter((r) => r.set === "on-km");
  const offKm = rows.filter((r) => r.set === "off-km");
  const over = (xs: typeof rows, floor: number) => xs.filter((r) => r.top1 >= floor).length;
  for (const floor of [0.25, 0.4, 0.5, 0.55, 0.6, 0.62, 0.65, 0.68, 0.7, 0.72, 0.75]) {
    console.log(
      `  ${floor.toFixed(2)}    ${String(over(on, floor)).padStart(2)}/${on.length}  /  ${String(over(off, floor)).padStart(2)}/${off.length}` +
        `             ${String(over(onKm, floor)).padStart(2)}/${onKm.length}  /  ${String(over(offKm, floor)).padStart(2)}/${offKm.length}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
