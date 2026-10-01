// scripts/seo-import-subject-intros.ts
//
//   npx tsx scripts/seo-import-subject-intros.ts [--file content/drafts/subject-intros.json]           # dry run
//   npx tsx scripts/seo-import-subject-intros.ts [--file …] --apply                                    # write
//
// Imports APPROVED subject introductions and English names into `categories`
// (0161; SEO Phase 2.2). Entries still marked `needs_review` are skipped; an
// approved entry that fails a rule (80–150 English words, no review marker, a
// Khmer text whose km_review is cleared) is refused whole. The rules are
// lib/seo/intro-drafts.ts, shared with the tests.
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, and prints the
// target host before anything else. Without --apply it writes nothing. Run it
// against the local stack first; against production only as a librarian's
// deliberate step (docs/seo/RUNBOOK.md). Pages show the change within an hour
// (the subject reads are cached under the categories tag), or at once after
// any category save in the admin.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { planSubjectIntro, type SubjectIntroEntry } from "../lib/seo/intro-drafts";

const fileIdx = process.argv.indexOf("--file");
const FILE = fileIdx > -1 ? process.argv[fileIdx + 1] : "content/drafts/subject-intros.json";
const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const doc = JSON.parse(readFileSync(FILE, "utf8")) as { subjects?: SubjectIntroEntry[] };
  const entries = doc.subjects ?? [];

  const plans = entries.map((e) => ({ entry: e, plan: planSubjectIntro(e) }));
  const writes = plans.flatMap((p) => (p.plan.kind === "write" ? [p.plan.update] : []));
  const refused = plans.filter((p) => p.plan.kind === "refuse");
  const skipped = plans.filter((p) => p.plan.kind === "skip").length;

  console.log(`${FILE}: ${entries.length} entries — ${writes.length} approved and valid, ${refused.length} refused, ${skipped} still in review`);
  for (const r of refused) {
    if (r.plan.kind === "refuse") console.log(`  refused ${r.entry.slug}: ${r.plan.problems.join("; ")}`);
  }
  for (const w of writes) {
    console.log(`  ${APPLY ? "write" : "would write"} ${w.slug}: ${w.name_en ? `name_en "${w.name_en}", ` : ""}intro_en ${w.intro_en ? "yes" : "no"}, intro_km ${w.intro_km ? "yes" : "no"}`);
  }
  if (writes.length === 0) return;
  if (!APPLY) {
    console.log("Dry run: nothing written. Add --apply to write.");
    return;
  }
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to apply.");
    process.exitCode = 2;
    return;
  }
  console.log(`Target: ${new URL(url).host}`);
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let failed = 0;
  for (const { slug, ...fields } of writes) {
    // Ask for the affected row: a PostgREST update that matches nothing
    // succeeds with no error, and an import that "succeeded" into no row is
    // the failure this check exists for.
    const { data, error } = await supabase.from("categories").update(fields).eq("slug", slug).select("slug");
    if (error || !data || data.length !== 1) {
      failed += 1;
      console.error(`  FAILED ${slug}: ${error?.message ?? `${data?.length ?? 0} rows matched`}`);
    }
  }
  console.log(`${writes.length - failed} written, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
