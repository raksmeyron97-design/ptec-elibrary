/**
 * Covers from Koha, the DOING half: read Koha's cover list, plan (covers.ts),
 * write the covers the sync owns. Runs after each applied Koha sync
 * (sync-server.ts). The database and the reader are injected; no environment,
 * nothing server-only — so it is tested as it runs.
 *
 * Rules this file keeps:
 *   • A list that cannot be read or parsed changes NOTHING.
 *   • It writes only `cover_url`, and only from the value it read: each update
 *     is a compare-and-set, so a cover a librarian saves meanwhile is not
 *     overwritten.
 *   • Every write asks for its row back and counts it.
 *   • It never deletes a row and never writes to Koha.
 */
import { pagedScan, type PagedScanError } from "@/lib/db/paged-scan";
import { CATALOG_SCAN_CAP } from "@/lib/catalog";
import { kohaCoverReportUrl, parseKohaCoverReport, planKohaCovers, type CoverRow, type KohaCoverConfig, type KohaCoverList } from "./covers";

type Filterable = {
  eq(column: string, value: unknown): Filterable;
  is(column: string, value: null): Filterable;
  not(column: string, op: string, value: unknown): Filterable;
  order(column: string, opts?: { ascending?: boolean }): Filterable;
  range(from: number, to: number): PromiseLike<{ data: unknown; error: PagedScanError | null }>;
  select(columns: string): PromiseLike<{ data: unknown; error: PagedScanError | null }>;
};
export interface CoverDb {
  from(table: "catalog_books"): {
    select(columns: string): Filterable;
    update(patch: { cover_url: string | null }): Filterable;
  };
}

export type CoverRefreshResult =
  | { status: "unavailable"; reason: string }
  | { status: "ok"; covered: number; complete: boolean; set: number; changed: number; cleared: number; ownCoverKept: number; clearsSkipped: number; raced: number; errors: string[] };

/** Read Koha's public cover report from the OPAC: one request, a time budget. */
export async function readKohaCoverList(
  fetchImpl: typeof fetch,
  cfg: Pick<KohaCoverConfig, "opacUrl" | "reportId">,
  timeoutMs = 10_000,
): Promise<KohaCoverList | { error: string }> {
  try {
    const r = await fetchImpl(kohaCoverReportUrl(cfg), { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (r.status !== 200) return { error: `Koha's cover report answered ${r.status}.` };
    const list = parseKohaCoverReport(await r.json());
    return list ?? { error: "Koha's cover report is not in the expected shape." };
  } catch (e) {
    return { error: `Koha's cover report could not be read: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function refreshKohaCovers(db: CoverDb, read: () => Promise<KohaCoverList | { error: string }>): Promise<CoverRefreshResult> {
  const list = await read();
  if ("error" in list) return { status: "unavailable", reason: list.error };

  const scan = await pagedScan<CoverRow>(
    (from, to) => db.from("catalog_books").select("id, koha_biblio_id, cover_url").not("koha_biblio_id", "is", null).order("id").range(from, to),
    CATALOG_SCAN_CAP,
  );
  if (scan.error) return { status: "unavailable", reason: `Reading catalog_books failed: ${scan.error.message ?? scan.error.code}` };
  // An incomplete row set is fine for setting covers, never for anything else.
  const plan = planKohaCovers(scan.data, scan.truncated ? { ...list, complete: false } : list);

  const result = { status: "ok" as const, covered: list.covers.size, complete: list.complete && !scan.truncated, set: 0, changed: 0, cleared: 0, ownCoverKept: plan.ownCoverKept, clearsSkipped: plan.clearsSkipped, raced: 0, errors: [] as string[] };
  for (const c of plan.changes) {
    const base = db.from("catalog_books").update({ cover_url: c.to }).eq("id", c.id);
    const guarded = c.from === null ? base.is("cover_url", null) : base.eq("cover_url", c.from);
    const { data, error } = await guarded.select("id");
    if (error) { result.errors.push(`${c.id}: ${error.message ?? error.code}`); continue; }
    if (!Array.isArray(data) || data.length !== 1) { result.raced++; continue; }
    if (!(c.from ?? "").trim()) result.set++;
    else if (c.to === null) result.cleared++;
    else result.changed++;
  }
  return result;
}
