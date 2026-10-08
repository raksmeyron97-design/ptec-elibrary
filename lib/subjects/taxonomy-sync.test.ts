// A subject rename must reach the public site and the canonical copy (SEO
// audit 2026-10, WI-2 / F2).
//
//   * the four taxonomy mutations call revalidateTaxonomy() — before this they
//     refreshed only /admin, so a renamed hub kept answering from the cache
//     under its old name until the cache expired;
//   * 0172 keeps `subjects` in step with `categories` on every rename;
//   * the rename control says, at the moment of renaming, that the public URL
//     changes and the old one redirects (0170 records that 301).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ACTIONS = "app/(admin)/admin/(protected)/books/actions.ts";
const MUTATIONS = ["updateCategory", "deleteCategory", "updateDepartment", "deleteDepartment"] as const;

/** The body of `export async function <name>(…) { … }`. */
function functionBody(src: string, name: string): string | null {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return null;
  // The body's brace ends its line; a `{` earlier on the signature line is the
  // return type's (`Promise<{ success?: boolean }>`), not the body's.
  const open = src.indexOf("{\n", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return null;
}

export function taxonomyViolations(rawSrc: string): string[] {
  const src = stripTs(rawSrc);
  const out: string[] = [];
  for (const name of MUTATIONS) {
    const body = functionBody(src, name);
    if (!body) out.push(`${name} not found`);
    else if (!/\brevalidateTaxonomy\(\)/.test(body)) out.push(`${name} does not revalidate the public taxonomy`);
  }
  return out;
}

describe("taxonomy mutations reach the public site", () => {
  const src = read(ACTIONS);

  it("all four call revalidateTaxonomy()", () => {
    expect(taxonomyViolations(src)).toEqual([]);
  });

  it("negative control: removing one call is caught", () => {
    const body = functionBody(src, "deleteDepartment") as string;
    const broken = src.replace(body, body.replace("revalidateTaxonomy();", ""));
    expect(broken).not.toBe(src);
    expect(taxonomyViolations(broken)).toEqual(["deleteDepartment does not revalidate the public taxonomy"]);
  });
});

describe("0172 keeps subjects in step with categories", () => {
  const sql = read("supabase/migrations/0172_subjects_follow_categories.sql")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  it("re-syncs once and then on every rename, through a plain AFTER trigger", () => {
    expect(sql).toMatch(/^ ?set local lock_timeout = '10s';/);
    expect(sql).toContain("update public.subjects s set slug = c.slug, name_en = c.name");
    expect(sql).toContain("create trigger categories_sync_subject after update on public.categories");
    expect(sql).toContain("when (old.name is distinct from new.name or old.slug is distinct from new.slug)");
    expect(sql).not.toMatch(/\bupdate of\b/);
  });

  it("writes nothing but subjects", () => {
    const writes = [...sql.matchAll(/\b(?:update|insert into|delete from)\s+public\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(writes)).toEqual(new Set(["subjects"]));
  });
});

describe("the rename control says the URL changes", () => {
  const modal = read("components/admin/ManageCategoriesModal.tsx");

  it("renders the note and ties it to the rename field", () => {
    expect(modal).toContain('t("renameChangesUrl")');
    expect(modal).toContain("aria-describedby={renameNoteId}");
  });

  it("both catalogues carry it", () => {
    for (const locale of ["en", "km"]) {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      expect(messages.adminEbooks.manage.renameChangesUrl, locale).toMatch(/\S/);
    }
  });
});
