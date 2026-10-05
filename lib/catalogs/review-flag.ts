import "server-only";

/**
 * CATALOG_REVIEW — the librarian review workspace for the Physical Library
 * (docs/CATALOG-REVIEW.md). Server-only and fail-safe, the same shape as
 * lib/admin/analytics-flags.ts: production stays exactly as it was until the
 * switch says `on`; development gets the new surface; any other value is off.
 *
 * Off means the review routes answer 404 and /admin/catalogs renders as before.
 * The review table may still hold rows — nothing reads them, and no reader sees
 * them either way.
 */
export function catalogReviewEnabled(input: { flag?: string; nodeEnv?: string } = {}): boolean {
  const flag = (input.flag ?? process.env.CATALOG_REVIEW)?.trim().toLowerCase();
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  if (flag === "on") return true;
  if (flag) return false;
  return nodeEnv !== "production";
}
