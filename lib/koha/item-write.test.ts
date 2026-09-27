/**
 * Phase 6 — Koha items (the e-Library's copies), through the REAL client
 * against the in-process mock, which answers as Koha 26.05.03's
 * Biblios#add_item / #update_item do (409 on a duplicate barcode, set_from_api
 * partial updates, 403 without edit_items).
 */
import { describe, it, expect } from "vitest";
import { KOHA_SETTABLE_COPY_STATUSES } from "@/lib/catalog";
import { createKohaClient } from "./client";
import { resolveKohaConfig } from "./config";
import { createMockKoha, type MockKoha } from "./mock";
import type { FetchLike } from "./auth";
import { copyStatusOf } from "./projection";
import { createItem, heldCopy, locationCode, readLocations, statusPatch, updateItem, type WritableCopyFields } from "./item-write";
import { MOCK_KOHA_LOCATIONS } from "./mock";

const LOCS = MOCK_KOHA_LOCATIONS.map(([code, label]) => ({ code, label }));

const BIBLIO = 1; // MOCK_KOHA_BIBLIOS has record 1
const COPY: WritableCopyFields = { barcode: "0803", callNumber: "370.15 HAT", shelfLocation: "GEN", accessionNumber: "ACC-1", status: "available" };

function setup(opts: Parameters<typeof createMockKoha>[0] = {}, wrap?: (f: FetchLike) => FetchLike) {
  const mock = createMockKoha(opts);
  const koha = createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "mock" }), { fetch: wrap ? wrap(mock.fetch) : mock.fetch, sleep: async () => {} });
  return { mock, koha };
}
const writes = (m: MockKoha) => m.calls.filter((c) => (c.method === "POST" || c.method === "PUT") && c.path.includes("/items"));

describe("statusPatch: one e-Library status ⇄ Koha's four flags", () => {
  const W = [0, 1], L = [0, 1, 2, 4], D = [0, 1], N = [-1, 0, 1, 2], R = [0, 1];
  it("every settable status reads back as itself, from every combination of flags", () => {
    let n = 0;
    for (const withdrawn of W) for (const lost_status of L) for (const damaged_status of D) for (const not_for_loan_status of N) for (const restricted_status of R) {
      const cur = { withdrawn, lost_status, damaged_status, not_for_loan_status, restricted_status };
      for (const target of KOHA_SETTABLE_COPY_STATUSES) {
        const patch = statusPatch(cur, target);
        expect(copyStatusOf({ ...cur, ...patch, checked_out_date: null }), `${JSON.stringify(cur)} → ${target}`).toBe(target);
        // Only what changes is sent.
        for (const [k, v] of Object.entries(patch)) expect(cur[k as keyof typeof cur], `${target} sends an unchanged ${k}`).not.toBe(v);
        n++;
      }
    }
    expect(n).toBe(2 * 4 * 2 * 4 * 2 * KOHA_SETTABLE_COPY_STATUSES.length);
  });

  it("keeps flags that do not decide the status", () => {
    // A damaged staff-collection copy: marking it damaged again, or reference-only, keeps the staff code.
    expect(statusPatch({ withdrawn: 0, lost_status: 0, damaged_status: 0, not_for_loan_status: 2, restricted_status: 0 }, "damaged")).toEqual({ damaged_status: 1 });
    expect(statusPatch({ withdrawn: 0, lost_status: 0, damaged_status: 1, not_for_loan_status: 2, restricted_status: 0 }, "reference_only")).toEqual({ damaged_status: 0 });
    // Withdrawing touches only `withdrawn`; the rest is what the copy was when it left.
    expect(statusPatch({ withdrawn: 0, lost_status: 0, damaged_status: 1, not_for_loan_status: 0, restricted_status: 0 }, "withdrawn")).toEqual({ withdrawn: 1 });
    // A specific lost value (2 = long overdue) is still "lost".
    expect(statusPatch({ withdrawn: 0, lost_status: 2, damaged_status: 0, not_for_loan_status: 0, restricted_status: 0 }, "lost")).toEqual({});
  });
});

describe("create", () => {
  it("POSTs one item and reads back as written; the shelf is a code from Koha's location list", async () => {
    const { mock, koha } = setup();
    const r = await createItem(koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS });
    expect(r.kind).toBe("created");
    if (r.kind !== "created") return;
    expect(r.existed).toBe(false);
    const item = mock.items.get(r.item.item_id)!;
    expect(item).toMatchObject({ external_id: "0803", callnumber: "370.15 HAT", location: "GEN", inventory_number: "ACC-1", home_library_id: "PTEC", holding_library_id: "PTEC", item_type_id: "BK" });
    expect(heldCopy(item)).toMatchObject({ ...COPY, locationCode: "GEN" });
    expect(writes(mock)[0].headers["content-type"]).toBe("application/json");
  });

  it("a repeated create meets its own barcode and TAKES the item instead of making a second", async () => {
    const { mock, koha } = setup();
    await createItem(koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS });
    const again = await createItem(koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS });
    expect(again).toMatchObject({ kind: "created", existed: true });
    expect(mock.items.size).toBe(1);
  });

  it("a barcode another record holds is reported with that record, and nothing is created", async () => {
    const { mock, koha } = setup();
    mock.records.set(7, { fields: [{ "999": { subfields: [{ c: "7" }] } }] });
    await createItem(koha, 7, COPY, { libraryId: "PTEC", locations: LOCS });
    expect(await createItem(koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS })).toEqual({ kind: "barcode_taken", barcode: "0803", biblioId: 7 });
    expect(mock.items.size).toBe(1);
  });

  it("a lost answer is settled at once by the barcode: created → taken; not created → safe to repeat", async () => {
    let lose = true;
    const { mock, koha } = setup({}, (f) => async (url, init) => {
      const res = await f(url, init);
      if (lose && init?.method === "POST" && url.endsWith("/items")) { lose = false; throw new TypeError("fetch failed: socket hang up"); }
      return res;
    });
    expect(await createItem(koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS })).toMatchObject({ kind: "created", existed: true });
    expect(mock.items.size).toBe(1);

    const never = setup({}, (f) => async (url, init) => {
      if (init?.method === "POST" && url.endsWith("/items")) throw new TypeError("fetch failed");
      return f(url, init);
    });
    expect(await createItem(never.koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS })).toMatchObject({ kind: "failed", ambiguous: false });
    expect(never.mock.items.size).toBe(0);
  });

  it("refuses what Koha cannot hold or the e-Library may not set", async () => {
    const { koha } = setup();
    expect(await createItem(koha, BIBLIO, { ...COPY, barcode: " " }, { libraryId: "PTEC", locations: LOCS })).toMatchObject({ kind: "failed", ambiguous: false });
    expect(await createItem(koha, BIBLIO, { ...COPY, status: "on_loan" }, { libraryId: "PTEC", locations: LOCS })).toMatchObject({ kind: "failed", ambiguous: false });
    // A free-text shelf mark is not a Koha location: refused, not written as a code Koha's editor would blank.
    expect(await createItem(koha, BIBLIO, { ...COPY, shelfLocation: "B-2-01" }, { libraryId: "PTEC", locations: LOCS })).toMatchObject({ kind: "failed", ambiguous: false });
    expect(await createItem(koha, 999, COPY, { libraryId: "PTEC", locations: LOCS })).toEqual({ kind: "gone" });
    const noPerm = setup({ canWriteItems: false });
    expect(await createItem(noPerm.koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS })).toMatchObject({ kind: "failed", ambiguous: false, error: { kind: "forbidden" } });
  });
});

describe("edit", () => {
  async function created() {
    const s = setup();
    const r = await createItem(s.koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS });
    if (r.kind !== "created") throw new Error("setup");
    return { ...s, id: r.item.item_id };
  }
  const itemOf = (m: MockKoha, id: number) => m.items.get(id)!;

  it("nothing changed → nothing written", async () => {
    const { mock, koha, id } = await created();
    const n = writes(mock).length;
    expect((await updateItem(koha, BIBLIO, id, COPY, { ...COPY, callNumber: " 370.15 HAT " }, LOCS)).kind).toBe("unchanged");
    expect(writes(mock)).toHaveLength(n);
  });

  it("sends only the changed field; Koha keeps the rest", async () => {
    const { mock, koha, id } = await created();
    itemOf(mock, id).collection_code = "PED"; // set in Koha
    const r = await updateItem(koha, BIBLIO, id, COPY, { ...COPY, shelfLocation: "REF" }, LOCS);
    expect(r).toMatchObject({ kind: "updated", changed: ["shelfLocation"] });
    expect(itemOf(mock, id)).toMatchObject({ location: "REF", callnumber: "370.15 HAT", collection_code: "PED" });
  });

  it("status: only the flags that must change; marking a lost copy found clears lost", async () => {
    const { mock, koha, id } = await created();
    await updateItem(koha, BIBLIO, id, COPY, { ...COPY, status: "lost" }, LOCS);
    expect(itemOf(mock, id).lost_status).toBe(1);
    await updateItem(koha, BIBLIO, id, { ...COPY, status: "lost" }, { ...COPY, status: "available" }, LOCS);
    expect(itemOf(mock, id)).toMatchObject({ lost_status: 0, withdrawn: 0, damaged_status: 0 });
    expect(heldCopy(itemOf(mock, id)).status).toBe("available");
  });

  it("a field changed in Koha too is a conflict, and nothing is written", async () => {
    const { mock, koha, id } = await created();
    itemOf(mock, id).location = "STAFF"; // a cataloguer moved it in Koha
    const n = writes(mock).length;
    expect(await updateItem(koha, BIBLIO, id, { ...COPY, shelfLocation: "General stacks" }, { ...COPY, shelfLocation: "REF" }, LOCS)).toEqual({
      kind: "conflict", conflicts: [{ field: "shelfLocation", koha: "STAFF", mine: "REF" }],
    });
    expect(writes(mock)).toHaveLength(n);
  });

  it("a copy on loan keeps its status (circulation decides it), but its call number can still change", async () => {
    const { mock, koha, id } = await created();
    itemOf(mock, id).checked_out_date = "2026-09-27";
    const onLoan = { ...COPY, status: "on_loan" as const };
    expect(await updateItem(koha, BIBLIO, id, onLoan, { ...onLoan, status: "withdrawn" }, LOCS)).toEqual({ kind: "on_loan" });
    expect(itemOf(mock, id).withdrawn).toBe(0);
    expect((await updateItem(koha, BIBLIO, id, onLoan, { ...onLoan, callNumber: "370.15 HAT c.2" }, LOCS)).kind).toBe("updated");
  });

  it("a barcode another item holds is refused; an item Koha moved or deleted is gone", async () => {
    const { mock, koha, id } = await created();
    await createItem(koha, BIBLIO, { ...COPY, barcode: "0991" }, { libraryId: "PTEC", locations: LOCS });
    expect(await updateItem(koha, BIBLIO, id, COPY, { ...COPY, barcode: "0991" }, LOCS)).toEqual({ kind: "barcode_taken", barcode: "0991" });
    expect(itemOf(mock, id).external_id).toBe("0803");
    expect(await updateItem(koha, 2, id, COPY, { ...COPY, callNumber: "x" }, LOCS)).toEqual({ kind: "gone" });
    expect(await updateItem(koha, BIBLIO, 99_999, COPY, { ...COPY, callNumber: "x" }, LOCS)).toEqual({ kind: "gone" });
  });
});

describe("the shelf is Koha's location list", () => {
  it("reads the list with catalogue permission, and maps a code or its label to the code", async () => {
    const { koha } = setup();
    expect(await readLocations(koha)).toEqual(LOCS);
    expect(locationCode("GEN", LOCS)).toBe("GEN");
    expect(locationCode("General stacks", LOCS)).toBe("GEN");
    expect(locationCode("B-2-01", LOCS)).toBeNull();
    expect(locationCode("  ", LOCS)).toBeNull();
  });

  it("a legacy free-text mark in the e-Library cannot manufacture a conflict", async () => {
    const s = setup();
    const r = await createItem(s.koha, BIBLIO, COPY, { libraryId: "PTEC", locations: LOCS });
    if (r.kind !== "created") throw new Error("setup");
    // The e-Library's row holds "B-2-01" (typed before Koha); Koha holds GEN.
    const out = await updateItem(s.koha, BIBLIO, r.item.item_id, { ...COPY, shelfLocation: "B-2-01" }, { ...COPY, shelfLocation: "REF" }, LOCS);
    expect(out).toMatchObject({ kind: "updated", changed: ["shelfLocation"] });
    expect(s.mock.items.get(r.item.item_id)!.location).toBe("REF");
  });
});
