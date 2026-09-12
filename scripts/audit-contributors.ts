// scripts/audit-contributors.ts
//
//   npx tsx scripts/audit-contributors.ts
//   npx tsx scripts/audit-contributors.ts --names-file docs/seo/author-names.json
//   npx tsx scripts/audit-contributors.ts --json docs/seo/composite-authors-audit.json
//
// Reports and changes NOTHING. READ-ONLY by contract: it opens no write path,
// and the Supabase client it builds is only ever `select`ed from.
//
// It answers one question for every contributor expression in the library:
// what does this string actually name, and can that be decided safely?
//
// WHY THIS EXISTS
// ───────────────
// `books.author` is free text off a title page and `books.author_id` is a
// SINGULAR foreign key, so a multi-author book stored its whole byline as one
// `authors` row. Measured on production 2026-09-12: 47 of 157 author entities
// (30%) were several people published as one, 16 carried a role word inside
// the person's name, and at least 7 were corporate bodies — one of them the
// institution itself (docs/SEO-3.0-AUDIT.md F-1..F-3).
//
// Deciding which of those rows may be split is a DATA decision with URL
// consequences: one composite URL maps to 2-5 new ones and therefore has no
// single 301 target. This script produces the evidence for that decision; it
// never takes it. Nothing here writes to a database, and the categories it
// emits are deterministic — the same input always lands in the same bucket.
//
// ── Where the names come from ───────────────────────────────────────────────
//
// `--names-file` takes a JSON array of {name, url} and is how PRODUCTION is
// audited: .env.local on a developer machine may point at a local stack, so a
// database query here is NOT evidence about production. The production list is
// derived over HTTP from the /authors hub's own ItemList JSON-LD.
//
// Without it, the script reads the `authors` table of whatever Supabase the
// environment names, and prints which project that was so the output cannot be
// mistaken for production.

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { normalizeByline, extractRole } from "../lib/resources/contributor-identity";
import { parseAuthorNames } from "../lib/resources/author-names";
import type { OrgIdentity } from "../lib/system-settings/org-identity";

/** Deterministic disposition for one historical contributor expression. */
type Category =
  | "SAFE_SINGLE"          // one person, nothing to decide
  | "SAFE_MULTIPLE"        // several people, separable deterministically
  | "ORGANIZATION"         // a corporate body
  | "INSTITUTION"          // the site's own published identity
  | "AMBIGUOUS"            // names more than one entity, not safely separable
  | "EMPTY";               // no usable text

type Row = {
  id?: string;
  slug?: string | null;
  name: string;
  url?: string;
  /** Published books this `authors` row is the FK target of. The URL-risk
   *  evidence: a composite with works has an indexed page that means
   *  something; one with none is a slug nobody follows. */
  resourceCount?: number;
  category: Category;
  role: string;
  contributorCount: number;
  contributors: string[];
  hadRoleMarker: boolean;
  safeToSplit: boolean;
  reason: string;
  urlRisk: "none" | "review" | "high";
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function classify(name: string, org?: OrgIdentity): Row {
  const normalized = normalizeByline(name, org);
  const { role } = extractRole(name);
  const hadRoleMarker = extractRole(name).name !== name.replace(/\s+/g, " ").trim();
  const contributors = normalized.contributors.map((c) => c.displayName);
  const kinds = new Set(normalized.contributors.map((c) => c.kind));

  const base = { name, role, contributors, hadRoleMarker, contributorCount: contributors.length };

  if (!normalized.sourceText) {
    return { ...base, category: "EMPTY", safeToSplit: false, urlRisk: "none",
      reason: "No usable text." };
  }
  if (kinds.has("institution")) {
    return { ...base, category: "INSTITUTION", safeToSplit: false, urlRisk: "review",
      reason: "Matches the published institutional identity; must reference the existing #organization node, never a Person." };
  }
  if (kinds.has("organization")) {
    return { ...base, category: "ORGANIZATION", safeToSplit: false, urlRisk: "none",
      reason: "Corporate body. One entity — splitting its name would fabricate several." };
  }
  if (contributors.length > 1) {
    return { ...base, category: "SAFE_MULTIPLE", safeToSplit: true, urlRisk: "high",
      reason: `Separable into ${contributors.length} people, but the existing URL has no single 301 target.` };
  }
  if (contributors.length === 1) {
    return { ...base, category: "SAFE_SINGLE", safeToSplit: false, urlRisk: "none",
      reason: hadRoleMarker
        ? "One person; a cataloguer role marker is not part of the name."
        : "One person." };
  }
  return { ...base, category: "AMBIGUOUS", safeToSplit: false, urlRisk: "review",
    reason: parseAuthorNames(name).length > 1
      ? "Names more than one entity but cannot be separated safely (an inverted name is indistinguishable from a two-name list)."
      : "Could not be resolved." };
}

type SourceRow = {
  id?: string;
  name: string;
  url?: string;
  slug?: string | null;
  resourceCount?: number;
};

async function loadNames(): Promise<{ source: string; rows: SourceRow[] }> {
  const file = arg("--names-file");
  if (file) {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return { source: `file:${file}`, rows: parsed };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or pass --names-file.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("authors").select("id, name, slug").order("name");
  if (error) {
    console.error("Read failed:", error.message);
    process.exit(1);
  }

  // How many published books each row is credited on — one query for the whole
  // roster, counted here, rather than one per author.
  const counts = new Map<string, number>();
  const { data: books } = await db
    .from("books")
    .select("author_id")
    .eq("is_published", true)
    .limit(5000);
  for (const b of (books ?? []) as { author_id: string | null }[]) {
    if (b.author_id) counts.set(b.author_id, (counts.get(b.author_id) ?? 0) + 1);
  }

  return {
    source: `db:${url}`,
    rows: (data ?? []).map((r: { id: string; name: string; slug: string | null }) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      url: r.slug ? `/authors/${r.slug}` : undefined,
      resourceCount: counts.get(r.id) ?? 0,
    })),
  };
}

/**
 * The §46 migration table: one row per historical contributor expression, with
 * the evidence a human needs to decide it — and no decision taken here.
 *
 * The recommended action is derived from the deterministic category and the
 * work count ONLY. It never asserts an identity: SAFE_SPLIT means "the string
 * can be separated deterministically", not "these are the right people", and
 * the URL consequence is stated beside it every time.
 */
function migrationMarkdown(rows: Row[], source: string, identity: boolean): string {
  const action = (r: Row): string => {
    if (r.category === "ORGANIZATION") return "ORGANIZATION";
    if (r.category === "INSTITUTION") return "INSTITUTION";
    if (r.category === "AMBIGUOUS" || r.category === "EMPTY") return "HUMAN_REVIEW";
    if (r.category === "SAFE_SINGLE") return "SAFE_KEEP";
    return (r.resourceCount ?? 0) > 0 ? "SAFE_SPLIT" : "SAFE_SPLIT";
  };
  const composites = rows.filter((r) => r.category === "SAFE_MULTIPLE");
  const esc = (v: string) => v.replace(/\|/g, "\\|");

  const head = [
    "| # | Name | Slug | Works | Classification | Contributors | URL risk | Recommended |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = composites.map((r, i) =>
    `| ${i + 1} | ${esc(r.name.slice(0, 80))} | \`${r.slug ?? "—"}\` | ${r.resourceCount ?? 0} | ${r.category} | ${r.contributorCount} | ${r.urlRisk} | ${action(r)} |`,
  );

  const counts = (c: Category) => rows.filter((r) => r.category === c).length;

  return [
    "<!-- GENERATED by scripts/audit-contributors.ts --markdown. Do not hand-edit. -->",
    "",
    `- Source: \`${source}\``,
    `- Institution identity supplied: ${identity ? "yes" : "**no** — INSTITUTION cannot be distinguished from ORGANIZATION"}`,
    `- Contributor expressions: ${rows.length}`,
    "",
    "| Category | Count |",
    "| --- | --- |",
    `| SAFE_SINGLE | ${counts("SAFE_SINGLE")} |`,
    `| SAFE_MULTIPLE (composite) | ${counts("SAFE_MULTIPLE")} |`,
    `| ORGANIZATION | ${counts("ORGANIZATION")} |`,
    `| INSTITUTION | ${counts("INSTITUTION")} |`,
    `| AMBIGUOUS | ${counts("AMBIGUOUS")} |`,
    `| EMPTY | ${counts("EMPTY")} |`,
    "",
    `## The composite rows (${composites.length})`,
    "",
    ...head,
    ...body,
    "",
  ].join("\n");
}

async function main() {
  const { source, rows } = await loadNames();

  // The institution is only known when an identity is supplied. Without one,
  // INSTITUTION simply never fires and those rows report as ORGANIZATION —
  // stated here rather than silently assumed.
  const identityFile = arg("--identity");
  const org: OrgIdentity | undefined = identityFile
    ? (JSON.parse(readFileSync(identityFile, "utf8")) as OrgIdentity)
    : undefined;

  // The identity fields ride ALONGSIDE the classification, not through it:
  // `classify()` is pure and knows nothing about a database row. Spreading it
  // over the source row (rather than the other way round) is what previously
  // dropped `slug` and `resourceCount` from every line of the report.
  const results: Row[] = rows.map((r) => ({
    ...classify(r.name, org),
    id: r.id,
    slug: r.slug,
    url: r.url,
    resourceCount: r.resourceCount,
  }));

  const byCategory = new Map<Category, Row[]>();
  for (const r of results) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  console.log(`\nSource: ${source}`);
  if (!org) console.log("Identity: NOT SUPPLIED — INSTITUTION cannot be distinguished from ORGANIZATION.");
  console.log(`Contributor expressions: ${results.length}\n`);

  const order: Category[] = ["SAFE_SINGLE", "SAFE_MULTIPLE", "ORGANIZATION", "INSTITUTION", "AMBIGUOUS", "EMPTY"];
  for (const category of order) {
    const list = byCategory.get(category) ?? [];
    const pct = results.length ? ((list.length / results.length) * 100).toFixed(1) : "0.0";
    console.log(`  ${category.padEnd(16)} ${String(list.length).padStart(4)}  ${pct.padStart(5)}%`);
    for (const r of list.slice(0, 3)) console.log(`      e.g. ${r.name.slice(0, 72)}`);
  }

  const withRole = results.filter((r) => r.hadRoleMarker).length;
  console.log(`\n  role marker inside the stored name: ${withRole}`);
  console.log(`  safe to split (URL decision required): ${results.filter((r) => r.safeToSplit).length}`);

  const markdown = arg("--markdown");
  if (markdown) {
    mkdirSync(dirname(markdown), { recursive: true });
    writeFileSync(markdown, migrationMarkdown(results, source, !!org));
    console.log(`\nWrote ${markdown}`);
  }

  const out = arg("--json");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({
      generatedAt: new Date().toISOString(),
      source,
      identitySupplied: !!org,
      total: results.length,
      counts: Object.fromEntries(order.map((c) => [c, (byCategory.get(c) ?? []).length])),
      rows: results,
    }, null, 2));
    console.log(`\nWrote ${out}`);
  }
  console.log("\nRead-only: nothing was written to any database.\n");
}

main();
