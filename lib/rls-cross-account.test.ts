/**
 * Cross-account (IDOR) probes — can reader A reach reader B's rows?
 *
 * Opt-in, like `lib/rls.test.ts`:
 *
 *   CROSS_ACCOUNT_PROBE=1 npx vitest run lib/rls-cross-account.test.ts
 *
 * ── Why this exists separately from lib/rls.test.ts ─────────────────────────
 * That file proves the ANONYMOUS surface is closed, and its one authenticated
 * assertion is "a fresh probe user owns no rows anywhere, so its visible count
 * is zero". That is a real check and it is not this one. Every user-owned
 * table here is guarded by a policy of the shape `user_id = auth.uid()`, and a
 * policy of that shape is indistinguishable from having no policy at all until
 * two DIFFERENT users ask for the SAME row. Until then "I can only see my own
 * rows" and "there is only one user" produce identical evidence.
 *
 * The Final Production Reliability Audit 2.0 could not close this against
 * production because two ordinary production logins were never available, and
 * fabricating them was correctly out of bounds. This closes it against the
 * database boundary instead, deterministically, with two seeded readers.
 *
 * ── What it tests, and where ────────────────────────────────────────────────
 * Directly against PostgREST with each reader's OWN access token — not through
 * the app. That is deliberate: RLS is the last line, the one that holds when a
 * route forgets its `.eq("user_id", …)`, and testing it through the app would
 * pass on a UI that merely hides things. Server-side scoping in the actions
 * themselves is covered by `lib/db/silent-mutation.test.ts`.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 * NOT safe against production, and cannot reach it: it signs in with seeded
 * `@ptec.local` credentials that exist only in the local/CI stack, and it
 * refuses to run against a URL that is not localhost. Every row it creates is
 * removed in `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = !!process.env.CROSS_ACCOUNT_PROBE;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Seeded in supabase/seed.sql. Both are plain readers. */
const READER_A = { email: "student@ptec.local", password: "Password123!", id: "44444444-4444-4444-4444-444444444444" };
const READER_B = { email: "student2@ptec.local", password: "Password123!", id: "55555555-5555-5555-5555-555555555555" };

/** A published book from the seed, used as the resource both readers act on. */
const BOOK_ID = "33333333-3333-4333-8333-333333333301";

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(URL_);

function auth(token: string) {
  return { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
function service() {
  return { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string; msg?: string };
  if (!body.access_token) {
    throw new Error(`sign-in failed for ${email}: ${res.status} ${body.error_description ?? body.msg ?? ""}`);
  }
  return body.access_token;
}

/** Rows this file created, cleaned up with the service key in afterAll. */
const created: { table: string; id: string }[] = [];

/** Insert as `token`, returning the new row id. Uses the service key only for
 *  setup where a table has no INSERT policy for readers. */
async function insertAs(
  token: string,
  table: string,
  row: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; status: number; code?: string }> {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...auth(token), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const body = (await res.json().catch(() => ({}))) as
    | { id?: string }[]
    | { code?: string; message?: string };
  if (res.ok && Array.isArray(body) && body[0]?.id) {
    created.push({ table, id: body[0].id });
    return { ok: true, id: body[0].id, status: res.status };
  }
  return { ok: false, status: res.status, code: (body as { code?: string }).code };
}

async function selectRowAs(token: string, table: string, id: string): Promise<unknown[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}?id=eq.${id}&select=id`, { headers: auth(token) });
  if (!res.ok) return [];
  return (await res.json().catch(() => [])) as unknown[];
}

async function updateRowAs(
  token: string,
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ status: number; rows: number }> {
  const res = await fetch(`${URL_}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...auth(token), Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  const body = (await res.json().catch(() => [])) as unknown[];
  return { status: res.status, rows: Array.isArray(body) ? body.length : 0 };
}

async function deleteRowAs(token: string, table: string, id: string): Promise<{ status: number; rows: number }> {
  const res = await fetch(`${URL_}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: { ...auth(token), Prefer: "return=representation" },
  });
  const body = (await res.json().catch(() => [])) as unknown[];
  return { status: res.status, rows: Array.isArray(body) ? body.length : 0 };
}

/** The row still exists, read with the service key — the ground truth that a
 *  denied DELETE/UPDATE really changed nothing. */
async function existsTruly(table: string, id: string): Promise<boolean> {
  const res = await fetch(`${URL_}/rest/v1/${table}?id=eq.${id}&select=id`, { headers: service() });
  const body = (await res.json().catch(() => [])) as unknown[];
  return Array.isArray(body) && body.length > 0;
}

describe.skipIf(!RUN)("cross-account isolation (live PostgREST, two seeded readers)", () => {
  let tokenA = "";
  let tokenB = "";

  beforeAll(async () => {
    if (!URL_ || !ANON) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are required");
    if (!isLocal) {
      throw new Error(
        `refusing to run against ${URL_} — this probe signs in with seeded credentials and writes rows, so it is local/CI only`,
      );
    }
    tokenA = await signIn(READER_A.email, READER_A.password);
    tokenB = await signIn(READER_B.email, READER_B.password);
  }, 30_000);

  afterAll(async () => {
    if (!SERVICE) return;
    for (const { table, id } of created.reverse()) {
      await fetch(`${URL_}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: service() });
    }
  }, 30_000);

  it("signs in as two DIFFERENT readers", () => {
    expect(tokenA).toBeTruthy();
    expect(tokenB).toBeTruthy();
    expect(tokenA).not.toBe(tokenB);
  });

  // Each entry is a user-owned table, a row A can create, and the mutation B
  // would attempt. `id` is the primary key everywhere here.
  const OWNED: { table: string; row: (userId: string) => Record<string, unknown>; patch: Record<string, unknown> }[] = [
    {
      table: "reading_progress",
      row: (userId) => ({ user_id: userId, book_id: BOOK_ID, progress_pct: 11 }),
      patch: { progress_pct: 99 },
    },
    {
      table: "reader_bookmarks",
      row: (userId) => ({ user_id: userId, record_type: "book", record_id: BOOK_ID, page_number: 7 }),
      patch: { page_number: 999 },
    },
    {
      table: "reading_lists",
      row: (userId) => ({ user_id: userId, name: "cross-account probe list" }),
      patch: { name: "hijacked" },
    },
    {
      table: "book_annotations",
      row: (userId) => ({ user_id: userId, book_id: BOOK_ID, page_number: 3, content: "probe annotation" }),
      patch: { content: "hijacked" },
    },
    {
      table: "book_notes",
      row: (userId) => ({ user_id: userId, book_id: BOOK_ID, content: "probe note" }),
      patch: { content: "hijacked" },
    },
  ];

  for (const { table, row, patch } of OWNED) {
    describe(table, () => {
      let idA: string | undefined;

      it("A can create its own row", async () => {
        const res = await insertAs(tokenA, table, row(READER_A.id));
        // A table this reader may not write to at all is a stricter posture,
        // not a weaker one — record it and skip the rest rather than fail.
        if (!res.ok) {
          expect(res.status).toBeGreaterThanOrEqual(400);
          return;
        }
        idA = res.id;
        expect(idA).toBeTruthy();
      });

      it("A can read its own row back", async () => {
        if (!idA) return;
        expect(await selectRowAs(tokenA, table, idA)).toHaveLength(1);
      });

      it("B CANNOT read A's row", async () => {
        if (!idA) return;
        // RLS filters rather than errors, so the correct answer is an empty
        // set — which is also what "not found" looks like to B. Both are fine;
        // a row coming back is not.
        expect(await selectRowAs(tokenB, table, idA)).toHaveLength(0);
      });

      it("B CANNOT update A's row, and A's data is untouched", async () => {
        if (!idA) return;
        const res = await updateRowAs(tokenB, table, idA, patch);
        expect(res.rows).toBe(0);
        expect(await existsTruly(table, idA)).toBe(true);
      });

      it("B CANNOT delete A's row", async () => {
        if (!idA) return;
        const res = await deleteRowAs(tokenB, table, idA);
        expect(res.rows).toBe(0);
        // The ground truth, read past RLS: the row is still there.
        expect(await existsTruly(table, idA)).toBe(true);
      });

      it("B cannot create a row STAMPED FOR A", async () => {
        // The other half of the IDOR question: not "can B read A's row" but
        // "can B write one into A's account". A `WITH CHECK (user_id =
        // auth.uid())` policy is what refuses this, and it is a separate
        // clause from the `USING` one that refuses the reads above.
        const res = await insertAs(tokenB, table, row(READER_A.id));
        expect(res.ok).toBe(false);
      });

      it("A can update and delete its OWN row", async () => {
        if (!idA) return;
        const upd = await updateRowAs(tokenA, table, idA, patch);
        expect(upd.rows).toBe(1);
        const del = await deleteRowAs(tokenA, table, idA);
        expect(del.rows).toBe(1);
        expect(await existsTruly(table, idA)).toBe(false);
        idA = undefined;
      });
    });
  }

  describe("profiles", () => {
    it("B cannot rename A", async () => {
      const res = await updateRowAs(tokenB, "profiles", READER_A.id, { full_name: "hijacked" });
      expect(res.rows).toBe(0);
      const check = await fetch(`${URL_}/rest/v1/profiles?id=eq.${READER_A.id}&select=full_name`, {
        headers: service(),
      });
      const [profile] = (await check.json()) as { full_name: string }[];
      expect(profile.full_name).not.toBe("hijacked");
    });

    it("B cannot escalate its own role", async () => {
      // The most valuable write in the schema. Denied either by RLS or by a
      // column-level grant; both are correct, a changed role is not.
      await updateRowAs(tokenB, "profiles", READER_B.id, { role: "super_admin" });
      const check = await fetch(`${URL_}/rest/v1/profiles?id=eq.${READER_B.id}&select=role`, {
        headers: service(),
      });
      const [profile] = (await check.json()) as { role: string }[];
      expect(profile.role).toBe("reader");
    });
  });

  describe("the probe itself is honest", () => {
    it("would have caught a missing policy — B sees its OWN rows", async () => {
      // A test whose every assertion is "zero rows" passes just as well when
      // the token is broken, the table is empty, or the URL is wrong. This is
      // the positive control that rules all three out.
      const res = await insertAs(tokenB, "reading_progress", {
        user_id: READER_B.id,
        book_id: BOOK_ID,
        progress_pct: 22,
      });
      expect(res.ok).toBe(true);
      expect(await selectRowAs(tokenB, "reading_progress", res.id!)).toHaveLength(1);
      expect(await selectRowAs(tokenA, "reading_progress", res.id!)).toHaveLength(0);
    });
  });
});
