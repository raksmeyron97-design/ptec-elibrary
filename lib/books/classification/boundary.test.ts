// Type, grade and part are confirmed data (0175, SEO audit 2026-10 WI-6).
// Drafts are private; only the confirm actions write the public columns,
// behind the registry gate; and in Phase 1 no public surface reads them.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ACTION = "app/actions/book-classification.ts";
const PAGE = "app/(admin)/admin/(protected)/data-quality/classification/page.tsx";

function files(...roots: string[]): string[] {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...roots], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return out.split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
}

// Columns only 0175 introduced. `resource_type` is NOT one of them on its own:
// learning_path_steps has had a column of that name since 0111 (book /
// research / catalog / external), so it counts only when read from `books`.
const NEW_COLUMN = /\b(grade_from|grade_to|part_no|classification_status)\b/;
const BOOK_RESOURCE_TYPE = /from\(["'](?:books|books_with_stats)["']\)[\s\S]{0,300}?\bresource_type\b/;

export function classificationViolations(file: string, rawSrc: string): string[] {
  const src = strip(rawSrc);
  const out: string[] = [];
  const isPublic = file.startsWith("app/[locale]/") || file.startsWith("lib/seo/") || file.startsWith("app/sitemap") || file.startsWith("app/api/");
  if (isPublic && (NEW_COLUMN.test(src) || BOOK_RESOURCE_TYPE.test(src))) out.push(`${file} reads a classification column`);
  if (file !== ACTION && file !== PAGE && /["'`]book_classification_drafts["'`]/.test(src)) out.push(`${file} names the drafts table`);
  if (file !== ACTION && /classification_status:\s*["']confirmed["']/.test(src)) out.push(`${file} confirms a classification`);
  return out;
}

describe("classification boundary", () => {
  it("0175 keeps the drafts private", () => {
    const sql = read("supabase/migrations/0175_book_classification.sql").replace(/--.*$/gm, "").replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain("alter table public.book_classification_drafts enable row level security");
    expect(sql).toContain("revoke all on table public.book_classification_drafts from public, anon, authenticated");
    expect(sql).not.toMatch(/\bgrant\b/);
  });

  it("no public surface reads the columns, and only the action confirms", () => {
    const all = files("app", "components", "lib");
    expect(all).toContain(ACTION);
    expect(all.flatMap((f) => classificationViolations(f, read(f)))).toEqual([]);
  });

  it("every writer of the public columns sits behind the registry gate", () => {
    const src = strip(read(ACTION));
    expect(src).toContain('requireAction("books.classification.review")');
    for (const fn of ["confirmBookClassification", "bulkConfirmClassification", "generateClassificationDrafts"]) {
      const body = src.slice(src.indexOf(`export async function ${fn}(`));
      const gate = body.indexOf("await open()");
      const write = body.search(/\.(update|upsert|insert)\(/);
      expect(gate, fn).toBeGreaterThan(-1);
      expect(gate, `${fn} writes before it is gated`).toBeLessThan(write);
    }
  });

  describe("negative controls", () => {
    it("a public page reading grade_from is caught", () => {
      expect(classificationViolations("app/[locale]/(public)/books/[slug]/page.tsx", `select("id, grade_from")`)).toHaveLength(1);
    });
    it("a public page selecting books.resource_type is caught", () => {
      expect(
        classificationViolations("app/[locale]/(public)/books/page.tsx", `supabase.from("books").select("id, slug, resource_type")`),
      ).toHaveLength(1);
    });
    it("a learning-path step's own resource_type is not a classification read", () => {
      expect(classificationViolations("app/[locale]/(public)/paths/x.tsx", `RESOURCE_ICON[step.resource_type]`)).toEqual([]);
    });
    it("a second confirmer is caught", () => {
      expect(
        classificationViolations("app/actions/books.ts", `await supabase.from("books").update({ classification_status: "confirmed" })`),
      ).toEqual(["app/actions/books.ts confirms a classification"]);
    });
  });
});
