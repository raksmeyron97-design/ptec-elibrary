/* scripts/sync-all-to-koha.ts
 *
 * Send the e-Library's descriptions and keywords to the Koha records that
 * lack them — once, before the sync starts carrying them both ways.
 *
 * WHY. Description (520) and keywords (653) used to be e-Library-only: the
 * PMB converter wrote no 520, and nothing the e-Library saved reached Koha.
 * Now the sync makes Koha's value win WHEN KOHA HAS ONE (lib/koha/sync-plan.ts)
 * and saving writes them to Koha first (lib/koha/marc-write.ts). This fills the
 * gap left from before: every linked record where the e-Library has a
 * description or keywords and Koha has none.
 *
 * WHAT IT WILL NOT DO.
 *   • It never overwrites: a field Koha already holds is left alone. Where
 *     both sides hold DIFFERENT text it only reports it — those are the
 *     records whose e-Library text the next sync replaces with Koha's (and
 *     logs as `description_replaced`). Read that list before deploying.
 *   • A description that only restates the record ("Social sciences by
 *     Martin Ann M. DDC call number: 300 MAR.") is not a summary and is not
 *     sent (lib/catalogs/derived-description.ts).
 *   • Without --apply it writes nothing. Each write goes through the same
 *     path as the admin's Save (updateBiblio: read, change only these fields,
 *     PUT once, never retried).
 *
 * Run:
 *   npx tsx scripts/sync-all-to-koha.ts                    # dry run: report only
 *   npx tsx scripts/sync-all-to-koha.ts --only 1086        # one Koha record
 *   npx tsx scripts/sync-all-to-koha.ts --apply            # write (needs KOHA_INTEGRATION=write)
 *   npx tsx scripts/sync-all-to-koha.ts --apply --limit 20 # a first small batch
 *   npx tsx scripts/sync-all-to-koha.ts --apply --only 1086 --overwrite-koha
 *       # after a person has read the ≠ report: the e-Library's text replaces Koha's for that record
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the Koha
 * settings (KOHA_INTEGRATION, KOHA_BASE_URL, KOHA_CLIENT_ID, KOHA_CLIENT_SECRET).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { createKohaClient, kohaPath } from "../lib/koha/client";
import { resolveKohaConfig } from "../lib/koha/config";
import { KohaError } from "../lib/koha/errors";
import { pickWritable, updateBiblio } from "../lib/koha/biblio-write";
import { isMarcInJson, projectBiblio, type MarcInJson } from "../lib/koha/projection";
import type { WritableBookFields } from "../lib/koha/marc-write";

const { values: args } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    only: { type: "string" },
    "overwrite-koha": { type: "boolean", default: false },
    limit: { type: "string" },
  },
});
const APPLY = args.apply && !args["dry-run"];
const ONLY = args.only ? Number(args.only) : null;
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const OVERWRITE = args["overwrite-koha"];
if (args.only && !(Number.isInteger(ONLY) && ONLY! > 0)) fail("--only takes a Koha biblio number, e.g. --only 1086.");
if (args.limit && !(Number.isInteger(LIMIT) && LIMIT > 0)) fail("--limit takes a positive number.");

function fail(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) fail("Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const kohaCfg = resolveKohaConfig(process.env);
if (kohaCfg.mode === "off") fail("KOHA_INTEGRATION is off. Set it to read (dry run) or write (--apply).");
if (APPLY && kohaCfg.mode !== "write" && kohaCfg.mode !== "mock") fail(`--apply needs KOHA_INTEGRATION=write (it is ${kohaCfg.mode}).`);
for (const p of kohaCfg.problems) console.log(`  ✖ ${p}`);
const koha = createKohaClient(kohaCfg);

type Row = {
  id: string; slug: string; koha_biblio_id: number; title: string; author: string | null; publisher: string | null;
  category: string | null; department: string | null; ddc: string | null; shelf_location: string | null;
  description: string | null; keywords: string[] | null;
};

async function rows(): Promise<Row[]> {
  const out: Row[] = [];
  const cols = "id, slug, koha_biblio_id, title, author, publisher, category, department, ddc, shelf_location, description, keywords";
  for (let from = 0; ; from += 1000) {
    let q = db.from("catalog_books").select(cols).not("koha_biblio_id", "is", null).eq("is_active", true)
      .order("koha_biblio_id").range(from, from + 999);
    if (ONLY) q = q.eq("koha_biblio_id", ONLY);
    const { data, error } = await q;
    if (error) fail(`Reading catalog_books failed: ${error.message}`);
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
const sameSet = (a: string[], b: string[]) => {
  const k = (xs: string[]) => [...new Set(xs.map((x) => x.toLocaleLowerCase()))].sort().join("\u0001");
  return k(a) === k(b);
};
const clip = (s: string, n = 90) => { const t = s.replace(/\s+/g, " "); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

async function main() {
  console.log(`Koha: ${kohaCfg.mode}${kohaCfg.baseUrl ? ` → ${kohaCfg.baseUrl}` : ""} · ${APPLY ? "APPLY — writing to Koha" : "dry run — nothing is written"}\n`);
  const all = await rows();
  const candidates = all
    .map((r) => ({ row: r, mine: pickWritable(r) }))
    .filter(({ mine }) => mine.description || mine.keywords.length);
  console.log(`${all.length} linked, listed records · ${candidates.length} with a description (not a template) or keywords to compare.\n`);

  const tally = { fill: 0, written: 0, differs: 0, inSync: 0, gone: 0, failed: 0 };
  let done = 0;
  for (const { row, mine } of candidates) {
    if (done >= LIMIT) break;
    const id = row.koha_biblio_id;
    let current: MarcInJson;
    try {
      current = (await koha.get(kohaPath("/biblios/{id}", { id }), isMarcInJson, { accept: "application/marc-in-json" })).data;
    } catch (e) {
      const err = e instanceof KohaError ? e : null;
      if (err?.kind === "not_found") { tally.gone++; console.log(`  ✖ ${id} ${row.slug}: not in Koha any more`); continue; }
      tally.failed++; console.log(`  ✖ ${id} ${row.slug}: could not read (${err?.message ?? String(e)})`); continue;
    }
    const withId = current.fields.some((f) => "999" in f) ? current
      : { ...current, fields: [...current.fields, { "999": { ind1: " ", ind2: " ", subfields: [{ c: String(id) }] } }] };
    const p = projectBiblio(withId);
    if (!p) { tally.failed++; console.log(`  ✖ ${id} ${row.slug}: Koha's record has no readable title`); continue; }
    const held = pickWritable(p);

    const fill: Partial<Pick<WritableBookFields, "description" | "keywords">> = {};
    const notes: string[] = [];
    if (mine.description) {
      if (!held.description) fill.description = mine.description;
      else if (!same(held.description, mine.description)) {
        notes.push(`description differs — Koha: "${clip(held.description)}" · e-Library: "${clip(mine.description)}"`);
        if (OVERWRITE) fill.description = mine.description;
      }
    }
    if (mine.keywords.length) {
      if (!held.keywords.length) fill.keywords = mine.keywords;
      else if (!sameSet(held.keywords, mine.keywords)) {
        notes.push(`keywords differ — Koha: ${held.keywords.join("; ")} · e-Library: ${mine.keywords.join("; ")}`);
        if (OVERWRITE) fill.keywords = mine.keywords;
      }
    }
    if (notes.length) { tally.differs++; for (const n of notes) console.log(`  ≠ ${id} ${row.slug}: ${n}`); }
    if (!Object.keys(fill).length) { if (!notes.length) tally.inSync++; continue; }

    tally.fill++;
    done++;
    const what = Object.keys(fill).map((k) => (k === "keywords" ? `keywords (${fill.keywords!.length})` : `description (${fill.description!.length} chars)`)).join(" + ");
    if (!APPLY) { console.log(`  → ${id} ${row.slug}: would send ${what}`); continue; }

    // The admin's Save path: base = what Koha holds now, next = that plus the fill.
    const r = await updateBiblio(koha, id, held, { ...held, ...fill });
    if (r.kind === "updated") { tally.written++; console.log(`  ✓ ${id} ${row.slug}: sent ${what}`); }
    else if (r.kind === "unchanged") { tally.inSync++; console.log(`  = ${id} ${row.slug}: Koha already had it`); }
    else {
      tally.failed++;
      const why = r.kind === "failed" ? `${r.error.message}${r.ambiguous ? " (MAY have been written — check the record before re-running)" : ""}` : r.kind;
      console.log(`  ✖ ${id} ${row.slug}: ${why}`);
      if (r.kind === "failed" && r.ambiguous) { console.log("\nStopped: an ambiguous write is never followed by more writes."); break; }
    }
  }

  console.log(`\n${APPLY ? "Sent" : "Would send"}: ${APPLY ? tally.written : tally.fill} · already in Koha: ${tally.inSync} · differ (report only): ${tally.differs} · gone: ${tally.gone} · failed: ${tally.failed}`);
  if (tally.differs && !OVERWRITE) {
    console.log("\n≠ lines: both systems hold DIFFERENT text, and nothing was sent for those fields. After deploy");
    console.log("  the sync makes Koha's text win (a replaced description is logged as `description_replaced`).");
    console.log("  Where the e-Library's is the right one, send it: --apply --only <biblio> --overwrite-koha.");
  }
  if (!APPLY && tally.fill) console.log("\nDry run. Add --apply (with KOHA_INTEGRATION=write) to send them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
