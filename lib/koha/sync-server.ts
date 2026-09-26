/**
 * The server's way to start a Koha sync and to read its state — used by the
 * admin page (/admin/catalogs/koha-sync) and the cron route.
 *
 * A full run reads the whole of Koha and can take minutes, longer than the
 * Cloudflare tunnel holds a request open (100 s). So nothing here waits for a
 * run: it checks the preconditions, starts the run with `after()` (fully
 * supported under `next start`, docs/…/self-hosting.md) and returns. The run
 * records its own outcome in koha_sync_state, which the admin page reads.
 *
 * A container restarted mid-run (a deploy) cuts the run short. That is safe:
 * the lease expires on its own, nothing is deleted, and every step the plan
 * takes is idempotent, so the next run finishes the job.
 */
import "server-only";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { revalidateCatalogBook } from "@/lib/cache/revalidate";
import { getKohaClient, getKohaConfig } from "@/lib/koha";
import { kohaCanRead } from "./config";
import { runKohaSync, SYNC_STREAM } from "./sync-run";
import type { SyncMode } from "./sync-plan";

export interface KohaSyncState {
  initialized_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_run_at: string | null;
  last_run_applied: boolean | null;
  last_run_mode: SyncMode | null;
  last_run_status: "ok" | "failed" | null;
  last_success_at: string | null;
  last_error: string | null;
  last_summary: {
    counts?: Record<string, number>;
    exceptions?: { kind: string; message: string; bookId?: string; barcode?: string | null }[];
    exceptionsTotal?: number;
    errors?: string[];
    errorsTotal?: number;
    durationMs?: number;
  };
  items_cursor: string | null;
}

/** null when the table does not exist yet (migration 0157 not applied). */
export async function readKohaSyncState(): Promise<KohaSyncState | null | "missing_table"> {
  const db = createServiceClient();
  const { data, error } = await db.from("koha_sync_state").select("*").eq("stream", SYNC_STREAM).maybeSingle();
  if (error) {
    if (error.code === "42P01" || /koha_sync_state/.test(error.message ?? "")) return "missing_table";
    throw new Error(`Reading the Koha sync state failed: ${error.message}`);
  }
  return (data as KohaSyncState | null) ?? null;
}

/**
 * Whether the Physical Library follows Koha yet (the first build has been
 * applied). For notices only, so any failure — no table, no answer — is "no".
 */
export async function kohaSyncInitialized(): Promise<boolean> {
  try {
    const state = await readKohaSyncState();
    return !!state && state !== "missing_table" && !!state.initialized_at;
  } catch {
    return false;
  }
}

/** A preview older than this no longer describes what an apply would do. */
export const PREVIEW_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * The last run was a successful full PREVIEW, recent enough that its counts
 * are what a full apply would do. Asked by the page (to enable Build) and by
 * the action (the boundary).
 */
export function isFreshFullPreview(
  state: Pick<KohaSyncState, "last_run_mode" | "last_run_applied" | "last_run_status" | "last_run_at"> | null,
  now = Date.now(),
): boolean {
  return !!state && state.last_run_mode === "full" && state.last_run_applied === false && state.last_run_status === "ok"
    && !!state.last_run_at && now - Date.parse(state.last_run_at) < PREVIEW_MAX_AGE_MS;
}

export function isRunning(state: Pick<KohaSyncState, "lease_expires_at"> | null, now = Date.now()): boolean {
  return !!state?.lease_expires_at && Date.parse(state.lease_expires_at) > now;
}

export type StartResult = { started: true } | { started: false; reason: string };

export async function startKohaSync(opts: {
  mode: SyncMode;
  apply: boolean;
  actorId: string | null;
  trigger: "admin" | "cron";
  /** The scheduled job: never the first build, which is a person's decision (full mode too). */
  requireInitialized?: boolean;
}): Promise<StartResult> {
  const config = getKohaConfig();
  if (!kohaCanRead(config)) {
    return { started: false, reason: config.mode === "off" ? "The Koha integration is off (KOHA_INTEGRATION)." : `The Koha integration is not configured: ${config.problems.join("; ") || config.mode}.` };
  }
  const state = await readKohaSyncState();
  if (state === "missing_table") return { started: false, reason: "The database has no koha_sync_state table yet (migration 0157)." };
  if (isRunning(state)) return { started: false, reason: "A sync is already running." };
  if ((opts.mode === "incremental" || opts.requireInitialized) && !state?.initialized_at) {
    return { started: false, reason: "The first full sync has not been applied yet (/admin/catalogs/koha-sync)." };
  }

  const leaseOwner = `${opts.trigger}:${opts.actorId ?? "system"}:${Date.now()}`;
  after(async () => {
    try {
      const result = await runKohaSync(createServiceClient(), getKohaClient(), {
        mode: opts.mode, apply: opts.apply, actorId: opts.actorId, leaseOwner,
      });
      if (result.status === "ok" || result.status === "failed") {
        console.info(`[koha-sync] ${opts.trigger} ${opts.mode} ${opts.apply ? "apply" : "preview"}: ${result.status}`, JSON.stringify(result.counts));
        if (result.applied && !result.noop) revalidateCatalogBook();
      } else {
        console.info(`[koha-sync] ${opts.trigger} ${opts.mode}: ${result.status}`);
      }
    } catch (e) {
      console.error("[koha-sync] run failed:", e instanceof Error ? e.message : e);
    }
  });
  return { started: true };
}
