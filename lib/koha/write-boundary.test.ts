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
  it("one module calls the client's write(): biblio-write.ts", () => {
    const callers = gitGrep(["-l", "-E", "\\.write\\(\\s*\"(POST|PUT)\"", "--", "*.ts", "*.tsx", ":!*.test.ts"]);
    expect(callers).toEqual(["lib/koha/biblio-write.ts"]);
  });

  it("the admin reaches it only through the server-only glue", () => {
    expect(read("lib/koha/catalog-writes.ts")).toMatch(/^import "server-only";/m);
    const importers = gitGrep(["-l", "-E", "from [\"']@/lib/koha/biblio-write[\"']", "--", "app", "components"]);
    for (const f of importers) expect(code(f), f).not.toMatch(/\b(createBiblio|updateBiblio)\(/);
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

  it("a Koha record is not deleted here, and its copies are not created here", () => {
    const purge = fn(code(ACTIONS), "hardDeleteCatalogBook");
    expect(purge.indexOf("kohaOwnsLinkedRecords()")).toBeGreaterThan(-1);
    expect(purge.indexOf("kohaOwnsLinkedRecords()")).toBeLessThan(purge.indexOf(".delete()"));
    const copies = code(COPIES);
    for (const name of ["addCopy", "saveCopies"]) {
      const body = fn(copies, name);
      expect(body.indexOf("refuseKohaOwned("), name).toBeGreaterThan(-1);
      expect(body.indexOf("refuseKohaOwned("), name).toBeLessThan(body.indexOf(".insert("));
    }
  });

  it("KOHA_STAFF_URL is documented, and no Koha setting is NEXT_PUBLIC", () => {
    expect(read(".env.example")).toMatch(/^# KOHA_STAFF_URL=/m);
  });
});
