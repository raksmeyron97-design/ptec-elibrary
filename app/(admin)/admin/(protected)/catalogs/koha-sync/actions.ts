"use server";
// app/admin/catalogs/koha-sync/actions.ts
//
// Start a Koha → e-Library sync from the admin page. Nothing here waits for
// the run (a full read of Koha outlives a tunnelled request); lib/koha/
// sync-server.ts starts it in the background and the page reads its outcome.

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { isFreshFullPreview, readKohaSyncState, startKohaSync } from "@/lib/koha/sync-server";

export type KohaSyncActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Read both sides and plan, writing nothing to the catalogue. */
export async function previewKohaSync(): Promise<KohaSyncActionResult> {
  const { userId } = await requireAction("catalog.koha-sync.preview");
  const r = await startKohaSync({ mode: "full", apply: false, actorId: userId, trigger: "admin" });
  revalidatePath("/admin/catalogs/koha-sync");
  return r.started ? { ok: true, message: "Preview started. It reads all of Koha and takes a few minutes." } : { ok: false, error: r.reason };
}

/**
 * Apply: `full` builds or reconciles the whole Physical Library from Koha and
 * is refused unless the page has just shown a successful full preview;
 * `incremental` applies what changed since the last run.
 */
export async function applyKohaSync(mode: "full" | "incremental"): Promise<KohaSyncActionResult> {
  const { userId } = await requireAction("catalog.koha-sync.apply");
  if (mode !== "full" && mode !== "incremental") return { ok: false, error: "Unknown sync mode." };

  if (mode === "full") {
    const state = await readKohaSyncState();
    if (state === "missing_table" || !state) return { ok: false, error: "Run a preview first." };
    if (!isFreshFullPreview(state)) {
      return { ok: false, error: "Applying needs a successful full preview from the last 24 hours. Run a preview, check it, then apply." };
    }
  }

  const r = await startKohaSync({ mode, apply: true, actorId: userId, trigger: "admin" });
  if (r.started) await logAdminAction(userId, "koha_sync.apply", "catalog_books", undefined, { mode });
  revalidatePath("/admin/catalogs/koha-sync");
  return r.started
    ? { ok: true, message: mode === "full" ? "Sync started. The Physical Library updates as it runs." : "Sync of recent changes started." }
    : { ok: false, error: r.reason };
}
