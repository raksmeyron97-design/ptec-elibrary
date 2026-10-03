/**
 * The Koha item type by language (PTEC Library rules v1.0; ptec-koha-deployment
 * docs/10, Phase 1): Khmer books BK, books in any other language BKEN.
 */
import { describe, it, expect } from "vitest";
import { KOHA_ITEM_TYPE_FOREIGN, KOHA_ITEM_TYPE_KHMER, kohaItemTypeFor } from "./item-types";
import type { CatalogLanguageCode } from "./projection";

describe("kohaItemTypeFor", () => {
  it("Khmer is BK; English, French, Chinese and every other language are BKEN", () => {
    const all: Record<CatalogLanguageCode, string> = { km: "BK", en: "BKEN", fr: "BKEN", zh: "BKEN", other: "BKEN" };
    for (const [language, want] of Object.entries(all)) expect(kohaItemTypeFor(language), language).toBe(want);
    expect(KOHA_ITEM_TYPE_KHMER).toBe("BK");
    expect(KOHA_ITEM_TYPE_FOREIGN).toBe("BKEN");
  });

  it("no language keeps BK, the type every new record and copy had before", () => {
    for (const none of [null, undefined, "", "  "]) expect(kohaItemTypeFor(none), JSON.stringify(none)).toBe("BK");
  });

  it("a stored code with stray spaces reads as itself", () => {
    expect(kohaItemTypeFor(" km ")).toBe("BK");
    expect(kohaItemTypeFor(" en")).toBe("BKEN");
  });
});
