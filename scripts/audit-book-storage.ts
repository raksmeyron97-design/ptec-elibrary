/* scripts/audit-book-storage.ts
 *
 * Reconcile Zima Storage's `books/` tree against the `books` / `book_files`
 * tables, and report — or clean up — what a partly-failed import left behind.
 *
 * Why this exists. The bulk importer uploads the PDF first and writes the book
 * row last, so the two ways a run can end badly are asymmetric:
 *
 *   ORPHAN FOLDER   bytes in storage that no book row points at. Caused by a
 *                   PDF that uploaded but whose `saveBookRecord` then failed.
 *                   Invisible in the catalogue, and — because the duplicate
 *                   check is by SHA-256 of the file — enough to make a retry
 *                   of that same row fail with 409 "already in the library".
 *                   The importer now rolls these back as they happen; this
 *                   script is for the ones already on disk.
 *
 *   ORPHAN ROW      a book row whose file_url points at nothing. This is what
 *                   an interrupted run leaves, and it is the worse of the two
 *                   because the entry IS in the public catalogue and its
 *                   download 404s.
 *
 * A row and a folder that agree are healthy and are not listed.
 *
 * Note on folders named `book-<uid>`: that is not a failure marker. It is the
 * documented fallback in bookFolder() for a title with no Latin content — a
 * Khmer-only title — and those imports SUCCEEDED. Deciding by name alone would
 * delete live books; this script decides by whether a row references the file.
 *
 * Run:
 *   npx tsx scripts/audit-book-storage.ts            # report only
 *   npx tsx scripts/audit-book-storage.ts --delete   # also delete orphan FILES
 *
 * `--delete` never touches a database row. Removing a catalogue entry is a
 * decision with a public URL attached to it; it belongs in /admin, not here.
 *
 * Env (.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *   ZIMA_API_URL, ZIMA_API_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ZIMA_API_URL = process.env.ZIMA_API_URL ?? "";
const ZIMA_API_KEY = process.env.ZIMA_API_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!ZIMA_API_URL || !ZIMA_API_KEY) {
  console.error("✖ Need ZIMA_API_URL and ZIMA_API_KEY.");
  process.exit(1);
}

const DELETE = process.argv.includes("--delete");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

interface ZimaEntry {
  name: string;
  isDir: boolean;
  size: number;
  path: string;
  url: string | null;
}

async function listFolder(folder: string): Promise<ZimaEntry[]> {
  const res = await fetch(`${ZIMA_API_URL}/api/files`, {
    method: "POST",
    headers: { "x-api-key": ZIMA_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`list "${folder}" failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return (json.items ?? json.files ?? json) as ZimaEntry[];
}

/** Every file under `books/`, keyed by its storage path. */
async function walkFiles(folder: string, out: ZimaEntry[] = []): Promise<ZimaEntry[]> {
  for (const entry of await listFolder(folder)) {
    if (entry.isDir) await walkFiles(entry.path, out);
    else out.push(entry);
  }
  return out;
}

/** The `books/<cat>/<slug-uid>` prefix of a storage path, or null. */
function bookFolderOf(storagePath: string): string | null {
  const m = storagePath.match(/^(books\/[^/]+\/[^/]+)\//);
  return m ? m[1] : null;
}

/** Normalize any stored URL or bare key to a comparable storage path. */
function toStoragePath(value: string): string | null {
  if (!value) return null;
  try {
    const p = new URL(value).pathname;
    const m = p.match(/^\/files\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return value.replace(/^\/+/, ""); // legacy bare R2 key
  }
}

async function main() {
  console.log("→ Listing books/ in Zima Storage…");
  const files = await walkFiles("books");
  console.log(`  ${files.length} files`);

  console.log("→ Reading book rows…");
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, slug, file_url, cover_url, storage_folder, is_published, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`books query failed: ${error.message}`);

  const { data: bookFiles } = await supabase.from("book_files").select("book_id, file_url");

  // Every storage path any row claims.
  const referenced = new Set<string>();
  for (const row of books ?? []) {
    for (const url of [row.file_url, row.cover_url]) {
      const p = url ? toStoragePath(url) : null;
      if (p) referenced.add(p);
    }
  }
  for (const bf of bookFiles ?? []) {
    const p = bf.file_url ? toStoragePath(bf.file_url) : null;
    if (p) referenced.add(p);
  }

  const onDisk = new Set(files.map((f) => f.path));

  // Folders a book still CLAIMS (books.storage_folder, migration 0128). A book
  // whose file_url is a legacy R2 key but whose folder is recorded here still
  // owns everything inside it — deleting those files because no URL happens to
  // name them would destroy live data.
  const claimedFolders = new Set(
    (books ?? [])
      .map((row) => (row.storage_folder as string | null) ?? null)
      .filter((f): f is string => Boolean(f)),
  );

  // ── Orphan files: on disk, referenced by nothing ──
  const orphanFiles = files.filter(
    (f) => !referenced.has(f.path) && !claimedFolders.has(bookFolderOf(f.path) ?? ""),
  );
  const orphanFolders = new Map<string, ZimaEntry[]>();
  for (const f of orphanFiles) {
    const folder = bookFolderOf(f.path) ?? "(top level)";
    const list = orphanFolders.get(folder) ?? [];
    list.push(f);
    orphanFolders.set(folder, list);
  }

  // ── Orphan rows: a book whose PDF is not on disk ──
  const orphanRows = (books ?? []).filter((row) => {
    const p = row.file_url ? toStoragePath(row.file_url) : null;
    // A recorded folder that still holds files is proof the book's bytes exist
    // even when the stored URL shape is one this script cannot resolve.
    const folder = row.storage_folder as string | null;
    if (folder && files.some((f) => f.path.startsWith(`${folder}/`))) return false;
    if (!p) return true; // no file at all
    if (!p.startsWith("books/")) return false; // legacy R2 — out of scope here
    return !onDisk.has(p);
  });

  console.log("");
  console.log(`ORPHAN FILES   ${orphanFiles.length} file(s) in ${orphanFolders.size} folder(s)`);
  let bytes = 0;
  for (const [folder, entries] of [...orphanFolders].sort()) {
    const size = entries.reduce((n, e) => n + (e.size || 0), 0);
    bytes += size;
    console.log(`  ${folder}  (${entries.length} file(s), ${(size / 1024 / 1024).toFixed(1)} MB)`);
    for (const e of entries) console.log(`      ${e.name}`);
  }
  if (orphanFiles.length) console.log(`  total ${(bytes / 1024 / 1024).toFixed(1)} MB reclaimable`);

  console.log("");
  console.log(`ORPHAN ROWS    ${orphanRows.length} book row(s) with no file in storage`);
  for (const row of orphanRows) {
    const flag = row.is_published ? "PUBLISHED" : "draft";
    console.log(`  [${flag}] ${row.slug ?? row.id} — ${row.title}`);
    console.log(`      /admin/edit/${row.id}`);
  }
  if (orphanRows.length) {
    console.log("  → These are visible in the catalogue and their downloads 404.");
    console.log("    Re-upload the PDF from /admin/edit/<id>, or delete the entry there.");
  }

  if (!DELETE) {
    if (orphanFiles.length) {
      console.log("");
      console.log("Re-run with --delete to remove the orphan FILES (rows are never touched).");
    }
    return;
  }

  console.log("");
  console.log(`→ Deleting ${orphanFiles.length} orphan file(s)…`);
  let deleted = 0;
  for (const f of orphanFiles) {
    const res = await fetch(`${ZIMA_API_URL}/api/delete`, {
      method: "POST",
      headers: { "x-api-key": ZIMA_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ path: f.path, url: f.url }),
    });
    if (res.ok) deleted += 1;
    else console.warn(`  ✖ ${f.path} (${res.status})`);
  }
  console.log(`  deleted ${deleted}/${orphanFiles.length}`);
}

main().catch((err) => {
  console.error("✖", err instanceof Error ? err.message : err);
  process.exit(1);
});
