#!/usr/bin/env node
// Metadata cleanup — 2026-07-11 audit (books + authors on the hosted DB).
//
// What it corrects (see the manifest below for exact ids):
//   * Mangled diacritics in author names ("Johnny Salda(za)" → "Johnny Saldaña",
//     "Mara Luisa Prez Caado" → "María Luisa Pérez Cañado", …)
//   * Academic degrees stored inside author names ("Set Seng. Ph.D" → "Set Seng";
//     the degree moves to authors.credentials via migration 0083)
//   * Curriculum/institutional resources whose author was copied from an
//     unrelated book (BA+1 syllabi / Khmer math curricula → PTEC)
//   * "Katowice" (a city) as author → the verified editor of that volume
//     (cover + OpenLibrary: Gabryś-Barker, Wydawnictwo Uniwersytetu Śląskiego, 2011)
//   * "Educational Research (Text)" whose PDF/cover is actually Catherine
//     Dawson's "Introduction to Research Methods" 5th ed. (Robinson, 2019)
//   * Author-list formatting ("A,B" → "A, B"; "Last, First,Last, First" →
//     "First Last, First Last"; ALL-CAPS → title case)
//   * Bulk-import placeholder publication dates (published_at = 2026-01-01)
//     → NULL, so citations emit "n.d." instead of a false "(2026)"
//
// Usage:
//   node scripts/fix-metadata-2026-07-11.mjs             # dry run (default)
//   node scripts/fix-metadata-2026-07-11.mjs --apply     # backup, then apply
//   node scripts/fix-metadata-2026-07-11.mjs --revert scripts/backups/<file>.json
//
// Every --apply first writes a full backup of all touched rows to
// scripts/backups/, and --revert restores from that file (deleted author rows
// are re-inserted with their original ids). Nothing here touches storage,
// users, or any table other than authors/books.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { console } from "node:inspector";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envFile = readFileSync(resolve(ROOT, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── The corrections manifest ─────────────────────────────────────────────────
const AUTHOR_RENAMES = [
  { id: "399bebbc-0a3f-415f-a376-5ae3f144fa94", to: "Johnny Saldaña", why: "mangled diacritic (Saldaña)" },
  { id: "54fa6986-31e0-4dc7-b43e-1dec58087d8c", to: "Matthew B. Miles, A. Michael Huberman, Johnny Saldaña", why: "mangled diacritic (Saldaña)" },
  { id: "65037ca3-ca39-4464-8c2c-9c340225235f", to: "Set Seng", why: "degree in name → authors.credentials (migration 0083)" },
  { id: "85e30310-a991-45c7-b309-d0451ff061a8", to: "María Luisa Pérez Cañado (ed.)", why: "stripped diacritics" },
  { id: "a4718fb0-b32f-43e1-94a5-eaee87a50e96", to: "Leonard A. Jason, David S. Glenwick", why: "missing space after comma" },
  { id: "88629ec7-6c6c-442b-b8ab-c8f837ee6819", to: "R. Burke Johnson, Larry B. Christensen", why: "normalise separators for citation parsing" },
  { id: "5a86e3eb-52c7-4b9c-b61e-20fd502ac62b", to: "Frances Julia Riemer, Marylynn T. Quartaroli, Stephen D. Lapan", why: "Last,First format breaks comma-split citations" },
  { id: "241ad3e3-beda-4d54-99ee-5f791f77f8d3", to: "Seanghai Nget", why: "ALL CAPS" },
  { id: "34042e70-119c-4a00-b952-ef7ca81668bd", to: "Sreytouch", why: "lowercase personal name" },
  { id: "e85ab10d-85ad-434a-a998-42f1dd3e2ad6", to: "Danuta Gabryś-Barker (ed.)", why: "'Katowice' is the city of publication, not the author (verified via cover + OpenLibrary)" },
];

const BOOK_UPDATES = [
  {
    id: "04c4d4a9-4b4b-4366-a513-c596a33fa86f", // action-research-in-teacher-education
    set: {
      title: "Action Research in Teacher Development: An Overview of Research Methodology",
      publisher: "Wydawnictwo Uniwersytetu Śląskiego",
      published_at: "2011-01-01",
    },
    why: "cover states full title, publisher and year (Katowice 2011)",
  },
  {
    id: "21f18b32-3f50-45d7-a40a-9c582a482826", // educational-research-text
    set: {
      title: "Introduction to Research Methods: A Practical Guide for Anyone Undertaking a Research Project (5th ed.)",
      author_id: "9c211408-26cd-401e-9401-1e5df25d5298", // Catherine Dawson
      publisher: "Robinson",
      published_at: "2019-01-01",
    },
    why: "record titled 'Educational Research (Text)' by 'Doug and Gabi' is actually Dawson's 5th edition (cover + OpenLibrary)",
  },
  { id: "97b4285a-ea71-474c-8937-41c4faa733a9", set: { author_id: "1bad6aaf-73e7-4825-bee5-f5794b342964" }, why: "Khmer math curriculum vol 2 wrongly attributed to Fraenkel/Wallen/Hyun → PTEC (siblings vol 1 + specialist are PTEC)" },
  { id: "ed478376-47cf-4811-b350-6588c2733ec5", set: { author_id: "1bad6aaf-73e7-4825-bee5-f5794b342964" }, why: "BA+1 education-research curriculum wrongly attributed to Berk/Carey (Excel textbook authors) → PTEC" },
  { id: "bff6c9c9-4955-4f77-8f1e-e6f970b085bc", set: { author_id: "1bad6aaf-73e7-4825-bee5-f5794b342964" }, why: "Assessment Syllabus (BA+1) wrongly attributed to the APA → PTEC (siblings Practicum/Pedagogy syllabi are PTEC)" },
  { id: "e07b126e-1e7c-40fe-b704-02ed7dee0b6c", set: { author_id: "399bebbc-0a3f-415f-a376-5ae3f144fa94" }, why: "repoint duplicate 'Johnny Saldaza' copy at the corrected Saldaña author row" },
];

// Deleted only after the books above are repointed; full rows are backed up
// and --revert re-inserts them with their original ids.
const AUTHOR_DELETES = [
  { id: "3749ced8-4847-4481-b1b7-719a2dae55be", name: "Johnny Saldaza", why: "duplicate of Johnny Saldaña" },
  { id: "a8fbae79-df53-4b9b-ba6a-9aaed96420ac", name: "Doug and Gabi", why: "not the author of any held work after reattribution" },
];

// Bulk-import placeholder: 62 books were loaded with published_at = 2026-01-01.
// NULL makes displays and citations honest ("n.d.") instead of a false (2026).
const PLACEHOLDER_DATE = "2026-01-01";

// ── modes ────────────────────────────────────────────────────────────────────
const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--revert")
    ? "revert"
    : "dry-run";

async function collectBackup() {
  const authorIds = [
    ...AUTHOR_RENAMES.map((r) => r.id),
    ...AUTHOR_DELETES.map((d) => d.id),
  ];
  const bookIds = BOOK_UPDATES.map((b) => b.id);
  const authors = await rest(`authors?select=*&id=in.(${authorIds.join(",")})`);
  const books = await rest(
    `books?select=id,slug,title,publisher,published_at,author_id&id=in.(${bookIds.join(",")})`,
  );
  const placeholderBooks = await rest(
    `books?select=id,slug,published_at&published_at=eq.${PLACEHOLDER_DATE}`,
  );
  return { takenAt: new Date().toISOString(), authors, books, placeholderBooks };
}

async function apply() {
  const backup = await collectBackup();
  mkdirSync(resolve(ROOT, "scripts/backups"), { recursive: true });
  const file = resolve(
    ROOT,
    `scripts/backups/metadata-backup-${backup.takenAt.replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${file}`);

  for (const r of AUTHOR_RENAMES) {
    await rest(`authors?id=eq.${r.id}`, { method: "PATCH", body: { name: r.to } });
    console.log(`author ${r.id.slice(0, 8)} → ${JSON.stringify(r.to)}  (${r.why})`);
  }
  for (const b of BOOK_UPDATES) {
    await rest(`books?id=eq.${b.id}`, { method: "PATCH", body: b.set });
    console.log(`book   ${b.id.slice(0, 8)} → ${JSON.stringify(b.set)}`);
  }
  for (const d of AUTHOR_DELETES) {
    await rest(`authors?id=eq.${d.id}`, { method: "DELETE" });
    console.log(`author ${d.id.slice(0, 8)} (${d.name}) deleted  (${d.why})`);
  }
  const nulled = await rest(
    `books?published_at=eq.${PLACEHOLDER_DATE}&select=id`,
    { method: "PATCH", body: { published_at: null }, prefer: "return=representation" },
  );
  console.log(`placeholder published_at ${PLACEHOLDER_DATE} → NULL on ${nulled.length} books`);
  console.log("\nDone. Revert with:\n  node scripts/fix-metadata-2026-07-11.mjs --revert " + file);
}

async function revert() {
  const fileArg = process.argv[process.argv.indexOf("--revert") + 1];
  if (!fileArg) {
    console.error("Usage: --revert <backup.json>");
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(resolve(fileArg), "utf8"));

  // Re-insert deleted authors first so book author_id FKs can be restored.
  for (const a of backup.authors) {
    await rest(`authors?on_conflict=id`, {
      method: "POST",
      body: a,
      prefer: "resolution=merge-duplicates",
    });
    console.log(`author ${a.id.slice(0, 8)} restored → ${JSON.stringify(a.name)}`);
  }
  for (const b of backup.books) {
    const { id, slug, ...fields } = b;
    await rest(`books?id=eq.${id}`, { method: "PATCH", body: fields });
    console.log(`book   ${id.slice(0, 8)} (${slug}) restored`);
  }
  for (const p of backup.placeholderBooks) {
    await rest(`books?id=eq.${p.id}`, {
      method: "PATCH",
      body: { published_at: p.published_at },
    });
  }
  console.log(`placeholder dates restored on ${backup.placeholderBooks.length} books`);
}

async function dryRun() {
  console.log("DRY RUN — nothing written. Current values of every row to be touched:\n");
  const backup = await collectBackup();
  for (const r of AUTHOR_RENAMES) {
    const cur = backup.authors.find((a) => a.id === r.id);
    console.log(`author ${JSON.stringify(cur?.name)} → ${JSON.stringify(r.to)}`);
  }
  for (const b of BOOK_UPDATES) {
    const cur = backup.books.find((x) => x.id === b.id);
    console.log(`book ${cur?.slug}: ${JSON.stringify(b.set)}`);
  }
  for (const d of AUTHOR_DELETES) console.log(`delete author ${JSON.stringify(d.name)}`);
  console.log(`NULL published_at on ${backup.placeholderBooks.length} books currently at ${PLACEHOLDER_DATE}`);
  console.log("\nRun with --apply to execute (a backup is always written first).");
}

if (mode === "apply") await apply();
else if (mode === "revert") await revert();
else await dryRun();
