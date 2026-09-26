/**
 * Koha → e-Library sync, the DOING half: read both sides, plan
 * (sync-plan.ts), and either report the plan (a preview) or apply it.
 *
 * Injected with the database client and the Koha client, reads no
 * environment, imports nothing server-only — the admin action, the cron route
 * and the local integration test all run exactly this.
 *
 * Rules this file keeps:
 *   • One run at a time. A run takes a LEASE on koha_sync_state with a
 *     compare-and-set; a second run finds it held and reports `busy`.
 *   • The scheduled (incremental) run refuses until a person has applied the
 *     first full build (`initialized_at`), which the admin page does only
 *     after showing its preview.
 *   • Every write asks for its rows back and counts them: PostgREST answers a
 *     write that matched nothing with success.
 *   • A run with errors does NOT move the cursor, so the next run retries what
 *     failed; everything the plan does is idempotent, so retrying is safe.
 *   • It never deletes. Retiring is a status; unlisting is `is_active`.
 *   • It never writes to Koha.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogRecordSlug, catalogSlugify, pickCatalogColor, CATALOG_SCAN_CAP } from "@/lib/catalog";
import { pagedScan } from "@/lib/db/paged-scan";
import type { KohaClient } from "./client";
import { readKohaBiblioChanges, readKohaBiblios, readKohaBibliosById, readKohaItems, readKohaItemsOf } from "./catalogue";
import { projectBiblio, projectItem, type KohaItem, type MarcInJson } from "./projection";
import { isNoop, planSync, type PtecBook, type PtecCopy, type SyncMode, type SyncPlan } from "./sync-plan";

export const SYNC_STREAM = "catalog";
/** Longer than any run should take; a crashed run's lease expires on its own. */
export const LEASE_MS = 30 * 60_000;
const EXCEPTIONS_KEPT = 200;
const BOOK_BATCH = 200;
const COPY_BATCH = 500;
const UPDATE_CONCURRENCY = 8;
/** Re-read a margin behind the cursor: clocks differ a little, re-reading is idempotent. */
const CURSOR_OVERLAP_MS = 10 * 60_000;

export interface SyncRunOptions {
  mode: SyncMode;
  apply: boolean;
  /** Profile id of the person who started it; null for the scheduled job. */
  actorId?: string | null;
  leaseOwner: string;
  now?: () => Date;
}

export type SyncRunResult =
  | { status: "busy" }
  | { status: "not_initialized" }
  | {
      status: "ok" | "failed";
      mode: SyncMode;
      applied: boolean;
      counts: Record<string, number>;
      exceptions: SyncPlan["exceptions"];
      errors: string[];
      durationMs: number;
      noop: boolean;
    };

type Db = SupabaseClient;

const BOOK_COLUMNS = "id, slug, koha_biblio_id, title, author, isbn, publisher, year, language, category, department, ddc, is_active";
const COPY_COLUMNS = "id, catalog_book_id, koha_item_id, barcode, status, call_number, shelf_location, holding_library, accession_number, copy_number";

async function readAllRows<T>(db: Db, table: string, columns: string): Promise<T[]> {
  const scan = await pagedScan<T>(
    (from, to) => db.from(table).select(columns).order("id", { ascending: true }).range(from, to),
    CATALOG_SCAN_CAP,
  );
  if (scan.error) throw new Error(`Reading ${table} failed: ${scan.error.message ?? "unknown error"}`);
  if (scan.truncated) throw new Error(`Reading ${table} stopped at ${CATALOG_SCAN_CAP} rows — refusing to plan on a partial view.`);
  return scan.data;
}

/**
 * The newest of Koha's timestamps, KEPT AS KOHA WROTE IT (offset included).
 * Koha 26.05 reads a UTC value in a /biblios `me.timestamp` filter as local
 * time, so a cursor must go back in Koha's own form, never re-serialised.
 */
export function newestTimestamp(stamps: (string | null | undefined)[], previous: string | null): string | null {
  let best = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;
  let bestText = previous;
  for (const s of stamps) {
    if (!s) continue;
    const t = Date.parse(s);
    if (Number.isFinite(t) && t > best) { best = t; bestText = s; }
  }
  return bestText;
}

/** `date` written in the UTC offset Koha uses (taken from one of its own timestamps). */
export function inKohaOffset(date: Date, kohaSample: string | null): string {
  const m = kohaSample ? /([+-])(\d\d):(\d\d)$/.exec(kohaSample) : null;
  const sign = m ? (m[1] === "-" ? -1 : 1) : 0;
  const offsetMin = m ? sign * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const local = new Date(date.getTime() + offsetMin * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const body = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
  return m ? `${body}${m[1]}${m[2]}:${m[3]}` : `${body}Z`;
}

async function limitedAll<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** A unique slug by the importer's rule (title, then author or ISBN), avoiding every slug already taken. */
function slugFor(fields: { title: string; author: string | null; isbn: string | null }, biblioId: number, taken: Set<string>): string {
  const base = catalogRecordSlug(fields.title) || `book-${biblioId}`;
  const suffix = fields.isbn ? catalogSlugify(fields.isbn) : catalogSlugify(fields.author ?? "");
  const preferred = suffix ? `${base}-${suffix}`.slice(0, 120).replace(/[-\p{M}]+$/u, "") : base;
  let slug = preferred;
  for (let n = 2; taken.has(slug); n++) slug = `${preferred}-${n}`;
  taken.add(slug);
  return slug;
}

export async function runKohaSync(db: Db, koha: KohaClient, opts: SyncRunOptions): Promise<SyncRunResult> {
  const now = opts.now ?? (() => new Date());
  const started = now();

  // ── State row + lease ────────────────────────────────────────────────────
  await db.from("koha_sync_state").upsert({ stream: SYNC_STREAM }, { onConflict: "stream", ignoreDuplicates: true });
  const { data: state, error: stateError } = await db.from("koha_sync_state").select("*").eq("stream", SYNC_STREAM).single();
  if (stateError || !state) throw new Error(`Reading koha_sync_state failed: ${stateError?.message ?? "no row"}`);
  if (opts.mode === "incremental" && !state.initialized_at) return { status: "not_initialized" };

  const leaseUntil = new Date(started.getTime() + LEASE_MS).toISOString();
  const { data: leased, error: leaseError } = await db
    .from("koha_sync_state")
    .update({ lease_owner: opts.leaseOwner, lease_expires_at: leaseUntil, updated_at: started.toISOString() })
    .eq("stream", SYNC_STREAM)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${started.toISOString()}`)
    .select("stream");
  if (leaseError) throw new Error(`Taking the sync lease failed: ${leaseError.message}`);
  if (!leased || leased.length === 0) return { status: "busy" };

  const errors: string[] = [];
  let plan: SyncPlan | null = null;
  let itemsCursor: string | null = state.items_cursor;
  let bibliosCursor: string | null = state.biblios_cursor;
  try {
    // ── Read Koha ──────────────────────────────────────────────────────────
    let biblios: MarcInJson[];
    let items: KohaItem[];
    if (opts.mode === "full") {
      [biblios, items] = await Promise.all([readKohaBiblios(koha), readKohaItems(koha)]);
      itemsCursor = newestTimestamp(items.map((i) => i.timestamp), null);
      // MARC pages carry no filterable timestamp, so a full run starts the
      // record cursor from when it began reading, less a margin for clock
      // skew between the two containers, written in Koha's own offset.
      // Re-reading a record is harmless.
      bibliosCursor = inKohaOffset(new Date(started.getTime() - CURSOR_OVERLAP_MS), itemsCursor);
    } else {
      // Read only to learn which records changed (and the newest timestamp):
      // no labels needed, every affected item is read again below, with them.
      const changedItems = await readKohaItems(koha, { since: state.items_cursor ?? undefined, labels: false });
      const changedBiblios = state.biblios_cursor ? await readKohaBiblioChanges(koha, state.biblios_cursor) : [];
      // Every record in scope is read whole, with ALL its items, so its
      // call number and department are computed from every copy it has.
      const affected = [...new Set([...changedItems.map((i) => i.biblio_id), ...changedBiblios.map((b) => b.biblio_id)])];
      biblios = affected.length ? await readKohaBibliosById(koha, affected) : [];
      items = affected.length ? await readKohaItemsOf(koha, affected) : [];
      itemsCursor = newestTimestamp(changedItems.map((i) => i.timestamp), state.items_cursor);
      bibliosCursor = newestTimestamp(changedBiblios.map((b) => b.timestamp), state.biblios_cursor);
    }

    const kohaBooks = biblios.map((b) => projectBiblio(b)).filter((b): b is NonNullable<typeof b> => !!b);
    const kohaCopies = items.map(projectItem);

    // ── Read the e-Library ────────────────────────────────────────────────
    const [ptecBooks, ptecCopies] = await Promise.all([
      readAllRows<PtecBook>(db, "catalog_books", BOOK_COLUMNS),
      readAllRows<PtecCopy>(db, "catalog_copies", COPY_COLUMNS),
    ]);

    plan = planSync({ mode: opts.mode, kohaBooks, kohaCopies, ptecBooks, ptecCopies });

    // ── Apply ──────────────────────────────────────────────────────────────
    if (opts.apply && !isNoop(plan)) {
      const taken = new Set(ptecBooks.map((b) => b.slug));
      const createdId = new Map<number, string>();
      for (let i = 0; i < plan.createBooks.length; i += BOOK_BATCH) {
        const batch = plan.createBooks.slice(i, i + BOOK_BATCH);
        const rows = batch.map((c) => ({
          ...c.fields,
          slug: slugFor(c.fields, c.kohaBiblioId, taken),
          koha_biblio_id: c.kohaBiblioId,
          cover_color: pickCatalogColor(c.fields.title),
          is_active: true,
          copies_total: 0,
          copies_available: 0,
          keywords: [],
          created_by: opts.actorId ?? null,
        }));
        const { data, error } = await db.from("catalog_books").insert(rows).select("id, koha_biblio_id");
        if (error) { errors.push(`Creating ${rows.length} records failed: ${error.message}`); continue; }
        for (const r of data ?? []) createdId.set(r.koha_biblio_id, r.id);
        if ((data ?? []).length !== rows.length) errors.push(`Created ${(data ?? []).length} of ${rows.length} records in one batch.`);
      }

      await limitedAll(plan.updateBooks, UPDATE_CONCURRENCY, async (u) => {
        const { data, error } = await db.from("catalog_books").update(u.patch).eq("id", u.id).select("id");
        if (error || !data?.length) errors.push(`Updating record ${u.id} failed: ${error?.message ?? "no row matched"}`);
      });
      await limitedAll(plan.unlistBooks, UPDATE_CONCURRENCY, async (u) => {
        const { data, error } = await db.from("catalog_books").update({ is_active: false }).eq("id", u.id).select("id");
        if (error || !data?.length) errors.push(`Unlisting record ${u.id} failed: ${error?.message ?? "no row matched"}`);
      });

      const resolve = (r: { existing: string } | { created: number }) => ("existing" in r ? r.existing : createdId.get(r.created));
      const copyRows = plan.createCopies.flatMap((c) => {
        const bookId = resolve(c.book);
        if (!bookId) return []; // its record failed to be created; reported above
        return [{ catalog_book_id: bookId, koha_item_id: c.kohaItemId, copy_number: c.copyNumber, ...c.fields }];
      });
      for (let i = 0; i < copyRows.length; i += COPY_BATCH) {
        const batch = copyRows.slice(i, i + COPY_BATCH);
        const { data, error } = await db.from("catalog_copies").insert(batch).select("id");
        if (error) errors.push(`Creating ${batch.length} copies failed: ${error.message}`);
        else if ((data ?? []).length !== batch.length) errors.push(`Created ${(data ?? []).length} of ${batch.length} copies in one batch.`);
      }

      await limitedAll(plan.updateCopies, UPDATE_CONCURRENCY, async (u) => {
        const patch: Record<string, unknown> = { ...u.patch };
        if (u.moveTo) {
          const target = resolve(u.moveTo);
          if (!target) { errors.push(`Moving copy ${u.id}: its new record was not created.`); return; }
          patch.catalog_book_id = target;
        }
        const { data, error } = await db.from("catalog_copies").update(patch).eq("id", u.id).select("id");
        if (error || !data?.length) errors.push(`Updating copy ${u.id} failed: ${error?.message ?? "no row matched"}`);
      });
      await limitedAll(plan.retireCopies, UPDATE_CONCURRENCY, async (r) => {
        const { data, error } = await db.from("catalog_copies").update({ status: "withdrawn" }).eq("id", r.id).select("id");
        if (error || !data?.length) errors.push(`Retiring copy ${r.id} failed: ${error?.message ?? "no row matched"}`);
      });
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // ── Record the outcome, release the lease ─────────────────────────────────
  const finished = now();
  const ok = errors.length === 0;
  const summary = {
    counts: plan?.counts ?? {},
    exceptions: (plan?.exceptions ?? []).slice(0, EXCEPTIONS_KEPT),
    exceptionsTotal: plan?.exceptions.length ?? 0,
    errors: errors.slice(0, 20),
    errorsTotal: errors.length,
    durationMs: finished.getTime() - started.getTime(),
  };
  const update: Record<string, unknown> = {
    lease_owner: null,
    lease_expires_at: null,
    last_run_at: started.toISOString(),
    last_run_applied: opts.apply,
    last_run_mode: opts.mode,
    last_run_status: ok ? "ok" : "failed",
    last_error: ok ? null : errors[0],
    last_summary: summary,
    updated_at: finished.toISOString(),
  };
  if (ok && opts.apply) {
    update.last_success_at = finished.toISOString();
    update.items_cursor = itemsCursor;
    update.biblios_cursor = bibliosCursor;
    if (opts.mode === "full" && !state.initialized_at) {
      update.initialized_at = finished.toISOString();
      update.initialized_by = opts.actorId ?? null;
    }
  }
  await db.from("koha_sync_state").update(update).eq("stream", SYNC_STREAM).eq("lease_owner", opts.leaseOwner);

  return {
    status: ok ? "ok" : "failed",
    mode: opts.mode,
    applied: opts.apply,
    counts: summary.counts,
    exceptions: plan?.exceptions ?? [],
    errors,
    durationMs: summary.durationMs,
    noop: plan ? isNoop(plan) : true,
  };
}
