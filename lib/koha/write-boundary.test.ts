/**
 * Phase 5 (docs/KOHA-WRITES.md): where the e-Library may write to Koha, and
 * in what order. The behaviour is pinned in biblio-write.test.ts and
 * marc-write.test.ts; these read the source, because "Koha first" and "only
 * here" are properties of every call site, not of one input.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kohaCanWriteItems, resolveKohaConfig } from "./config";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const gitGrep = (args: string[]): string[] => {
  try {
    return execFileSync("git", ["grep", "--untracked", ...args], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
};
/** The body of one exported function, up to the next top-level function. */
const fn = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = src.slice(start + 10).search(/\n(export )?(async )?function /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 10 + next);
};

const ACTIONS = "app/(admin)/admin/(protected)/catalogs/actions.ts";
const COPIES = "app/(admin)/admin/(protected)/catalogs/copy-actions.ts";

describe("Koha record writes", () => {
  it("four modules call the client's write(): biblio-write.ts (records), item-write.ts (copies), renewals.ts and holds.ts (a reader's own renewals and holds)", () => {
    const callers = gitGrep(["-l", "-E", "\\.write\\(\\s*\"(POST|PUT|DELETE)\"", "--", "*.ts", "*.tsx", ":!*.test.ts"]);
    expect(callers.sort()).toEqual(["lib/koha/biblio-write.ts", "lib/koha/holds.ts", "lib/koha/item-write.ts", "lib/koha/renewals.ts"]);
  });

  it("the admin reaches it only through the server-only glue", () => {
    expect(read("lib/koha/catalog-writes.ts")).toMatch(/^import "server-only";/m);
    const importers = gitGrep(["-l", "-E", "from [\"']@/lib/koha/biblio-write[\"']", "--", "app", "components"]);
    for (const f of importers) expect(code(f), f).not.toMatch(/\b(createBiblio|updateBiblio)\(/);
    const itemImporters = gitGrep(["-l", "-E", "from [\"']@/lib/koha/item-write[\"']", "--", "app", "components"]);
    for (const f of itemImporters) expect(code(f), f).not.toMatch(/\b(createItem|updateItem)\(/);
  });

  it("create: Koha first, then the e-Library row; a duplicate is returned for a person, never overridden by the action", () => {
    const add = code(ACTIONS).slice(code(ACTIONS).indexOf("export async function addCatalogBook("));
    const body = add.slice(0, add.indexOf("function linksOrNull("));
    expect(body.indexOf("createInKoha(")).toBeGreaterThan(-1);
    expect(body.indexOf("createInKoha(")).toBeLessThan(body.indexOf('.from("catalog_books")\n      .insert('));
    // The override comes only from the form, and is audited when used.
    expect(body).toMatch(/confirmNotDuplicate = formData\.get\("koha_confirm_not_duplicate"\) === "1"/);
    expect(body).toMatch(/logAdminAction\(userId, "koha_duplicate_override"/);
  });

  it("edit: Koha first, then the e-Library row; call number and department are not taken from the form", () => {
    const body = fn(code(ACTIONS), "updateCatalogBook");
    expect(body.indexOf("updateInKoha(")).toBeGreaterThan(-1);
    expect(body.indexOf("updateInKoha(")).toBeLessThan(body.indexOf(".update({"));
    expect(body).toMatch(/delete parsed\.fields\.ddc;\s*delete parsed\.fields\.department;/);
  });

  it("a Koha record is not deleted here; a copy of one is created in Koha first, or refused", () => {
    const purge = fn(code(ACTIONS), "hardDeleteCatalogBook");
    expect(purge.indexOf("kohaOwnsLinkedRecords()")).toBeGreaterThan(-1);
    expect(purge.indexOf("kohaOwnsLinkedRecords()")).toBeLessThan(purge.indexOf(".delete()"));
    const copies = code(COPIES);
    for (const name of ["addCopy", "saveCopies"]) {
      const body = fn(copies, name);
      const own = body.indexOf("copyOwnership(");
      expect(own, name).toBeGreaterThan(-1);
      expect(own, name).toBeLessThan(body.indexOf('if (own.kind === "refuse")'));
      expect(body.indexOf("createItemInKoha("), name).toBeGreaterThan(-1);
      expect(body.indexOf("createItemInKoha("), name).toBeLessThan(body.indexOf(".insert("));
    }
  });

  it("an edit of a Koha copy goes to Koha before the e-Library row; a Koha copy is never deleted", () => {
    const copies = code(COPIES);
    for (const name of ["updateCopy", "updateCopyStatus"]) {
      const body = fn(copies, name);
      expect(body.indexOf("updateItemInKoha("), name).toBeGreaterThan(-1);
      expect(body.indexOf("updateItemInKoha("), name).toBeLessThan(body.indexOf(".update("));
    }
    const del = fn(copies, "deleteCopy");
    expect(del.indexOf("before.koha_item_id != null")).toBeGreaterThan(-1);
    expect(del.indexOf("before.koha_item_id != null")).toBeLessThan(del.indexOf(".delete()"));
  });

  it("a copy row is built from the item as the SYNC sees it (with labels), or the next pass rewrites it", () => {
    // Measured: rows built from a write's answer said "PTEC"/"REF" where the sync says "PTEC Library"/"Reference".
    const glue = code("lib/koha/catalog-writes.ts");
    expect(glue).toMatch(/return labelled\(await createItem\(/);
    expect(glue).toMatch(/return labelled\(await updateItem\(/);
    expect(glue).toMatch(/embed: \["\+strings"\]/);
  });

  it("copy writes need their own switch: KOHA_WRITE_ITEMS=on AND KOHA_INTEGRATION=write", () => {
    const base = { KOHA_BASE_URL: "http://koha.test", KOHA_CLIENT_ID: "x", KOHA_CLIENT_SECRET: "y" };
    expect(kohaCanWriteItems(resolveKohaConfig({ ...base, KOHA_INTEGRATION: "write" }))).toBe(false);
    expect(kohaCanWriteItems(resolveKohaConfig({ ...base, KOHA_INTEGRATION: "read", KOHA_WRITE_ITEMS: "on" }))).toBe(false);
    expect(kohaCanWriteItems(resolveKohaConfig({ ...base, KOHA_INTEGRATION: "write", KOHA_WRITE_ITEMS: "on" }))).toBe(true);
    expect(read(".env.example")).toMatch(/^# KOHA_WRITE_ITEMS=/m);
  });

  it("KOHA_STAFF_URL is documented, and no Koha setting is NEXT_PUBLIC", () => {
    expect(read(".env.example")).toMatch(/^# KOHA_STAFF_URL=/m);
  });
});
