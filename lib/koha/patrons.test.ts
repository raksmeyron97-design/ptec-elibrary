/**
 * Phase 7/8 — reading Koha patrons (docs/KOHA-PATRONS.md), through the REAL
 * client against the mock, which answers as Koha 26.05.03's patron endpoints.
 */
import { describe, it, expect } from "vitest";
import { createKohaClient } from "./client";
import { resolveKohaConfig } from "./config";
import { createMockKoha } from "./mock";
import { cardHint, findPatronByCard, holdState, readHolds, readLoans, summarisePatron } from "./patrons";

/** A Koha patron as the API returns it — much more than the e-Library may keep. */
const PATRON = {
  patron_id: 42, cardnumber: "0803", surname: "Sok", firstname: "Dara", preferred_name: null,
  category_id: "ST", library_id: "PTEC", expiry_date: "2027-06-30", expired: false, restricted: false,
  address: "No. 12, Street 271", city: "Phnom Penh", email: "dara.private@example.com", phone: "012 345 678",
  mobile: "097 000 111", date_of_birth: "2004-02-29", staff_notes: "owes a replacement fee", userid: "dsok", gender: "M",
};
const OTHER = { ...PATRON, patron_id: 43, cardnumber: "30803", firstname: "Other" };

function setup(opts: Parameters<typeof createMockKoha>[0] = {}) {
  const mock = createMockKoha({ patrons: [PATRON, OTHER], ...opts });
  const koha = createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "mock" }), { fetch: mock.fetch, sleep: async () => {} });
  return { mock, koha };
}

describe("a patron, as the e-Library keeps it", () => {
  it("keeps only the allow-listed fields — no address, email, phone, birth date or notes leave", () => {
    const s = summarisePatron(PATRON);
    expect(Object.keys(s).sort()).toEqual(["cardnumber", "categoryId", "expired", "expiryDate", "libraryId", "name", "patronId", "restricted"]);
    const out = JSON.stringify(s);
    for (const secret of ["Street 271", "example.com", "012 345", "097", "2004-02-29", "replacement fee", "dsok"]) expect(out).not.toContain(secret);
    expect(s).toMatchObject({ patronId: 42, name: "Dara Sok", categoryId: "ST", expired: false });
  });

  it("shows a card by its last four characters only", () => {
    expect(cardHint("PTEC-2026-0803")).toBe("•••• 0803");
    expect(cardHint("803")).toBe("•••• 803");
  });

  it("finds a card by its EXACT number (0803 is not 30803)", async () => {
    const { koha, mock } = setup();
    expect((await findPatronByCard(koha, " 0803 "))?.patronId).toBe(42);
    expect(await findPatronByCard(koha, "803")).toBeNull();
    expect(mock.calls.at(-1)!.path).toContain("_match=exact");
  });

  it("without the permission, Koha's refusal is a configuration problem", async () => {
    const { koha } = setup({ canReadPatrons: false });
    await expect(findPatronByCard(koha, "0803")).rejects.toMatchObject({ kind: "forbidden", failureKind: "config" });
  });
});

describe("a reader's loans and holds", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  it("loans: soonest due first, overdue flagged, the item's record and barcode from the embed", async () => {
    const { koha, mock } = setup({
      checkouts: [
        { checkout_id: 1, patron_id: 42, item_id: 900, due_date: "2026-10-10T23:59:00+07:00", checkout_date: "2026-09-26", renewals_count: 1 },
        { checkout_id: 2, patron_id: 42, item_id: 901, due_date: "2026-09-20T23:59:00+07:00", checkout_date: "2026-09-06", renewals_count: 0 },
        { checkout_id: 3, patron_id: 43, item_id: 902, due_date: "2026-09-21T23:59:00+07:00" },
      ],
    });
    mock.items.set(900, { item_id: 900, biblio_id: 7, external_id: "0803" } as never);
    const loans = await readLoans(koha, 42, now);
    expect(loans.map((l) => [l.checkoutId, l.overdue])).toEqual([[2, true], [1, false]]);
    expect(loans[1]).toMatchObject({ biblioId: 7, barcode: "0803", renewals: 1 });
    expect(mock.calls.at(-1)!.headers["x-koha-embed"]).toBe("item");
  });

  it("holds: ready for pickup first, then in transit, then the queue by position", async () => {
    const { koha } = setup({
      holds: [
        { hold_id: 1, patron_id: 42, biblio_id: 7, status: null, priority: 3 },
        { hold_id: 2, patron_id: 42, biblio_id: 8, status: "W", expiration_date: "2026-10-01" },
        { hold_id: 3, patron_id: 42, biblio_id: 9, status: "T" },
        { hold_id: 4, patron_id: 42, biblio_id: 10, status: null, priority: 1, suspended: true },
      ],
    });
    const holds = await readHolds(koha, 42);
    expect(holds.map((h) => [h.holdId, h.state])).toEqual([[2, "waiting"], [3, "in_transit"], [4, "pending"], [1, "pending"]]);
    expect(holds[2].suspended).toBe(true);
    expect(holdState("P")).toBe("processing");
  });

  it("an unknown patron is Koha's 404, not an empty list", async () => {
    const { koha } = setup();
    await expect(readLoans(koha, 999)).rejects.toMatchObject({ kind: "not_found" });
  });

  it("a Koha that does not answer costs one budget, not three timeouts", async () => {
    // Token requests are answered; every data request hangs until it is aborted.
    const mock = createMockKoha({ patrons: [PATRON] });
    let dataCalls = 0;
    const hanging: typeof fetch = async (input, init) => {
      if (String(input).includes("/oauth/")) return mock.fetch(String(input), init);
      dataCalls++;
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    const koha = createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "mock" }), { fetch: hanging, sleep: async () => {} });
    const t0 = Date.now();
    await expect(readLoans(koha, 42, new Date(), AbortSignal.timeout(50))).rejects.toMatchObject({ kind: "timeout" });
    await expect(readHolds(koha, 42, AbortSignal.timeout(50))).rejects.toMatchObject({ kind: "timeout" });
    await expect(findPatronByCard(koha, "0803", AbortSignal.timeout(50))).rejects.toMatchObject({ kind: "timeout" });
    expect(dataCalls).toBe(3); // one attempt each: an aborted budget is never retried
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});
