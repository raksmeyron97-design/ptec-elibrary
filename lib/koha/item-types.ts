/**
 * The Koha item type of a new record (942 $c) and of a new copy (952 $y).
 * Pure.
 *
 * PTEC lends by language (Library rules v1.0, §5.3): a student teacher keeps
 * a Khmer book 14 days and an English one 7 days. Koha sets loan periods per
 * item type, not per language, so PTEC's Koha splits books by language
 * (ptec-koha-deployment, docs/10, Phase 1, 2026-09-29):
 *
 *   • `BK`   Khmer book
 *   • `BKEN` foreign-language book — English and every other language
 *     (PTEC decision 2026-09-29: Japanese, Korean, Chinese, Thai… follow the
 *     English rule), so `other` is foreign too.
 *
 * Koha's saved report 1 ("PTEC check: copies whose item type does not match
 * their language") lists every copy that breaks this, whoever made it.
 */
import type { CatalogLanguageCode } from "./projection";

export const KOHA_ITEM_TYPE_KHMER = "BK";
export const KOHA_ITEM_TYPE_FOREIGN = "BKEN";

/**
 * `km` → `BK`; any other language → `BKEN`. A row with no language at all
 * keeps `BK`, the type every new record and copy had before this rule: Koha's
 * report does not list a record whose language it cannot read either.
 */
export function kohaItemTypeFor(language: CatalogLanguageCode | string | null | undefined): string {
  const code = (language ?? "").trim();
  if (!code) return KOHA_ITEM_TYPE_KHMER;
  return code === "km" ? KOHA_ITEM_TYPE_KHMER : KOHA_ITEM_TYPE_FOREIGN;
}
