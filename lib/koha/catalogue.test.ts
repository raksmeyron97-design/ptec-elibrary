/**
 * Reading Koha for the sync. Each rule below is a behaviour of a live Koha
 * 26.05.03 that answered 500, or read the wrong rows, when the rule was not
 * followed (docs/KOHA-SYNC.md):
 *   • /biblios sorts by `+biblio_id` — `+me.biblio_id` becomes me.me.biblionumber;
 *   • /biblios filters on `me.timestamp` — a bare `timestamp` is ambiguous there;
 *   • a cursor goes back exactly as Koha wrote it — /biblios reads a UTC
 *     value as local time, seven hours early, so every record "changed".
 */
import { describe, it, expect } from "vitest";
import type { KohaClient, KohaGetOptions } from "./client";
import { KOHA_PAGE_SIZE, KOHA_SYNC_TIMEOUT_MS, readKohaBiblioChanges, readKohaBiblios, readKohaItems, readKohaItemsOf } from "./catalogue";
import { inKohaOffset, newestTimestamp } from "./sync-run";

type Call = { path: string; opts: KohaGetOptions };

/** A client that serves `rows` in pages and records every request. */
function fakeClient(rows: unknown[], opts: { total?: boolean } = {}) {
  const calls: Call[] = [];
  const client: KohaClient = {
    mode: "read",
    async get<T>(path: string, validate: (v: unknown) => v is T, o: KohaGetOptions = {}) {
      calls.push({ path, opts: o });
      const page = Number(o.query?._page ?? 1);
      const per = Number(o.query?._per_page ?? KOHA_PAGE_SIZE);
      const data = rows.slice((page - 1) * per, page * per);
      if (!validate(data)) throw new Error("fixture did not validate");
      return { data, total: opts.total === false ? null : rows.length, requestId: "1" };
    },
  };
  return { client, calls };
}

const item = (id: number) => ({ item_id: id, biblio_id: Math.ceil(id / 3), external_id: String(id) });
const marc = (id: number) => ({ leader: "", fields: [{ "245": { subfields: [{ a: `T${id}` }] } }, { "999": { subfields: [{ c: String(id) }] } }] });

describe("reading every row, page by page", () => {
  it("reads all items in stable id order, with labels embedded", async () => {
    const rows = Array.from({ length: KOHA_PAGE_SIZE * 2 + 7 }, (_, i) => item(i + 1));
    const { client, calls } = fakeClient(rows);
    const out = await readKohaItems(client);
    expect(out).toHaveLength(rows.length);
    expect(calls).toHaveLength(3);
    expect(calls[0].opts.query).toMatchObject({ _page: 1, _per_page: KOHA_PAGE_SIZE, _order_by: "+me.item_id" });
    expect(calls[0].opts.embed).toEqual(["+strings"]);
    // A background read: its own budget, not the interactive KOHA_TIMEOUT_MS.
    expect(calls.every((c) => c.opts.timeoutMs === KOHA_SYNC_TIMEOUT_MS)).toBe(true);
  });

  it("stops on a short page when Koha sends no total (the MARC listing sends none)", async () => {
    const rows = Array.from({ length: KOHA_PAGE_SIZE + 1 }, (_, i) => marc(i + 1));
    const { client, calls } = fakeClient(rows, { total: false });
    expect(await readKohaBiblios(client)).toHaveLength(rows.length);
    expect(calls).toHaveLength(2);
  });

  it("stops at an exact page boundary once the total is reached", async () => {
    const rows = Array.from({ length: KOHA_PAGE_SIZE }, (_, i) => item(i + 1));
    const { calls, client } = fakeClient(rows);
    await readKohaItems(client);
    expect(calls).toHaveLength(1);
  });
});

describe("the forms Koha 26.05 accepts", () => {
  it("/biblios: sorted by +biblio_id, as MARC-in-JSON", async () => {
    const { client, calls } = fakeClient([marc(1)]);
    await readKohaBiblios(client);
    expect(calls[0].path).toBe("/biblios");
    expect(calls[0].opts.query?._order_by).toBe("+biblio_id");
    expect(calls[0].opts.accept).toBe("application/marc-in-json");
  });

  it("/biblios changes: filtered on me.timestamp, with the cursor sent verbatim", async () => {
    const { client, calls } = fakeClient([{ biblio_id: 5, timestamp: "2026-09-26T13:52:57+07:00" }]);
    await readKohaBiblioChanges(client, "2026-09-26T13:32:55+07:00");
    expect(JSON.parse(String(calls[0].opts.query?.q))).toEqual({ "me.timestamp": { ">=": "2026-09-26T13:32:55+07:00" } });
    expect(calls[0].opts.query?._order_by).toBe("+biblio_id");
  });

  it("/items changes: filtered on timestamp; items of given records: an id list", async () => {
    const { client, calls } = fakeClient([item(1)]);
    await readKohaItems(client, { since: "2026-09-26T13:52:57+07:00", labels: false });
    expect(JSON.parse(String(calls[0].opts.query?.q))).toEqual({ timestamp: { ">=": "2026-09-26T13:52:57+07:00" } });
    expect(calls[0].opts.embed).toBeUndefined();
    await readKohaItemsOf(client, [3, 1, 3]);
    expect(JSON.parse(String(calls[1].opts.query?.q))).toEqual({ biblio_id: [3, 1] });
  });

  it("splits long id lists so no request line grows without bound", async () => {
    const { client, calls } = fakeClient([]);
    await readKohaItemsOf(client, Array.from({ length: 250 }, (_, i) => i + 1));
    expect(calls).toHaveLength(3);
  });
});

describe("cursors", () => {
  it("keep Koha's own text for the newest timestamp, offset included", () => {
    expect(newestTimestamp(["2026-09-26T13:18:07+07:00", "2026-09-26T13:52:57+07:00", null], null)).toBe("2026-09-26T13:52:57+07:00");
    expect(newestTimestamp(["2026-09-26T13:00:00+07:00"], "2026-09-26T13:52:57+07:00")).toBe("2026-09-26T13:52:57+07:00");
    expect(newestTimestamp([], null)).toBeNull();
  });

  it("write an instant in Koha's offset, taken from one of Koha's own timestamps", () => {
    const t = new Date("2026-09-26T06:32:55.206Z");
    expect(inKohaOffset(t, "2026-09-26T13:18:07+07:00")).toBe("2026-09-26T13:32:55+07:00");
    expect(inKohaOffset(t, "2026-09-26T02:00:00-04:30")).toBe("2026-09-26T02:02:55-04:30");
    expect(inKohaOffset(t, null)).toBe("2026-09-26T06:32:55Z");
  });
});
