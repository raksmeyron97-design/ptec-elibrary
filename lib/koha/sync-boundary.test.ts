/**
 * The Koha sync's promises that are about WHERE code may reach, not what a
 * function returns (docs/KOHA-SYNC.md). The plan's behaviour is pinned in
 * sync-plan.test.ts; these read the source, because "never deletes" and
 * "never writes to Koha" are properties of every line, not of one input.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isFreshFullPreview, PREVIEW_MAX_AGE_MS } from "./sync-server";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** Source with comments removed — a comment saying "never .delete()" is not a call. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SYNC = ["lib/koha/sync-run.ts", "lib/koha/sync-plan.ts", "lib/koha/sync-server.ts", "lib/koha/catalogue.ts", "lib/koha/projection.ts"];
const ACTIONS = "app/(admin)/admin/(protected)/catalogs/koha-sync/actions.ts";
const CRON = "app/api/cron/koha-sync/route.ts";

describe("Koha sync boundary", () => {
  it("never deletes a row: Koha's deletions become a withdrawn copy and an unlisted record", () => {
    for (const f of SYNC) expect(code(f), f).not.toMatch(/\.delete\(/);
    expect(code("lib/koha/sync-run.ts")).toMatch(/status: "withdrawn"/);
    expect(code("lib/koha/sync-run.ts")).toMatch(/is_active: false/);
  });

  it("only reads Koha: the sync calls nothing on the client but get()", () => {
    for (const f of SYNC) expect(code(f), f).not.toMatch(/\b(koha|client)\.(write|post|put|patch|del|delete|request)\s*\(/);
  });

  it("the cron route checks the bearer before it starts anything, and never runs a first build", () => {
    const src = code(CRON);
    expect(src.indexOf("verifyBearer(")).toBeGreaterThan(-1);
    expect(src.indexOf("verifyBearer(")).toBeLessThan(src.indexOf("startKohaSync("));
    expect(src).toMatch(/requireInitialized: true/);
  });

  it("every admin action asks the registry before it starts a run", () => {
    const src = code(ACTIONS);
    const bodies = src.split(/export async function /).slice(1);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const guard = body.indexOf("requireAction(");
      expect(guard, body.slice(0, 40)).toBeGreaterThan(-1);
      const start = body.indexOf("startKohaSync(");
      if (start > -1) expect(guard).toBeLessThan(start);
    }
  });

  it("a full apply needs a fresh successful preview, checked on the server", () => {
    expect(code(ACTIONS)).toMatch(/if \(!isFreshFullPreview\(state\)\)/);
    const at = "2026-09-26T07:00:00Z";
    const now = Date.parse(at) + 60_000;
    const preview = { last_run_mode: "full", last_run_applied: false, last_run_status: "ok", last_run_at: at } as const;
    expect(isFreshFullPreview(preview, now)).toBe(true);
    expect(isFreshFullPreview({ ...preview, last_run_applied: true }, now)).toBe(false); // an apply is not a preview
    expect(isFreshFullPreview({ ...preview, last_run_mode: "incremental" }, now)).toBe(false);
    expect(isFreshFullPreview({ ...preview, last_run_status: "failed" }, now)).toBe(false);
    expect(isFreshFullPreview(preview, Date.parse(at) + PREVIEW_MAX_AGE_MS + 1)).toBe(false); // stale
    expect(isFreshFullPreview(null, now)).toBe(false);
  });

  it("koha_sync_state is closed to the browser (RLS on, revoked from anon and authenticated)", () => {
    const sql = read("supabase/migrations/0157_koha_sync.sql").toLowerCase();
    expect(sql).toMatch(/alter table (public\.)?koha_sync_state enable row level security/);
    expect(sql).toMatch(/revoke all on (table )?(public\.)?koha_sync_state from public, anon, authenticated/);
  });

  it("the scheduled job treats 409 (not connected / not built / already running) as a normal state", () => {
    const yml = read(".github/workflows/cron.yml");
    const job = yml.slice(yml.indexOf("\n  koha-sync:"));
    expect(job).toMatch(/\/api\/cron\/koha-sync/);
    expect(job).toMatch(/202\|409\) exit 0/);
  });
});
