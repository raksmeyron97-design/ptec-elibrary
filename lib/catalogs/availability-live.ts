// lib/catalogs/availability-live.ts
//
// Whether the public catalogue may state copy availability as a fact about
// the shelf ("2 of 3 on the shelf") — `CATALOG_AVAILABILITY_LIVE` in .env.
//
// Off until the PMB → Koha cut-over ("freeze and re-lend") is finished: the
// PMB export carried no loan state, so every copy reads `available` until the
// loans still recorded in PMB are re-issued in Koha. Until then a count of
// available copies is a fact about this database, not about the shelf, and a
// reader who crosses town on the strength of it deserves to have been told.
// The librarians finish re-issuing; the administrator sets
// CATALOG_AVAILABILITY_LIVE=on and restarts (docs/KOHA-SYNC.md).
//
// It was a code constant (`CATALOG_AVAILABILITY_IS_LIVE` in lib/catalog.ts)
// until Phase 9.1: turning it on meant a code change and a deploy for what is
// an operational decision, the same shape as the KOHA_* switches.
//
// Safe in the browser by construction: a client bundle has no such variable,
// so the answer there is "not live" — the direction that never over-claims.

const ON = new Set(["on", "true", "1", "yes"]);

export function catalogAvailabilityIsLive(env: Record<string, string | undefined> = process.env): boolean {
  return ON.has((env.CATALOG_AVAILABILITY_LIVE ?? "").trim().toLowerCase());
}
