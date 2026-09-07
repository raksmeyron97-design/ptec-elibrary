/* scripts/reorganize-book-folders.ts
 *
 * Move every book filed under `books/uncategorized/` into the shelf its
 * category actually names — `books/mathematics/…`, `books/education/…` — and
 * rewrite every database column that carries the old location.
 *
 * WHY EVERY BOOK IS IN ONE FOLDER
 *
 * A book's Zima folder is `books/<category>/<title-slug>-<uid>`, built at
 * upload time by lib/book-utils.ts → bookFolder(). The category segment went
 * through asciiSlug(), and every category in this library is Khmer, so every
 * category slugified to "" and fell back to `uncategorized`. 270 books, one
 * directory. bookFolder() now maps a Khmer category through the same keyword
 * table the generated covers use (storageCategorySegment, lib/storage/
 * folder-name.ts); this script applies that mapping to what is already on
 * disk. It never recomputes the `<title-slug>-<uid>` segment — the uid is
 * random and the slug is truncated (see migration 0128), so the book folder
 * is kept byte-for-byte and only the shelf above it changes.
 *
 * WHAT A MOVE TOUCHES — and why the digest matters
 *
 *   storage        POST /api/v1/files/move per FILE (the storage API has no
 *                  directory move). Every file in the folder is moved, whether
 *                  a row references it or not — EXCEPT a file some OTHER book
 *                  references (one cover was uploaded into a neighbour's
 *                  folder); that one stays put and is reported, because moving
 *                  it would break the row that points at it.
 *   book_files     file_url            → new location
 *   books          cover_url           → new location
 *                  storage_folder      → new folder (written LAST, see below)
 *   file_health    url                 → new location (status untouched: the
 *                                        bytes did not change)
 *   resource_index_state.source_digest → sha256 of the NEW file_url
 *
 * That last one is not optional. public_resource_index_health (0134) derives
 * "stale" by comparing source_digest against digest(file_url) LIVE; rewriting
 * file_url without the digest would make every moved book read as stale, and
 * stale outranks everything in the reconciler's queue — 230 books re-extracted
 * for a move that changed no byte. The digest is rewritten only when it still
 * equals the digest of the OLD url, so a genuinely stale record stays stale.
 *
 * IDEMPOTENT, AND SAFE TO INTERRUPT ANYWHERE
 *
 * A book is selected by `storage_folder LIKE 'books/uncategorized/%'`, and
 * storage_folder is the last column written, so an interrupted book is
 * re-selected on the next run. Inside a book, every step recognises its own
 * prior completion: a move that answers NOT_FOUND is accepted if the file is
 * already at the destination; a file_url already under the new folder is
 * skipped; the digest is only rewritten if it still matches the old url. A
 * CONFLICT (the file exists at BOTH ends) is never resolved automatically —
 * that book is reported and left alone. Every move carries an
 * x-idempotency-key so a network retry replays rather than re-runs.
 *
 * No database row is ever deleted, and no storage object is ever deleted.
 *
 * RATE LIMIT
 *
 * The storage API meters v1 mutations per client IP: RL_STORAGE_MUTATE_PER_HOUR
 * (default 240). Two files per book is ~540 moves for the whole backlog, so a
 * full run at the default spans three hourly windows. A 429 pauses the run for
 * the server's Retry-After and continues; --max-wait-minutes caps that. Raise
 * the limit on the storage box for the run if you would rather not wait.
 *
 * AFTER THE RUN
 *
 * Public pages are ISR-cached and hold the OLD cover URLs until they
 * revalidate; the old URLs now 404 (the file moved). Publish any book from
 * /admin, or redeploy, to revalidate the public tree. Service-worker caches on
 * readers' devices keep serving covers they already hold.
 *
 * Run:
 *   npx tsx scripts/reorganize-book-folders.ts                  # dry run: plan only
 *   npx tsx scripts/reorganize-book-folders.ts --apply          # move + rewrite
 *   npx tsx scripts/reorganize-book-folders.ts --apply --limit 5
 *   npx tsx scripts/reorganize-book-folders.ts --apply --book <uuid>
 *   npx tsx scripts/reorganize-book-folders.ts --category "គណិតវិទ្យា"
 *
 * Env (.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *   STORAGE_API_URL      the v1 base, e.g. https://api.storage-ptec.online/api/v1
 *   STORAGE_SERVICE_TOKEN a key holding storage:list AND storage:write
 *
 * The database and the storage service MUST be the same environment. Before
 * the first move the script asks storage for the first book's PDF by the key
 * the database holds and aborts if storage does not have it — a laptop
 * .env.local pointing at production Supabase and a local storage box would
 * otherwise rewrite production rows to files that were never moved.
 *
 * Exit code: 0 when every selected book was moved (or nothing needed moving),
 * 1 when any book failed and needs a human.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sourceDigest } from "../lib/indexing/state";
import {
  UNCATEGORIZED_SEGMENT,
  describeStoragePathError,
  storageCategorySegment,
} from "../lib/storage/folder-name";

// ── CLI ───────────────────────────────────────────────────────────────────────

function flag(name: string): boolean {
  return process.argv.includes(name);
}
function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const APPLY = flag("--apply");
const VERBOSE = flag("--verbose");
const LIMIT = Number(option("--limit") ?? 0) || 0;
const ONLY_BOOK = option("--book");
const ONLY_CATEGORY = option("--category");
const MAX_WAIT_MS = (Number(option("--max-wait-minutes") ?? 180) || 180) * 60_000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const STORAGE_API_URL = (process.env.STORAGE_API_URL ?? "").replace(/\/+$/, "");
const STORAGE_TOKEN = process.env.STORAGE_SERVICE_TOKEN ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (APPLY && (!STORAGE_API_URL || !STORAGE_TOKEN)) {
  console.error("✖ --apply needs STORAGE_API_URL and STORAGE_SERVICE_TOKEN (storage:list + storage:write).");
  process.exit(1);
}

const OLD_PREFIX = `books/${UNCATEGORIZED_SEGMENT}/`;

// ── Storage v1 client (scoped to what this script needs) ──────────────────────
//
// lib/storage-client.ts is `server-only` and cannot be imported from a script;
// this is the same envelope contract, with one addition the app never needs:
// a 429 is WAITED OUT rather than surfaced, because a backlog migration that
// stops at the hourly quota and has to be restarted by hand is a migration
// that gets restarted wrong.

type V1Ok<T> = { ok: true; data: T };
type V1Err = { ok: false; status: number; code: string; message: string };
type V1Result<T> = V1Ok<T> | V1Err;

interface V1File {
  storageKey: string;
  name: string;
  folder: string;
  url?: string;
  type?: "file" | "folder";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let waitedMs = 0;

async function v1<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<V1Result<T>> {
  const headers: Record<string, string> = { "x-api-key": STORAGE_TOKEN };
  if (init.idempotencyKey) headers["x-idempotency-key"] = init.idempotencyKey;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(`${STORAGE_API_URL}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt < 4) {
        await sleep(2_000 * 2 ** attempt);
        continue;
      }
      return { ok: false, status: 0, code: "NETWORK_ERROR", message: String(err) };
    }

    const text = await res.text();
    let json: { success?: boolean; data?: unknown; error?: { code?: string; message?: string }; retryAfterSeconds?: number } = {};
    try {
      json = JSON.parse(text);
    } catch {
      // non-JSON: handled by status below
    }

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      const header = Number(res.headers.get("retry-after"));
      const bodyHint = typeof json.retryAfterSeconds === "number" ? json.retryAfterSeconds : undefined;
      const retryAfter = bodyHint ?? (Number.isFinite(header) && header > 0 ? header : undefined);
      const delay = res.status === 429 ? Math.max(5, retryAfter ?? 60) * 1000 : Math.min(60_000, 2_000 * 2 ** attempt);
      if (res.status !== 429 && attempt >= 4) {
        return { ok: false, status: res.status, code: "STORAGE_UNAVAILABLE", message: text.slice(0, 200) };
      }
      if (waitedMs + delay > MAX_WAIT_MS) {
        return { ok: false, status: res.status, code: "RATE_LIMITED", message: `gave up waiting after ${Math.round(waitedMs / 60_000)} min (--max-wait-minutes)` };
      }
      waitedMs += delay;
      console.log(`  ⏳ storage answered ${res.status}; waiting ${Math.round(delay / 1000)} s (${Math.round(waitedMs / 60_000)} min waited so far)`);
      await sleep(delay);
      continue;
    }

    if (!res.ok || !json.success) {
      return {
        ok: false,
        status: res.status,
        code: json.error?.code ?? (res.status === 401 ? "UNAUTHORIZED" : res.status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR"),
        message: json.error?.message ?? text.slice(0, 200),
      };
    }
    return { ok: true, data: json.data as T };
  }
}

async function listFolderFiles(folder: string): Promise<V1Result<V1File[]>> {
  const out: V1File[] = [];
  let cursor = 0;
  for (;;) {
    const r = await v1<V1File[]>(`/files?folder=${encodeURIComponent(folder)}&cursor=${cursor}&limit=200`);
    if (!r.ok) return r.status === 404 ? { ok: true, data: [] } : r;
    for (const item of r.data) if (item.type !== "folder") out.push(item);
    if (r.data.length < 200) break;
    cursor += 200;
  }
  return { ok: true, data: out };
}

function fileMetadata(key: string) {
  return v1<V1File>(`/files/metadata?key=${encodeURIComponent(key)}`);
}

function moveFile(key: string, destinationFolder: string) {
  return v1<V1File>("/files/move", {
    method: "POST",
    body: { storageKey: key, destinationFolder },
    idempotencyKey: `reorg:${key}`,
  });
}

// ── URL ↔ key ─────────────────────────────────────────────────────────────────

/** `https://host/files/books/x/y/z.pdf` → `{ origin, key: "books/x/y/z.pdf" }` */
function parseStorageUrl(url: string | null | undefined): { origin: string; key: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/files\/(.+)$/);
    if (!m) return null;
    return { origin: u.origin, key: decodeURIComponent(m[1]) };
  } catch {
    return null;
  }
}

function buildStorageUrl(origin: string, key: string): string {
  return `${origin}/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

const basename = (key: string) => key.slice(key.lastIndexOf("/") + 1);

// ── Plan ──────────────────────────────────────────────────────────────────────

interface BookRow {
  id: string;
  title: string;
  slug: string;
  storage_folder: string;
  cover_url: string | null;
  category_id: string | null;
  categories: { name: string } | { name: string }[] | null;
}

interface FileRow {
  id: string;
  book_id: string;
  file_url: string | null;
}

/** One stored URL that must end up pointing at the new folder. */
interface Reference {
  kind: "pdf" | "cover";
  rowId: string; // book_files.id for a pdf, books.id for the cover
  url: string;
  origin: string;
  key: string;
  /**
   * Where the reference stands relative to this move. `shared` means another
   * row points at the same object; it is left where it is (moving it for this
   * book would break the other one) and reported.
   */
  state: "to-move" | "already-moved" | "foreign" | "shared";
}

interface Plan {
  book: BookRow;
  categoryName: string | null;
  shelf: string;
  oldFolder: string;
  newFolder: string;
  refs: Reference[];
  /**
   * Keys inside `oldFolder` that some OTHER row references (one book's cover
   * was uploaded into another book's folder). They are never moved: moving
   * them would break the row that points at them, and rewriting that row is
   * a change to a book this run was not asked about. They stay put and are
   * reported, so the old folder is not always empty afterwards.
   */
  intruders: string[];
  skip?: string;
}

function categoryName(book: BookRow): string | null {
  const c = book.categories;
  if (!c) return null;
  return Array.isArray(c) ? (c[0]?.name ?? null) : c.name;
}

/** Every storage key any book row references, with the rows that point at it. */
type ReferenceIndex = Map<string, Set<string>>;

function planBook(book: BookRow, files: FileRow[], allReferences: ReferenceIndex): Plan {
  const name = categoryName(book);
  const shelf = storageCategorySegment(name);
  const oldFolder = book.storage_folder.replace(/\/+$/, "");
  const bookSegment = oldFolder.slice(OLD_PREFIX.length);
  const newFolder = `books/${shelf}/${bookSegment}`;

  const plan: Plan = { book, categoryName: name, shelf, oldFolder, newFolder, refs: [], intruders: [] };

  if (!bookSegment || bookSegment.includes("/")) {
    plan.skip = `storage_folder "${book.storage_folder}" is not books/uncategorized/<folder>`;
    return plan;
  }
  if (shelf === UNCATEGORIZED_SEGMENT) {
    plan.skip = name ? `category "${name}" resolves to uncategorized` : "book has no category";
    return plan;
  }
  const pathProblem = describeStoragePathError(newFolder);
  if (pathProblem) {
    plan.skip = pathProblem;
    return plan;
  }

  const classify = (kind: Reference["kind"], rowId: string, url: string | null): void => {
    const parsed = parseStorageUrl(url);
    if (!url || !parsed) return; // nothing stored, or not a storage URL: nothing to move
    const otherOwners = [...(allReferences.get(parsed.key) ?? [])].filter((id) => id !== book.id);
    const state: Reference["state"] = !parsed.key.startsWith(`${oldFolder}/`)
      ? parsed.key.startsWith(`${newFolder}/`)
        ? "already-moved"
        : "foreign"
      : otherOwners.length > 0
        ? "shared"
        : "to-move";
    plan.refs.push({ kind, rowId, url, origin: parsed.origin, key: parsed.key, state });
  };
  for (const f of files) classify("pdf", f.id, f.file_url);
  classify("cover", book.id, book.cover_url);

  for (const [key, owners] of allReferences) {
    if (!key.startsWith(`${oldFolder}/`)) continue;
    if ([...owners].some((id) => id !== book.id)) plan.intruders.push(key);
  }

  if (!plan.refs.some((r) => r.kind === "pdf")) {
    plan.skip = "no book_files row with a storage URL — nothing would be moved";
  }
  return plan;
}

// ── Apply ─────────────────────────────────────────────────────────────────────

type MoveOutcome = { ok: true; newKey: string } | { ok: false; reason: string };

/** Move one object, accepting a move that already happened on an earlier run. */
async function moveOrAdopt(key: string, newFolder: string): Promise<MoveOutcome> {
  const expected = `${newFolder}/${basename(key)}`;
  const moved = await moveFile(key, newFolder);
  if (moved.ok) return { ok: true, newKey: moved.data.storageKey || expected };

  if (moved.code === "NOT_FOUND") {
    const there = await fileMetadata(expected);
    if (there.ok) return { ok: true, newKey: there.data.storageKey || expected };
    return { ok: false, reason: `"${key}" is not in storage, and neither is "${expected}"` };
  }
  if (moved.code === "CONFLICT") {
    return { ok: false, reason: `"${basename(key)}" exists at BOTH "${key}" and "${expected}" — resolve by hand` };
  }
  return { ok: false, reason: `move "${key}" → "${newFolder}" failed: ${moved.code} ${moved.message}` };
}

async function applyPlan(db: SupabaseClient, plan: Plan): Promise<{ ok: boolean; reason?: string }> {
  const { book, oldFolder, newFolder } = plan;

  // 1. Move every file in the folder — referenced ones first, then whatever
  //    else is there, so the old directory ends up empty.
  const listed = await listFolderFiles(oldFolder);
  if (!listed.ok) return { ok: false, reason: `could not list "${oldFolder}": ${listed.code} ${listed.message}` };

  const referencedKeys = new Set(plan.refs.filter((r) => r.state === "to-move").map((r) => r.key));
  const intruders = new Set(plan.intruders);
  const extras = listed.data
    .map((f) => f.storageKey)
    .filter((k) => !referencedKeys.has(k) && !intruders.has(k));

  const newKeyFor = new Map<string, string>();
  for (const key of [...referencedKeys, ...extras]) {
    const result = await moveOrAdopt(key, newFolder);
    if (!result.ok) return { ok: false, reason: result.reason };
    newKeyFor.set(key, result.newKey);
    if (VERBOSE) console.log(`    ↪ ${key} → ${result.newKey}`);
  }

  // 2. Rewrite the database. Order matters for interruption safety:
  //    storage_folder goes last, because it is the selector for a re-run.
  for (const ref of plan.refs) {
    if (ref.state !== "to-move") continue;
    const newKey = newKeyFor.get(ref.key)!;
    const newUrl = buildStorageUrl(ref.origin, newKey);

    if (ref.kind === "pdf") {
      const { error } = await db.from("book_files").update({ file_url: newUrl }).eq("id", ref.rowId);
      if (error) return { ok: false, reason: `book_files.${ref.rowId} update failed: ${error.message}` };

      // Keep the full-text index from reading as stale: the bytes did not
      // change, only the URL whose digest the health view compares against.
      const { error: digestError } = await db
        .from("resource_index_state")
        .update({ source_digest: sourceDigest(newUrl) })
        .eq("record_type", "book")
        .eq("record_id", book.id)
        .eq("source_digest", sourceDigest(ref.url));
      if (digestError) return { ok: false, reason: `resource_index_state digest update failed: ${digestError.message}` };
    }

    const { error: healthError } = await db
      .from("file_health")
      .update({ url: newUrl })
      .eq("record_type", "book")
      .eq("record_id", book.id)
      .eq("field", ref.kind === "pdf" ? "file_url" : "cover_url")
      .eq("url", ref.url);
    if (healthError) return { ok: false, reason: `file_health update failed: ${healthError.message}` };
  }

  const cover = plan.refs.find((r) => r.kind === "cover" && r.state === "to-move");
  const bookPatch: Record<string, string> = { storage_folder: newFolder };
  if (cover) bookPatch.cover_url = buildStorageUrl(cover.origin, newKeyFor.get(cover.key)!);
  const { error } = await db.from("books").update(bookPatch).eq("id", book.id);
  if (error) return { ok: false, reason: `books.${book.id} update failed: ${error.message}` };

  return { ok: true };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  console.log(`→ ${APPLY ? "APPLY" : "DRY RUN"} — books under ${OLD_PREFIX} on ${new URL(SUPABASE_URL).host}`);

  let query = db
    .from("books")
    .select("id, title, slug, storage_folder, cover_url, category_id, categories(name)")
    .like("storage_folder", `${OLD_PREFIX}%`)
    .order("storage_folder");
  if (ONLY_BOOK) query = query.eq("id", ONLY_BOOK);
  const { data: books, error } = await query;
  if (error) throw error;

  let rows = (books ?? []) as unknown as BookRow[];
  if (ONLY_CATEGORY) rows = rows.filter((b) => categoryName(b) === ONLY_CATEGORY);
  console.log(`  ${rows.length} book(s) selected`);
  if (rows.length === 0) {
    console.log("✓ Nothing to do.");
    return;
  }

  const bookIds = rows.map((b) => b.id);
  const fileRows: FileRow[] = [];
  const BATCH_SIZE = 50;
  for (let i = 0; i < bookIds.length; i += BATCH_SIZE) {
    const chunk = bookIds.slice(i, i + BATCH_SIZE);
    const { data, error: fileError } = await db
      .from("book_files")
      .select("id, book_id, file_url")
      .in("book_id", chunk);
    if (fileError) throw fileError;
    if (data) fileRows.push(...(data as FileRow[]));
  }
  const filesByBook = new Map<string, FileRow[]>();
  for (const f of fileRows) {
    filesByBook.set(f.book_id, [...(filesByBook.get(f.book_id) ?? []), f]);
  }

  // Every storage key the whole library references, so a file another book
  // points at is recognised even when that book is not in this run.
  const allReferences: ReferenceIndex = new Map();
  const { data: allBooks, error: allBooksError } = await db.from("books").select("id, cover_url");
  if (allBooksError) throw allBooksError;
  const remember = (url: string | null, owner: string | null) => {
    const parsed = parseStorageUrl(url);
    if (!parsed || !owner) return;
    allReferences.set(parsed.key, (allReferences.get(parsed.key) ?? new Set()).add(owner));
  };
  for (const b of allBooks ?? []) remember(b.cover_url, b.id);
  const { data: allFiles, error: allFilesError } = await db.from("book_files").select("book_id, file_url");
  if (allFilesError) throw allFilesError;
  for (const f of allFiles ?? []) remember(f.file_url, f.book_id);

  const plans = rows.map((b) => planBook(b, filesByBook.get(b.id) ?? [], allReferences));
  const runnable = plans.filter((p) => !p.skip);
  const skipped = plans.filter((p) => p.skip);

  // The plan, by shelf — this is what a dry run is for.
  const byShelf = new Map<string, { books: number; files: number; categories: Set<string> }>();
  for (const p of runnable) {
    const row = byShelf.get(p.shelf) ?? { books: 0, files: 0, categories: new Set<string>() };
    row.books += 1;
    row.files += p.refs.filter((r) => r.state === "to-move").length;
    if (p.categoryName) row.categories.add(p.categoryName);
    byShelf.set(p.shelf, row);
  }
  console.log("\n  shelf                 books  files  from categories");
  for (const [shelf, row] of [...byShelf].sort((a, b) => b[1].books - a[1].books)) {
    console.log(`  ${shelf.padEnd(22)}${String(row.books).padStart(5)}${String(row.files).padStart(7)}  ${[...row.categories].join(", ")}`);
  }
  const foreign = runnable.flatMap((p) => p.refs.filter((r) => r.state === "foreign").map((r) => `${p.book.id} ${r.kind}: ${r.key}`));
  if (foreign.length) {
    console.log(`\n  ${foreign.length} reference(s) point outside the book's folder and will be left untouched:`);
    for (const line of foreign.slice(0, 10)) console.log(`    ${line}`);
  }
  const shared = runnable.flatMap((p) => p.refs.filter((r) => r.state === "shared").map((r) => `${p.book.id} ${r.kind}: ${r.key}`));
  if (shared.length) {
    console.log(`\n  ${shared.length} reference(s) are shared with another book and will be left untouched:`);
    for (const line of shared.slice(0, 10)) console.log(`    ${line}`);
  }
  const intruders = runnable.flatMap((p) => p.intruders.map((k) => `${k}  (referenced by another book; stays in place)`));
  if (intruders.length) {
    console.log(`\n  ${intruders.length} file(s) belong to another book and will NOT be moved with the folder they sit in:`);
    for (const line of intruders.slice(0, 10)) console.log(`    ${line}`);
  }
  if (skipped.length) {
    console.log(`\n  ${skipped.length} book(s) skipped:`);
    for (const p of skipped) console.log(`    ${p.book.id}  ${p.skip}`);
  }
  if (VERBOSE) {
    console.log("");
    for (const p of runnable) console.log(`  ${p.oldFolder}\n    → ${p.newFolder}   (${p.categoryName})`);
  }

  const todo = LIMIT > 0 ? runnable.slice(0, LIMIT) : runnable;

  // Same-environment guard: the first PDF the database references must exist
  // in the storage service we are about to move things in.
  if (STORAGE_API_URL && STORAGE_TOKEN && todo.length > 0) {
    const probe = todo[0].refs.find((r) => r.kind === "pdf" && r.state === "to-move") ?? todo[0].refs[0];
    const seen = await fileMetadata(probe.key);
    if (!seen.ok) {
      const mark = APPLY ? "✖" : "⚠";
      console.error(`\n${mark} Storage at ${new URL(STORAGE_API_URL).host} does not hold "${probe.key}" (${seen.code}: ${seen.message}).`);
      console.error("  The database and STORAGE_API_URL point at different environments, or the token lacks storage:list.");
      if (APPLY) {
        console.error("  Refusing to move anything.");
        process.exit(1);
      }
      console.error("  An --apply run from this environment would be refused.");
    } else {
      console.log(`\n  ✓ storage at ${new URL(STORAGE_API_URL).host} holds the referenced files`);
    }
  } else if (todo.length > 0) {
    console.log("\n  (STORAGE_API_URL / STORAGE_SERVICE_TOKEN not set — storage was not probed)");
  }

  if (!APPLY) {
    console.log(`\n✓ Dry run. ${todo.length} book(s) would be moved (${todo.reduce((n, p) => n + p.refs.filter((r) => r.state === "to-move").length, 0)} files). Re-run with --apply.`);
    return;
  }

  console.log(`\n→ Moving ${todo.length} book(s)…`);
  let moved = 0;
  const failures: Array<{ id: string; title: string; reason: string }> = [];
  for (const [i, plan] of todo.entries()) {
    process.stdout.write(`  [${i + 1}/${todo.length}] ${plan.oldFolder} → books/${plan.shelf}/ … `);
    const result = await applyPlan(db, plan);
    if (result.ok) {
      moved += 1;
      console.log("ok");
    } else {
      failures.push({ id: plan.book.id, title: plan.book.title, reason: result.reason! });
      console.log(`FAILED\n    ${result.reason}`);
    }
  }

  console.log(`\n✓ ${moved} book(s) moved, ${failures.length} failed, ${skipped.length} skipped.`);
  if (moved > 0) {
    console.log("  Public pages still cache the old cover URLs until they revalidate — publish any book from /admin (or redeploy) to refresh them.");
  }
  if (failures.length) {
    console.log("\n  Failed (re-run picks these up; a CONFLICT needs a human):");
    for (const f of failures) console.log(`    ${f.id}  ${f.title}\n      ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("✖", err instanceof Error ? err.message : err);
  process.exit(1);
});
