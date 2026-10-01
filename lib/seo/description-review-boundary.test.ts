import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const migration = read("supabase/migrations/0164_book_description_review.sql");
const actions = read("app/actions/description-review.ts");
const page = read("app/(admin)/admin/(protected)/data-quality/descriptions/page.tsx");

describe("description drafts are never public (0164)", () => {
  it("live in their own table, RLS on and revoked from anon and authenticated", () => {
    expect(migration).toMatch(/create table if not exists public\.book_description_drafts/);
    expect(migration).toMatch(/alter table public\.book_description_drafts enable row level security/);
    expect(migration).toMatch(/revoke all on public\.book_description_drafts from public, anon, authenticated/);
  });
  it("put no draft text on the anon-readable books table", () => {
    const booksStatements = migration.match(/alter table public\.books\b[^;]*;/g) ?? [];
    expect(booksStatements.length).toBeGreaterThan(0);
    for (const statement of booksStatements) expect(statement).not.toMatch(/draft_(en|km)/);
  });
});

describe("the review queue's gates", () => {
  it("every mutation opens through the one registry action", () => {
    expect(actions).toMatch(/requireAction\("books\.description\.review"\)/);
    const exported = actions.match(/export async function \w+/g) ?? [];
    expect(exported.length).toBe(3);
    for (const fn of ["saveBookDescriptionDraft", "approveBookDescription", "discardBookDescriptionDraft"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      const end = body.indexOf("\nexport async function", 1);
      expect((end > 0 ? body.slice(0, end) : body)).toMatch(/await openMutation\(\)/);
    }
  });
  it("only approval writes the live description", () => {
    expect(actions.match(/\bdescription: /g)?.length).toBe(1);
    const approve = actions.slice(actions.indexOf("export async function approveBookDescription"));
    expect(approve.slice(0, approve.indexOf("export async function discard"))).toMatch(/description: publish\.text/);
  });
  it("approval refuses a draft that still carries a review marker, before it writes", () => {
    const approve = actions.slice(actions.indexOf("export async function approveBookDescription"));
    const refuse = approve.indexOf("carriesReviewMarker(publish.text)");
    expect(refuse).toBeGreaterThan(0);
    expect(refuse).toBeLessThan(approve.indexOf(".update("));
  });
  it("the page declares its route policy", () => {
    expect(page).toMatch(/requireRouteAccess\("books\.descriptions"\)/);
  });
});
