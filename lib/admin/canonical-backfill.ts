// lib/admin/canonical-backfill.ts
//
// Admin reconciliation reader for the canonical backfills (migrations
// 0105-0108). Reads the admin-only `canonical_backfill_health` view (0109) and
// reports, per domain, the legacy source count vs the canonical count the
// backfill produced. A nonzero `gap` is drift for a librarian to investigate.
//
// Service-role only (the view is revoked from anon/authenticated). The calling
// server action must gate on the `analytics` permission, mirroring
// reconcilePublicResourceStats() in lib/admin/resource-stats.ts.

import { createServiceClient } from "@/lib/supabase/server";

export type BackfillHealthRow = {
  domain: string;
  legacyCount: number;
  canonicalCount: number;
  /** legacy - canonical. 0 = fully backfilled; >0 = rows the backfill missed. */
  gap: number;
};

export type CanonicalBackfillReconciliation = {
  rows: BackfillHealthRow[];
  /** True when every domain reconciles (no gaps). */
  healthy: boolean;
  checkedAt: string;
};

export async function reconcileCanonicalBackfill(): Promise<CanonicalBackfillReconciliation> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("canonical_backfill_health")
    .select("domain, legacy_count, canonical_count");

  const rows: BackfillHealthRow[] =
    error || !data
      ? []
      : data.map((r) => {
          const legacyCount = Number(r.legacy_count);
          const canonicalCount = Number(r.canonical_count);
          return { domain: String(r.domain), legacyCount, canonicalCount, gap: legacyCount - canonicalCount };
        });

  const healthy = rows.length > 0 && rows.every((r) => r.gap === 0);

  const drifting = rows.filter((r) => r.gap !== 0);
  if (drifting.length > 0) {
    console.error(
      JSON.stringify({
        event: "canonical_backfill_drift",
        entityType: "canonical-backfill",
        route: "lib/admin/canonical-backfill",
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        ts: new Date().toISOString(),
        drift: drifting,
      }),
    );
  }

  return { rows, healthy, checkedAt: new Date().toISOString() };
}
