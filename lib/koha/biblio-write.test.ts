/**
 * Creating and editing Koha records (Phase 5), through the REAL client against
 * the in-process mock Koha, which answers the way Koha 26.05.03's
 * Biblios#add / #update do (duplicate check, 403 without edit_catalogue,
 * 403 on a locked record, 404 for a deleted one).
 */
import { describe, it, expect } from "vitest";
import { createKohaClient } from "./client";
import { resolveKohaConfig } from "./config";
import { createMockKoha, type MockKoha } from "./mock";
import { createBiblio, updateBiblio, pickWritable } from "./biblio-write";
import { projectBiblio, type MarcDataField } from "./projection";
import type { WritableBookFields } from "./marc-write";
import type { FetchLike } from "./auth";

const BOOK: WritableBookFields = {
  title: "Visible Learning for Teachers", author: "Hattie, John", isbn: "9780415690157",
  publisher: "Routledge", year: 2012, language: "en", category: "370 Education",
};

function setup(opts: Parameters<typeof createMockKoha>[0] = {}, wrap?: (f: FetchLike) => FetchLike) {
  const mock = createMockKoha(opts);
  const koha = createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "mock" }), {
    fetch: wrap ? wrap(mock.fetch) : mock.fetch, sleep: async () => {},
  });
  return { mock, koha };
}
const writes = (mock: MockKoha) => mock.calls.filter((c) => c.method === "POST" && c.path.startsWith("/api/v1/biblios") || c.method === "PUT");
const held = (mock: MockKoha, id: number) => pickWritable(projectBiblio(mock.records.get(id)!)!);

describe("create", () => {
  it("POSTs one record and reports what Koha now holds", async () => {
    const { mock, koha } = setup();
    const r = await createBiblio(koha, { ...BOOK, ddc: "370.15 HAT" });
    expect(r.kind).toBe("created");
    if (r.kind !== "created") return;
    expect(r.fields).toEqual(BOOK);
    expect(held(mock, r.biblioId)).toEqual(BOOK);
    expect(writes(mock)).toHaveLength(1);
    expect(writes(mock)[0].headers["content-type"]).toBe("application/marc-in-json");
    expect(writes(mock)[0].headers["x-confirm-not-duplicate"]).toBeUndefined();
  });

  it("returns Koha's duplicate match for a person to decide, and creates only on an explicit override", async () => {
    const { mock, koha } = setup();
    const first = await createBiblio(koha, BOOK);
    const again = await createBiblio(koha, BOOK);
    expect(again).toEqual({ kind: "duplicate", biblioId: first.kind === "created" ? first.biblioId : -1, title: BOOK.title, author: BOOK.author });
    expect(mock.records.size).toBe(1);
    const forced = await createBiblio(koha, BOOK, { confirmNotDuplicate: true });
    expect(forced.kind).toBe("created");
    expect(writes(mock).at(-1)!.headers["x-confirm-not-duplicate"]).toBe("1");
    expect(mock.records.size).toBe(2);
  });

  it("an API user without edit_catalogue is a configuration problem, not an ambiguous write", async () => {
    const { koha } = setup({ canWrite: false });
    const r = await createBiblio(koha, BOOK);
    expect(r).toMatchObject({ kind: "failed", ambiguous: false, error: { kind: "forbidden", failureKind: "config" } });
  });

  it("a write that times out is AMBIGUOUS and is sent exactly once", async () => {
    let posts = 0;
    const { koha } = setup({}, (f) => async (url, init) => {
      if ((init?.method ?? "GET") === "POST" && url.endsWith("/api/v1/biblios")) {
        posts++;
        throw new TypeError("fetch failed: socket hang up");
      }
      return f(url, init);
    });
    const r = await createBiblio(koha, BOOK);
    expect(r).toMatchObject({ kind: "failed", ambiguous: true });
    expect(posts).toBe(1);
  });
});

describe("a create whose answer was lost", () => {
  it("the recheck finds the record it made — by exact title, from the database, parentheses and all — and creates nothing", async () => {
    let lose = true;
    const { mock, koha } = setup({}, (f) => async (url, init) => {
      const res = await f(url, init);
      // Koha DID create it; the answer never arrives.
      if (lose && (init?.method ?? "GET") === "POST" && url.endsWith("/api/v1/biblios")) { lose = false; throw new TypeError("fetch failed: socket hang up"); }
      return res;
    });
    const book = { ...BOOK, isbn: null, title: "Visible Learning (2nd edition)" };
    const first = await createBiblio(koha, book);
    expect(first).toMatchObject({ kind: "failed", ambiguous: true });
    expect(mock.records.size).toBe(1);
    const retry = await createBiblio(koha, book, { recheckExisting: true });
    expect(retry).toMatchObject({ kind: "duplicate", possiblyOurs: true, title: book.title, author: book.author });
    expect(mock.records.size).toBe(1);
  });

  it("if the recheck itself cannot be made, nothing is created blind", async () => {
    const { mock, koha } = setup({}, (f) => async (url, init) => {
      if ((init?.method ?? "GET") === "GET" && url.includes("/api/v1/biblios?")) throw new TypeError("fetch failed");
      return f(url, init);
    });
    const r = await createBiblio(koha, BOOK, { recheckExisting: true });
    expect(r).toMatchObject({ kind: "failed", ambiguous: true });
    expect(mock.records.size).toBe(0);
  });

  it("an explicit override skips the recheck (the librarian has seen the match)", async () => {
    const { mock, koha } = setup();
    await createBiblio(koha, BOOK);
    expect((await createBiblio(koha, BOOK, { recheckExisting: true, confirmNotDuplicate: true })).kind).toBe("created");
    expect(mock.records.size).toBe(2);
  });
});

describe("edit", () => {
  async function created(opts: Parameters<typeof createMockKoha>[0] = {}) {
    const s = setup(opts);
    const r = await createBiblio(s.koha, BOOK);
    if (r.kind !== "created") throw new Error("setup failed");
    return { ...s, id: r.biblioId };
  }

  it("nothing changed → nothing written", async () => {
    const { mock, koha, id } = await created();
    const before = writes(mock).length;
    expect(await updateBiblio(koha, id, BOOK, { ...BOOK, title: `  ${BOOK.title} ` })).toMatchObject({ kind: "unchanged" });
    expect(writes(mock)).toHaveLength(before);
  });

  it("writes only the changed field; a cataloguer's own field in Koha survives", async () => {
    const { mock, koha, id } = await created();
    // Something only Koha knows about.
    mock.records.get(id)!.fields.push({ "650": { ind1: " ", ind2: "0", subfields: [{ a: "Effective teaching." }] } });
    const r = await updateBiblio(koha, id, BOOK, { ...BOOK, publisher: "Corwin" });
    expect(r).toMatchObject({ kind: "updated", changed: ["publisher"], fields: { ...BOOK, publisher: "Corwin" } });
    expect(held(mock, id)).toEqual({ ...BOOK, publisher: "Corwin" });
    expect(mock.records.get(id)!.fields.some((f) => "650" in f)).toBe(true);
  });

  it("the same field changed in Koha since the last sync is a conflict, and nothing is written", async () => {
    const { mock, koha, id } = await created();
    const f245 = mock.records.get(id)!.fields.find((f) => "245" in f)!["245"] as MarcDataField;
    f245.subfields = [{ a: "Visible Learning (Koha edit)" }];
    const before = writes(mock).length;
    const r = await updateBiblio(koha, id, BOOK, { ...BOOK, title: "Visible Learning (e-Library edit)" });
    expect(r).toEqual({ kind: "conflict", conflicts: [{ field: "title", koha: "Visible Learning (Koha edit)", mine: "Visible Learning (e-Library edit)" }] });
    expect(writes(mock)).toHaveLength(before);
  });

  it("a DIFFERENT field changed in Koha is kept, and reported back as what Koha now holds", async () => {
    const { mock, koha, id } = await created();
    const f245 = mock.records.get(id)!.fields.find((f) => "245" in f)!["245"] as MarcDataField;
    f245.subfields = [{ a: "Visible Learning (Koha edit)" }];
    const r = await updateBiblio(koha, id, BOOK, { ...BOOK, year: 2015 });
    expect(r).toMatchObject({ kind: "updated", fields: { title: "Visible Learning (Koha edit)", year: 2015 } });
  });

  it("both sides made the same change: not a conflict", async () => {
    const { mock, koha, id } = await created();
    (mock.records.get(id)!.fields.find((f) => "245" in f)!["245"] as MarcDataField).subfields = [{ a: "Same" }];
    expect((await updateBiblio(koha, id, BOOK, { ...BOOK, title: "Same" })).kind).toBe("unchanged");
  });

  it("deleted in Koha → gone; locked in Koha → locked", async () => {
    const { koha } = await created();
    expect(await updateBiblio(koha, 999_999, BOOK, { ...BOOK, title: "X" })).toEqual({ kind: "gone" });
    const locked = await created({ locked: [1000] });
    expect(await updateBiblio(locked.koha, 1000, BOOK, { ...BOOK, title: "X" })).toEqual({ kind: "locked" });
  });

  it("a client in read mode refuses to write at all", async () => {
    const mock = createMockKoha();
    const koha = createKohaClient(resolveKohaConfig({
      KOHA_INTEGRATION: "read", KOHA_BASE_URL: mock.baseUrl, KOHA_CLIENT_ID: "x", KOHA_CLIENT_SECRET: "y",
    }), { fetch: mock.fetch });
    const r = await createBiblio(koha, BOOK);
    expect(r).toMatchObject({ kind: "failed", ambiguous: false, error: { kind: "config" } });
    expect(mock.calls.filter((c) => c.method !== "GET" && !c.path.includes("oauth"))).toHaveLength(0);
  });
});
