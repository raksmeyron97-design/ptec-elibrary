/**
 * The librarian review's boundaries (docs/CATALOG-REVIEW.md), read from the
 * source the same way lib/koha/write-boundary.test.ts reads Koha's: what the
 * review may write, what it may never touch, and who may reach it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_POLICIES, routePolicy } from "@/lib/admin/access-policy";
import { BLOCK_REASONS, REVIEW_STATUSES } from "./review";
import { catalogReviewEnabled } from "./review-flag";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const ADMIN = "app/(admin)/admin/(protected)/catalogs";

const MIGRATION = read("supabase/migrations/0169_catalog_review_state.sql");
const ACTIONS = read(`${ADMIN}/review/actions.ts`);
/** Code only: a comment that NAMES a table it must not write is not a write. */
const ACTIONS_CODE = ACTIONS.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const LIST_PAGE = read(`${ADMIN}/review/page.tsx`);
const RECORD_PAGE = read(`${ADMIN}/review/[id]/page.tsx`);
const DUPLICATES_PAGE = read(`${ADMIN}/review/duplicates/page.tsx`);
const WORKSPACE = read(`${ADMIN}/review/[id]/_components/ReviewWorkspace.tsx`);
const OVERVIEW = read(`${ADMIN}/page.tsx`);
const EDIT_PAGE = read(`${ADMIN}/edit/[id]/page.tsx`);
const WIZARD = read(`${ADMIN}/edit/[id]/_components/EditBookWizard.tsx`);

/** SQL without comments, so prose that NAMES a forbidden statement is not mistaken for one. */
const sql = MIGRATION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("0169 — the review table is private, additive and empty", () => {
  it("is RLS-enabled and revoked from every client role in the same file", () => {
    expect(sql).toMatch(/alter table public\.catalog_review_state enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.catalog_review_state from public, anon, authenticated/i);
  });

  it("writes no row — no backfill, so production gets no bulk write", () => {
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("does not alter the public catalogue tables (anything there is anon-readable)", () => {
    expect(sql).not.toMatch(/alter table (public\.)?catalog_books/i);
    expect(sql).not.toMatch(/alter table (public\.)?catalog_copies/i);
  });

  it("stores exactly the review statuses and block reasons the code knows — and no READY_TO_VERIFY", () => {
    const statusCheck = sql.match(/status in \(([^)]*)\)/i)?.[1] ?? "";
    expect(statusCheck.match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1))).toEqual([...REVIEW_STATUSES]);
    const reasonCheck = sql.match(/blocked_reason in \(([^)]*)\)/i)?.[1] ?? "";
    expect(reasonCheck.match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1))).toEqual([...BLOCK_REASONS]);
    expect(sql).not.toMatch(/ready_to_verify/i);
  });
});

describe("review actions write review state and nothing else", () => {
  it("is a server-action module", () => {
    expect(ACTIONS.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("checks the switch, then the registry, before it reads anything", () => {
    const body = ACTIONS.slice(ACTIONS.indexOf("async function prepare"));
    const flag = body.indexOf("catalogReviewEnabled()");
    const guard = body.indexOf('requireAction("catalog.review.transition")');
    const firstRead = body.indexOf(".from(");
    expect(flag).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(flag);
    expect(firstRead).toBeGreaterThan(guard);
  });

  it("every exported action is guarded: the switch and the registry come before any read", () => {
    const parts = ACTIONS_CODE.split(/^export async function /m).slice(1);
    expect(parts.length).toBe(13);
    for (const part of parts) {
      const name = part.slice(0, part.indexOf("("));
      const body = part.slice(0, part.search(/^}/m) + 1);
      if (/return (transition|waiver)\(/.test(body)) continue;
      // Bulk wrappers: switch and registry first, then only the guarded inner path.
      const flag = body.indexOf("catalogReviewEnabled()");
      const guard = body.search(/requireAction\("catalog\.review\.(transition|view)"\)/);
      const firstRead = body.search(/\.from\(|loadReviewIndex\(|transition\(|waiver\(/);
      expect(flag, name).toBeGreaterThan(-1);
      expect(guard, name).toBeGreaterThan(flag);
      expect(firstRead, name).toBeGreaterThan(guard);
    }
    for (const inner of ["async function transition", "async function waiver"]) {
      const body = ACTIONS.slice(ACTIONS.indexOf(inner));
      expect(body.indexOf("await prepare("), inner).toBeGreaterThan(-1);
      expect(body.indexOf("await prepare("), inner).toBeLessThan(body.indexOf("writeRow("));
    }
  });

  it("never writes the record, its copies, or Koha", () => {
    expect(ACTIONS_CODE).not.toMatch(/from\("catalog_books"\)\s*\.(update|insert|upsert|delete)/);
    // Copies are READ (embedded under the record, for the shelf and copies tasks); never addressed for a write.
    expect(ACTIONS_CODE).not.toMatch(/from\("catalog_copies"\)/);
    expect(ACTIONS_CODE).not.toMatch(/@\/lib\/koha/);
    expect(ACTIONS_CODE).not.toMatch(/is_active/);
    // Every write in the file names the review table.
    const writes = [...ACTIONS_CODE.matchAll(/\.from\("(\w+)"\)\s*\.(insert|update|upsert|delete)/g)].map((m) => m[1]);
    expect(writes.length).toBeGreaterThan(0);
    expect(new Set(writes)).toEqual(new Set(["catalog_review_state"]));
  });

  it("writes by compare-and-set on the version it read, and audits every transition", () => {
    expect(ACTIONS).toMatch(/\.eq\("version", p\.row\.version\)/);
    expect(ACTIONS).toMatch(/changedRow/);
    expect(ACTIONS).toMatch(/logAdminAction\(p\.userId, `catalogReview\.\$\{action\}`/);
    expect(ACTIONS).toMatch(/waive \? "catalogReview\.waive" : "catalogReview\.unwaive"/);
  });

  it("fingerprints the row as stored, never a value the browser sent", () => {
    expect(ACTIONS).toMatch(/reviewFingerprint\(p\.book\)/);
    expect(ACTIONS).not.toMatch(/fingerprint:\s*(input|args|params|formData)/);
  });
});

describe("verification waits on the blocking tasks of the SAVED record", () => {
  it("verify recomputes blocking tasks from the row it read, before planning", () => {
    const body = ACTIONS.slice(ACTIONS.indexOf("async function transition"));
    const gate = body.indexOf("openBlockingTasks(tasks)");
    const plan = body.indexOf("planReviewTransition(");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(plan);
    expect(body).toMatch(/error: "open_tasks"/);
  });
});

describe("bulk and export (Slice 3)", () => {
  it("a server-action module exports only async functions", () => {
    expect(ACTIONS_CODE).not.toMatch(/^export (const|let|var|class) /m);
  });

  it("bulk carries only take and give back — never verify — and every record goes through the guarded transition with its queue", () => {
    const body = ACTIONS.slice(ACTIONS.indexOf("export async function bulkCatalogReview"));
    const fn = body.slice(0, body.indexOf("\n}\n") + 3);
    expect(fn).toMatch(/action !== "claim" && action !== "release"/);
    expect(fn).not.toMatch(/"verify"/);
    expect(fn).toMatch(/requireAction\("catalog\.review\.transition"\)/);
    expect(fn).toMatch(/await transition\(.*\{ expectQueue: queue \}\)/);
    expect(fn).toMatch(/items\.length > BULK_LIMIT/);
    expect(ACTIONS).toMatch(/reviewQueueOf\(p\.book\.language\) !== extra\.expectQueue\) return \{ ok: false, error: "other_language" \}/);
  });

  it("export is read-level, uses the page's own parse/order/filter, and is audited", () => {
    const body = ACTIONS.slice(ACTIONS.indexOf("export async function exportReviewQueue"));
    expect(body).toMatch(/requireAction\("catalog\.review\.view"\)/);
    expect(body).toMatch(/parseReviewQuery\(/);
    expect(body).toMatch(/sortQueue\(index\.items, query\.sort\)\.filter\(\(i\) => matchesReviewQuery\(i, query, userId, now\)\)/);
    expect(body).toMatch(/logAdminAction\(userId, "catalogReview\.export"/);
    expect(ACTION_POLICIES["catalog.review.view"]).toEqual({ kind: "perm", resource: "catalog", level: "read" });
  });
});

describe("provenance (Slice 4) credits a source only on evidence", () => {
  const body = ACTIONS.slice(ACTIONS.indexOf("export async function recordFieldSources"));
  it("a provider is credited only when its cached answer gives exactly the saved value", () => {
    expect(body).toMatch(/from\("isbn_metadata_cache"\)/);
    expect(body).toMatch(/providerValue\(hint\.field, merged\) === value/);
    expect(body).toMatch(/let source: ProvenanceSource = "librarian";/);
  });
  it("a publisher page is credited only when this server fetched that text for this librarian", () => {
    expect(body).toMatch(/recallPublisherFetch\(userId, value\)/);
    const pub = read(`${ADMIN}/publisher-actions.ts`);
    expect(pub).toMatch(/return remembered\(userId, \{ ok: true/);
    expect(pub).not.toMatch(/rememberPublisherFetch\([^)]*ok: false/);
  });
  it("the editor reports sources only after a save succeeded", () => {
    const handler = WIZARD.slice(WIZARD.indexOf("async function handleUpdateBook"));
    const success = handler.indexOf("if (result.success)");
    const record = handler.indexOf("await recordFieldSources(");
    expect(record).toBeGreaterThan(success);
    expect(handler.indexOf("const hints = provenanceHints(formData)")).toBeLessThan(handler.indexOf("await updateWithId(formData)"));
  });
});

describe("possible duplicates (Slice 6) never merge", () => {
  const body = ACTIONS.slice(ACTIONS.indexOf("export async function keepAsSeparateEditions"));
  const fn = body.slice(0, body.search(/^}/m) + 1);
  it("keeping records apart is a per-record waiver of the duplicate task — no record write, no unlisting", () => {
    expect(fn).toMatch(/await waiver\(String\(item\?\.id \?\? ""\), Number\(item\?\.version\), "duplicate", true\)/);
    expect(fn).not.toMatch(/\.from\(/);
    expect(fn).toMatch(/items\.length < 2 \|\| items\.length > 20/);
  });
  it("the view reads the library's one duplicate grouping, not a second one", () => {
    expect(DUPLICATES_PAGE).toMatch(/index\.clusters/);
    const tasks = read("lib/catalogs/review-tasks.ts");
    expect(tasks).toMatch(/findDuplicateGroups\(/);
  });
  it("the view opens at read; keeping apart needs write", () => {
    expect(routePolicy("catalog.review.duplicates")?.requires).toEqual({ kind: "perm", resource: "catalog", level: "read" });
    expect(fn).toMatch(/requireAction\("catalog\.review\.transition"\)/);
  });
});

describe("routes, switch and registry", () => {
  it("both review pages 404 when the switch is off and guard before the service client", () => {
    for (const [name, src] of [["list", LIST_PAGE], ["record", RECORD_PAGE], ["duplicates", DUPLICATES_PAGE]] as const) {
      const flag = src.indexOf("if (!catalogReviewEnabled()) notFound();");
      const guard = src.indexOf("requireRouteAccess(");
      const client = src.indexOf("createServiceClient()");
      expect(flag, name).toBeGreaterThan(-1);
      expect(guard, name).toBeGreaterThan(flag);
      expect(client, name).toBeGreaterThan(guard);
    }
  });

  it("the queue opens at catalog: read; the workspace (it embeds the editor) and every transition need write", () => {
    expect(routePolicy("catalog.review")?.requires).toEqual({ kind: "perm", resource: "catalog", level: "read" });
    expect(routePolicy("catalog.review.record")?.requires).toEqual({ kind: "perm", resource: "catalog", level: "write" });
    expect(routePolicy("catalog.edit")?.requires).toEqual(routePolicy("catalog.review.record")?.requires);
    expect(ACTION_POLICIES["catalog.review.transition"]).toEqual({ kind: "perm", resource: "catalog", level: "write" });
  });

  it("/admin/catalogs reads review state only when the switch is on", () => {
    expect(OVERVIEW).toMatch(/const reviewOn = catalogReviewEnabled\(\);/);
    expect(OVERVIEW).toMatch(/reviewOn && !metaUnavailable \? await loadReviewRows/);
  });

  it("the switch is off in production unless explicitly on, and any other value is off", () => {
    expect(catalogReviewEnabled({ nodeEnv: "production" })).toBe(false);
    expect(catalogReviewEnabled({ flag: "on", nodeEnv: "production" })).toBe(true);
    expect(catalogReviewEnabled({ flag: "ON ", nodeEnv: "production" })).toBe(true);
    expect(catalogReviewEnabled({ flag: "yes", nodeEnv: "production" })).toBe(false);
    expect(catalogReviewEnabled({ flag: "off", nodeEnv: "development" })).toBe(false);
    expect(catalogReviewEnabled({ nodeEnv: "development" })).toBe(true);
  });
});

describe("the workspace reuses the editor and never moves on before the server agrees", () => {
  it("the edit page renders the editor without review mode", () => {
    expect(EDIT_PAGE).not.toMatch(/review=/);
  });

  it("the editor runs the review step only after a successful save, or when nothing changed", () => {
    const handler = WIZARD.slice(WIZARD.indexOf("async function handleUpdateBook"));
    const save = handler.indexOf("await updateWithId(formData)");
    const success = handler.indexOf("if (result.success)");
    const afterSave = handler.indexOf("await review.after(intent, reviewVersion)", success);
    // The save's own provenance write bumps the review row; the step must press with THAT version.
    expect(handler.indexOf("reviewVersion = recorded.version")).toBeGreaterThan(success);
    expect(handler.indexOf("reviewVersion = recorded.version")).toBeLessThan(afterSave);
    expect(save).toBeGreaterThan(-1);
    expect(afterSave).toBeGreaterThan(success);
    // The only other call is the nothing-to-save shortcut, before any save.
    expect(handler.indexOf("if (review && intent !== \"save\" && !dirty)")).toBeLessThan(save);
  });

  it("navigates to the next record only after the review step succeeded", () => {
    const after = WORKSPACE.slice(WORKSPACE.indexOf("async function after"));
    const refusedReturn = after.indexOf("if (refused) return refused;");
    const go = after.indexOf("goNext();");
    expect(refusedReturn).toBeGreaterThan(-1);
    expect(go).toBeGreaterThan(refusedReturn);
  });

  it("the workspace does not import Koha code (the item type is decided on the server)", () => {
    expect(WORKSPACE).not.toMatch(/@\/lib\/koha/);
    expect(RECORD_PAGE).toMatch(/kohaItemTypeFor\(book\.language\)/);
  });
});
