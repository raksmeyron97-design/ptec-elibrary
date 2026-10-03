/**
 * Covers from Koha — the doing half (cover-sync.ts), against an in-memory
 * catalog_books that answers like PostgREST: paged reads, and updates that
 * return only the rows their filters matched.
 */
import { describe, it, expect, vi } from "vitest";
import { readKohaCoverList, refreshKohaCovers, type CoverDb } from "./cover-sync";
import type { KohaCoverList } from "./covers";

type Row = { id: string; koha_biblio_id: number | null; cover_url: string | null; title?: string };

function fakeDb(rows: Row[], opts: { onUpdate?: (id: string) => void } = {}) {
  const writes: { id: string; cover_url: string | null }[] = [];
  const db = {
    from() {
      return {
        select() {
          const q = {
            not: () => q, order: () => q, eq: () => q, is: () => q,
            range: async (from: number, to: number) => ({ data: rows.filter((r) => r.koha_biblio_id !== null).slice(from, to + 1).map(({ id, koha_biblio_id, cover_url }) => ({ id, koha_biblio_id, cover_url })), error: null }),
            select: async () => ({ data: [], error: null }),
          };
          return q;
        },
        update(patch: { cover_url: string | null }) {
          const filters: ((r: Row) => boolean)[] = [];
          const q = {
            eq: (col: string, v: unknown) => { filters.push((r) => (r as Record<string, unknown>)[col] === v); return q; },
            is: (col: string, v: null) => { filters.push((r) => (r as Record<string, unknown>)[col] === v); return q; },
            not: () => q, order: () => q,
            range: async () => ({ data: [], error: null }),
            select: async () => {
              const hit = rows.filter((r) => filters.every((f) => f(r)));
              for (const r of hit) { opts.onUpdate?.(r.id); r.cover_url = patch.cover_url; writes.push({ id: r.id, cover_url: patch.cover_url }); }
              return { data: hit.map((r) => ({ id: r.id })), error: null };
            },
          };
          return q;
        },
      };
    },
  } as unknown as CoverDb;
  return { db, rows, writes };
}
const list = (pairs: [number, number][], complete = true): (() => Promise<KohaCoverList>) => async () => ({ covers: new Map(pairs), complete });

describe("refreshKohaCovers", () => {
  it("sets, changes and clears only the covers it owns, and writes nothing else", async () => {
    const { db, rows, writes } = fakeDb([
      { id: "a", koha_biblio_id: 1, cover_url: null, title: "A" },
      { id: "b", koha_biblio_id: 2, cover_url: "/api/catalog-covers/20" },
      { id: "c", koha_biblio_id: 3, cover_url: "/api/catalog-covers/30" },
      { id: "own", koha_biblio_id: 4, cover_url: "https://storage.ptec/files/catalog-covers/own.webp" },
      { id: "local", koha_biblio_id: null, cover_url: null },
    ]);
    const r = await refreshKohaCovers(db, list([[1, 10], [2, 21], [4, 40]]));
    expect(r).toMatchObject({ status: "ok", set: 1, changed: 1, cleared: 1, ownCoverKept: 1, raced: 0, errors: [] });
    expect(rows.map((x) => [x.id, x.cover_url])).toEqual([
      ["a", "/api/catalog-covers/10"], ["b", "/api/catalog-covers/21"], ["c", null],
      ["own", "https://storage.ptec/files/catalog-covers/own.webp"], ["local", null],
    ]);
    expect(writes.map((w) => w.id).sort()).toEqual(["a", "b", "c"]);
    expect(rows[0].title).toBe("A");
  });

  it("a second run with the same list writes nothing (idempotent)", async () => {
    const { db, writes } = fakeDb([{ id: "a", koha_biblio_id: 1, cover_url: null }]);
    await refreshKohaCovers(db, list([[1, 10]]));
    const again = await refreshKohaCovers(db, list([[1, 10]]));
    expect(writes).toHaveLength(1);
    expect(again).toMatchObject({ set: 0, changed: 0, cleared: 0 });
  });

  it("an unreadable list changes nothing", async () => {
    const { db, writes } = fakeDb([{ id: "c", koha_biblio_id: 3, cover_url: "/api/catalog-covers/30" }]);
    const r = await refreshKohaCovers(db, async () => ({ error: "Koha's cover report answered 500." }));
    expect(r).toEqual({ status: "unavailable", reason: "Koha's cover report answered 500." });
    expect(writes).toHaveLength(0);
  });

  it("a cover a librarian saves between the read and the write is not overwritten (compare-and-set)", async () => {
    const rows: Row[] = [{ id: "a", koha_biblio_id: 1, cover_url: null }];
    let first = true;
    const { db } = fakeDb(rows);
    const wrapped = {
      from: (t: "catalog_books") => {
        const base = db.from(t);
        return {
          select: base.select.bind(base),
          update: (patch: { cover_url: string | null }) => {
            if (first) { first = false; rows[0].cover_url = "https://storage.ptec/files/catalog-covers/new.webp"; }
            return base.update(patch);
          },
        };
      },
    } as CoverDb;
    const r = await refreshKohaCovers(wrapped, list([[1, 10]]));
    expect(r).toMatchObject({ set: 0, raced: 1 });
    expect(rows[0].cover_url).toBe("https://storage.ptec/files/catalog-covers/new.webp");
  });
});

describe("readKohaCoverList", () => {
  const cfg = { opacUrl: "http://opac.test", reportId: 2 };
  it("asks the OPAC's public report once, with a time budget, and parses it", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ biblionumber: 308, imagenumber: 1, total: 1 }]), { status: 200 }));
    const l = await readKohaCoverList(fetchImpl as unknown as typeof fetch, cfg);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe("http://opac.test/cgi-bin/koha/svc/report?id=2&annotated=1");
    expect(l).toEqual({ covers: new Map([[308, 1]]), complete: true });
  });
  it("a refusal, a non-report body or a network failure is an error, never an empty list", async () => {
    for (const make of [
      () => new Response("Internal Server Error", { status: 500 }),
      () => new Response(JSON.stringify({ error: "not public" }), { status: 200 }),
      () => { throw new TypeError("fetch failed"); },
    ]) {
      const l = await readKohaCoverList((async () => make()) as unknown as typeof fetch, cfg);
      expect("error" in l).toBe(true);
    }
  });
});
