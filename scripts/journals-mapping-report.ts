/**
 * READ-ONLY journal mapping report (migration 0148). Writes nothing.
 *
 *   npx tsx scripts/journals-mapping-report.ts          # human-readable
 *   npx tsx scripts/journals-mapping-report.ts --json   # machine-readable
 *
 * Works on either side of the migration:
 *
 *  * BEFORE 0148 (no `journals` table) it prints the backfill PLAN: every
 *    distinct journal name the articles carry, which ones the backfill would
 *    create a journal for, and which it would refuse as ambiguous (two
 *    spellings that fold to one key). Nothing is guessed — this is the
 *    "explicit normalization report" the backfill is deterministic against.
 *  * AFTER 0148 it prints the five buckets (mapped / partial / unmapped /
 *    ambiguous / invalid, plus no_journal) from `journal_mapping_report`, and
 *    the hierarchy integrity checks: every mapped FK valid, every volume in
 *    its article's journal, every issue in its article's volume and journal,
 *    no orphan volume or issue, no public issue without a published article.
 *
 * Env (.env.local / .env, or exported — exports win):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { journalCleanName, journalMatchKey, spellingCollisions } from "../lib/journals/mapping";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL_ || !KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const asJson = process.argv.includes("--json");
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

type Pub = {
  id: string;
  slug: string;
  is_published: boolean;
  journal_name: string | null;
  volume: string | null;
  issue_no: string | null;
  journal_id?: string | null;
  volume_id?: string | null;
  issue_id?: string | null;
};

async function all<T>(table: string, select: string): Promise<{ rows: T[] | null; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) return { rows: null, error: `${error.code ?? ""} ${error.message}`.trim() };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return { rows, error: null };
}

async function main() {
  const target = new URL(URL_).host;
  const journalsProbe = await db.from("journals").select("id").limit(1);
  const hasJournals = !journalsProbe.error;

  const pubs = await all<Pub>(
    "publications",
    hasJournals
      ? "id, slug, is_published, journal_name, volume, issue_no, journal_id, volume_id, issue_id"
      : "id, slug, is_published, journal_name, volume, issue_no",
  );
  if (!pubs.rows) throw new Error(`publications unreadable: ${pubs.error}`);

  const names = pubs.rows.map((p) => p.journal_name);
  const collisions = spellingCollisions(names);
  const byKey = new Map<string, { spellings: Set<string>; articles: number; published: number }>();
  for (const p of pubs.rows) {
    const key = journalMatchKey(p.journal_name);
    if (!key) continue;
    const e = byKey.get(key) ?? { spellings: new Set<string>(), articles: 0, published: 0 };
    e.spellings.add(journalCleanName(p.journal_name)!);
    e.articles += 1;
    if (p.is_published) e.published += 1;
    byKey.set(key, e);
  }
  const plan = {
    articles: pubs.rows.length,
    published: pubs.rows.filter((p) => p.is_published).length,
    noJournalName: pubs.rows.filter((p) => !journalMatchKey(p.journal_name)).length,
    withVolume: pubs.rows.filter((p) => (p.volume ?? "").trim()).length,
    withIssue: pubs.rows.filter((p) => (p.issue_no ?? "").trim()).length,
    distinctNames: [...byKey.entries()].map(([key, e]) => ({
      key,
      spellings: [...e.spellings],
      articles: e.articles,
      published: e.published,
      backfill: collisions.has(key) ? "AMBIGUOUS — no journal created; needs an admin decision" : "create",
    })),
  };

  let after: Record<string, unknown> | null = null;
  if (hasJournals) {
    const [report, journals, volumes, issues, publicIssues] = await Promise.all([
      all<{ mapping_status: string }>("journal_mapping_report", "mapping_status"),
      all<{ id: string; is_published: boolean }>("journals", "id, is_published"),
      all<{ id: string; journal_id: string }>("journal_volumes", "id, journal_id"),
      all<{ id: string; journal_id: string; volume_id: string | null; is_published: boolean }>(
        "journal_issues",
        "id, journal_id, volume_id, is_published",
      ),
      all<{ slug: string; issue_id: string }>("journal_issues_public", "slug, issue_id"),
    ]);
    const counts: Record<string, number> = {};
    for (const r of report.rows ?? []) counts[r.mapping_status] = (counts[r.mapping_status] ?? 0) + 1;
    const jIds = new Set((journals.rows ?? []).map((j) => j.id));
    const vById = new Map((volumes.rows ?? []).map((v) => [v.id, v]));
    const iById = new Map((issues.rows ?? []).map((i) => [i.id, i]));
    const mapped = pubs.rows.filter((p) => p.journal_id);
    const problems = {
      articleJournalMissing: mapped.filter((p) => !jIds.has(p.journal_id!)).length,
      articleVolumeInOtherJournal: mapped.filter((p) => p.volume_id && vById.get(p.volume_id)?.journal_id !== p.journal_id).length,
      articleIssueInOtherJournal: mapped.filter((p) => p.issue_id && iById.get(p.issue_id)?.journal_id !== p.journal_id).length,
      articleIssueInOtherVolume: mapped.filter((p) => p.issue_id && (iById.get(p.issue_id)?.volume_id ?? null) !== (p.volume_id ?? null)).length,
      orphanVolumes: (volumes.rows ?? []).filter((v) => !jIds.has(v.journal_id)).length,
      orphanIssues: (issues.rows ?? []).filter((i) => !jIds.has(i.journal_id) || (i.volume_id && !vById.has(i.volume_id))).length,
      issueVolumeInOtherJournal: (issues.rows ?? []).filter((i) => i.volume_id && vById.get(i.volume_id)?.journal_id !== i.journal_id).length,
      publicIssuesWithoutPublishedArticle: (publicIssues.rows ?? []).filter(
        (pi) => !pubs.rows!.some((p) => p.is_published && p.issue_id === pi.issue_id),
      ).length,
    };
    after = {
      journals: journals.rows?.length ?? null,
      publishedJournals: (journals.rows ?? []).filter((j) => j.is_published).length,
      volumes: volumes.rows?.length ?? null,
      issues: issues.rows?.length ?? null,
      publicIssues: publicIssues.rows?.length ?? null,
      mappingStatus: counts,
      integrity: problems,
      readErrors: [report, journals, volumes, issues, publicIssues].map((r) => r.error).filter(Boolean),
    };
  }

  const out = { target, migration0148: hasJournals ? "applied" : "absent", plan, after };
  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`target: ${target}   0148: ${out.migration0148}`);
  console.log(`articles ${plan.articles} (published ${plan.published}); no journal name ${plan.noJournalName}; with volume ${plan.withVolume}; with issue ${plan.withIssue}`);
  console.log(`distinct journal names: ${plan.distinctNames.length}`);
  for (const n of plan.distinctNames) console.log(`  • ${JSON.stringify(n.spellings)} — ${n.articles} article(s), ${n.published} published — ${n.backfill}`);
  if (after) {
    console.log(`journals ${after.journals} (published ${after.publishedJournals}), volumes ${after.volumes}, issues ${after.issues}, public issues ${after.publicIssues}`);
    console.log("mapping:", after.mappingStatus);
    console.log("integrity (all must be 0):", after.integrity);
    if ((after.readErrors as string[]).length) console.log("read errors:", after.readErrors);
  }
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
