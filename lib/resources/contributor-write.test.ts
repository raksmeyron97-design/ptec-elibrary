// Behaviour of the canonical contributor write path, against a fake PostgREST
// client. Mocked because the point is the DECISIONS — which rows are written,
// in what order, with which role, and what happens when a byline cannot be
// resolved — not that Supabase inserts rows.

import { describe, expect, it, vi } from "vitest";

import { recordResourceContributors } from "@/lib/resources/contributor-write";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

const ORG = {
  institutionName: "Example Teacher Education College",
  institutionNameKm: "វិទ្យាល័យគរុកោសល្យគំរូ",
  abbreviation: "ETEC",
} as unknown as OrgIdentity;

type Inserted = { table: string; rows: Record<string, unknown>[] };

/**
 * Minimal stand-in for the PostgREST builder chain this module uses.
 * `existing` names contributors already in the table, so the find-or-create
 * branch can be exercised both ways.
 */
function fakeDb(opts: { existing?: Record<string, string>; failInsert?: string } = {}) {
  const inserts: Inserted[] = [];
  const deletes: Record<string, unknown>[] = [];
  let autoId = 0;

  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        ilike: (_col: string, val: string) => {
          filters.display_name = val;
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => {
          const name = String(filters.display_name ?? "");
          const id = opts.existing?.[name];
          return { data: id ? { id } : null, error: null };
        },
        single: async () => ({ data: { id: `new-${++autoId}` }, error: null }),
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          const list = Array.isArray(rows) ? rows : [rows];
          inserts.push({ table, rows: list });
          if (opts.failInsert === table) {
            return { ...chain, error: { message: "boom" }, select: () => chain,
              single: async () => ({ data: null, error: { message: "boom" } }) } as never;
          }
          return {
            ...chain,
            select: () => ({ single: async () => ({ data: { id: `new-${++autoId}` }, error: null }) }),
            then: (res: (v: { error: null }) => unknown) => res({ error: null }),
          } as never;
        },
        delete() {
          const d: Record<string, unknown> = {};
          const dChain = {
            eq: (col: string, val: unknown) => {
              d[col] = val;
              return dChain;
            },
            then: (res: (v: { error: null }) => unknown) => {
              deletes.push(d);
              return res({ error: null });
            },
          };
          return dChain as never;
        },
      };
      return chain as never;
    },
  };
  return { db: db as never, inserts, deletes };
}

const bookInput = (byline: string | null) => ({
  resourceType: "book" as const,
  resourceId: "book-1",
  byline,
  org: ORG,
});

describe("what gets written", () => {
  it("records one credit per person, in byline order", async () => {
    const { db, inserts } = fakeDb();
    const result = await recordResourceContributors(db, bookInput("Louis Cohen, Lawrence Manion"));

    expect(result).toMatchObject({ written: 2, resolved: true });
    const links = inserts.find((i) => i.table === "resource_contributors");
    expect(links?.rows.map((r) => r.sequence)).toEqual([0, 1]);
    expect(links?.rows.every((r) => r.resource_type === "book")).toBe(true);
  });

  it("stores the ROLE the byline stated, not always 'author'", async () => {
    const { db, inserts } = fakeDb();
    await recordResourceContributors(db, bookInput("A. Smith, B. Jones (Editors)"));
    const links = inserts.find((i) => i.table === "resource_contributors");
    expect(links?.rows.every((r) => r.role === "editor")).toBe(true);
  });

  it("defaults the role to author", async () => {
    const { db, inserts } = fakeDb();
    await recordResourceContributors(db, bookInput("Jane Doe"));
    expect(inserts.find((i) => i.table === "resource_contributors")?.rows[0].role).toBe("author");
  });

  it("types a corporate body as an organization contributor", async () => {
    const { db, inserts } = fakeDb();
    await recordResourceContributors(db, bookInput("Ministry of Education, Youth and Sport"));
    const created = inserts.find((i) => i.table === "contributors");
    expect(created?.rows[0]).toMatchObject({ contributor_type: "organization" });
  });

  it("reuses an existing contributor instead of creating a duplicate", async () => {
    const { db, inserts } = fakeDb({ existing: { "Jane Doe": "existing-1" } });
    await recordResourceContributors(db, bookInput("Jane Doe"));

    expect(inserts.find((i) => i.table === "contributors")).toBeUndefined();
    expect(inserts.find((i) => i.table === "resource_contributors")?.rows[0].contributor_id).toBe(
      "existing-1",
    );
  });
});

describe("what deliberately gets NO credit", () => {
  it("writes nothing for a byline that cannot be separated safely", async () => {
    // "Smith, John" is one inverted name or two people — unknowable. The
    // canonical model must not become a second home for a guessed identity.
    const { db, inserts } = fakeDb();
    const result = await recordResourceContributors(db, bookInput("Smith, John"));

    expect(result).toMatchObject({ written: 0, resolved: false });
    expect(inserts.find((i) => i.table === "resource_contributors")).toBeUndefined();
    expect(inserts.find((i) => i.table === "contributors")).toBeUndefined();
  });

  it.each([null, "", "   "])("writes nothing for %s", async (byline) => {
    const { db, inserts } = fakeDb();
    const result = await recordResourceContributors(db, bookInput(byline));
    expect(result?.written).toBe(0);
    expect(inserts.find((i) => i.table === "contributors")).toBeUndefined();
  });

  it("keeps the source text recoverable even when nothing resolves", async () => {
    const { db } = fakeDb();
    const result = await recordResourceContributors(db, bookInput("Smith, John"));
    expect(result?.sourceText).toBe("Smith, John");
  });
});

describe("replacing previous credits", () => {
  it("clears this resource's old credits before writing new ones", async () => {
    // An edit can change the byline entirely; a stale credit is worse than an
    // absent one.
    const { db, deletes } = fakeDb();
    await recordResourceContributors(db, bookInput("Jane Doe"));
    expect(deletes).toEqual([{ resource_type: "book", resource_id: "book-1" }]);
  });

  it("clears them even when the new byline resolves to nothing", async () => {
    const { db, deletes } = fakeDb();
    await recordResourceContributors(db, bookInput("Smith, John"));
    expect(deletes).toHaveLength(1);
  });
});

describe("never fails the save", () => {
  it("returns null rather than throwing when the link insert fails", async () => {
    const { db } = fakeDb({ failInsert: "resource_contributors" });
    await expect(
      recordResourceContributors(db, bookInput("Jane Doe")),
    ).resolves.toBeNull();
  });

  it("returns null rather than throwing when the client blows up", async () => {
    const exploding = {
      from: () => {
        throw new Error("connection lost");
      },
    } as never;
    await expect(
      recordResourceContributors(exploding, bookInput("Jane Doe")),
    ).resolves.toBeNull();
  });
});

describe("the institution", () => {
  it("is stored as an organization contributor", async () => {
    // contributor_type has no 'institution' value; the institution IDENTITY is
    // resolved at render time against System Settings, which is what produces
    // the @id reference. See docs/SEO-3.1-ENTITY-ARCHITECTURE.md §3.
    const { db, inserts } = fakeDb();
    await recordResourceContributors(db, bookInput(ORG.institutionName));
    expect(inserts.find((i) => i.table === "contributors")?.rows[0]).toMatchObject({
      contributor_type: "organization",
    });
  });
});

vi.restoreAllMocks();
