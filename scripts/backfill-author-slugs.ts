/* scripts/backfill-author-slugs.ts
 *
 * Reconcile every author profile slug against slugify() — the JS function the
 * application actually uses to build /authors/<slug>.
 *
 * WHY THIS EXISTS. Migration 0125 backfills `publication_authors.slug` and
 * `authors.slug` in SQL, with `[^[:alnum:]]` standing in for JavaScript's
 * `\p{L}\p{M}\p{N}`. The two character classes agree on everything this
 * library holds today, but they are not the same specification, and the cost
 * of a disagreement is a profile URL that no longer resolves — including
 * production URLs that already exist, like
 * /authors/javier-garc%C3%ADa-mart%C3%ADnez.
 *
 * So the SQL backfill is best-effort and THIS is the authority. Run it once
 * after 0125 is applied. It is idempotent: a second run reports zero changes.
 *
 * WHAT IT WILL NOT DO. It never rewrites a slug that already matches what
 * slugify() produces from the name, and with --dry (the default) it changes
 * nothing at all — it prints what it would do. A slug an admin has chosen by
 * hand WILL be flagged as a mismatch, because this script cannot tell a
 * deliberate choice from a bad backfill; read the report before passing
 * --apply, and use --only-missing if all you want is to fill the blanks.
 *
 * Run:
 *   npx tsx scripts/backfill-author-slugs.ts                 # report only
 *   npx tsx scripts/backfill-author-slugs.ts --apply         # write changes
 *   npx tsx scripts/backfill-author-slugs.ts --apply --only-missing
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { slugify } from "../lib/book-utils";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const ONLY_MISSING = process.argv.includes("--only-missing");

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Table = {
  name: "publication_authors" | "authors";
  nameColumn: "full_name" | "name";
  /** Secondary name used only when the primary is empty (Khmer-only authors). */
  fallbackColumn?: "full_name_km";
};

const TABLES: Table[] = [
  { name: "publication_authors", nameColumn: "full_name", fallbackColumn: "full_name_km" },
  { name: "authors", nameColumn: "name" },
];

type Row = Record<string, string | null>;

/**
 * Make `candidate` unique against slugs already spoken for.
 *
 * The unique index would reject a collision and abort the run partway through,
 * leaving half the table reconciled. Suffixing here mirrors what 0125's own
 * dedup loop does, so the two produce the same shape of slug.
 */
function uniqueSlug(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) return candidate;
  for (let n = 2; n < 1000; n++) {
    const next = `${candidate}-${n}`;
    if (!taken.has(next)) return next;
  }
  throw new Error(`Could not find a free slug for "${candidate}"`);
}

async function reconcile(table: Table): Promise<{ changed: number; skipped: number }> {
  const columns = ["id", table.nameColumn, "slug", table.fallbackColumn]
    .filter(Boolean)
    .join(", ");

  const { data, error } = await db.from(table.name).select(columns).limit(5000);
  if (error) {
    console.error(`✖ ${table.name}: ${error.message}`);
    process.exit(1);
  }

  const rows = (data ?? []) as unknown as Row[];

  // Every slug currently in use, so a rewrite cannot collide with a row this
  // run is not touching.
  const taken = new Set(rows.map((r) => r.slug).filter((s): s is string => !!s));

  let changed = 0;
  let skipped = 0;

  for (const row of rows) {
    const name =
      row[table.nameColumn]?.trim() ||
      (table.fallbackColumn ? row[table.fallbackColumn]?.trim() : null) ||
      "";
    const current = row.slug ?? null;

    if (ONLY_MISSING && current) continue;

    const desired = slugify(name);
    if (!desired) {
      console.warn(`  ? ${table.name}/${row.id}: "${name}" produces no usable slug — left alone`);
      skipped++;
      continue;
    }
    if (current === desired) continue;

    // Free the row's own slug before searching for a replacement, or a record
    // whose slug is already correct-but-for-a-suffix would suffix itself again.
    if (current) taken.delete(current);
    const next = uniqueSlug(desired, taken);
    taken.add(next);

    console.log(
      `  ${APPLY ? "→" : "·"} ${table.name}/${row.id}: ${current ?? "(none)"} → ${next}   [${name}]`,
    );

    if (APPLY) {
      const { error: updateError } = await db
        .from(table.name)
        .update({ slug: next })
        .eq("id", row.id as string);
      if (updateError) {
        console.error(`  ✖ ${table.name}/${row.id}: ${updateError.message}`);
        skipped++;
        continue;
      }
    }
    changed++;
  }

  return { changed, skipped };
}

async function main() {
  console.log(
    APPLY
      ? "Reconciling author slugs against slugify() — WRITING changes."
      : "Reconciling author slugs against slugify() — dry run. Pass --apply to write.",
  );
  if (ONLY_MISSING) console.log("Only rows with no slug will be considered.");
  console.log("");

  let changed = 0;
  let skipped = 0;
  for (const table of TABLES) {
    console.log(`${table.name}:`);
    const result = await reconcile(table);
    changed += result.changed;
    skipped += result.skipped;
    console.log("");
  }

  console.log(
    `${APPLY ? "Updated" : "Would update"} ${changed} row(s); ${skipped} skipped.` +
      (changed > 0 && !APPLY ? " Re-run with --apply to write them." : ""),
  );
  if (APPLY && changed > 0) {
    console.log(
      "Any changed slug retires the URL it replaces. /authors/[slug] falls back to " +
        "name matching, so an old link still resolves — but update the sitemap by " +
        "redeploying, and expect a short reindex window.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
