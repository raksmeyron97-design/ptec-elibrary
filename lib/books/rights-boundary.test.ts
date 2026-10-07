// The rights basis is private (0174, SEO audit 2026-10 WI-5). Rights material
// per title must not reach a public route, a sitemap, JSON-LD, an anon query
// or a log, and only the review action may write a basis.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The only files that may name the table. */
const ALLOWED = new Set([
  "app/actions/book-rights.ts",
  "app/(admin)/admin/(protected)/data-quality/rights/page.tsx",
]);

function sourceFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app", "components", "lib", "middleware.ts"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out.split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
}

export function rightsLeaks(file: string, rawSrc: string): string[] {
  const src = strip(rawSrc);
  const out: string[] = [];
  if (/["'`]book_rights["'`]/.test(src) && !ALLOWED.has(file)) out.push(`${file} reads or writes book_rights`);
  if (file === "app/actions/book-rights.ts") {
    // An audit row carries ids and counts only — never the basis or evidence.
    for (const m of src.matchAll(/logAdminAction\(([\s\S]*?)\);/g)) {
      if (/\b(basis|evidence|draftBasis|draft_basis)\b/.test(m[1])) out.push("an audit row carries rights material");
    }
  }
  return out;
}

describe("book_rights is private", () => {
  it("0174 enables RLS and revokes the table from every client role, with no grant back", () => {
    const sql = read("supabase/migrations/0174_book_rights.sql").replace(/--.*$/gm, "").replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain("alter table public.book_rights enable row level security");
    expect(sql).toContain("revoke all on table public.book_rights from public, anon, authenticated");
    expect(sql).not.toMatch(/\bgrant\b/);
    expect(sql).not.toMatch(/create (or replace )?view/);
  });

  it("only the review action and the review page name the table, and no audit row carries a basis", () => {
    const files = sourceFiles();
    expect(files).toContain("app/actions/book-rights.ts");
    const leaks = files.flatMap((f) => rightsLeaks(f, read(f)));
    expect(leaks).toEqual([]);
  });

  it("only the review action writes a basis", () => {
    const writers = sourceFiles().filter((f) => {
      const src = strip(read(f));
      return /from\(["']book_rights["']\)\s*\.(update|upsert|insert)/.test(src.replace(/\s+/g, " "));
    });
    expect(writers).toEqual(["app/actions/book-rights.ts"]);
  });

  describe("negative controls", () => {
    it("a public page that reads the table is caught", () => {
      const fixture = `const { data } = await supabase.from("book_rights").select("basis");`;
      expect(rightsLeaks("app/[locale]/(public)/books/[slug]/page.tsx", fixture)).toHaveLength(1);
    });

    it("an audit row that names the basis is caught", () => {
      const fixture = `await logAdminAction(user.id, "book.rights_confirmed", "book_rights", id, { basis: input.basis });`;
      expect(rightsLeaks("app/actions/book-rights.ts", fixture)).toContain("an audit row carries rights material");
    });
  });
});
