/**
 * The committee is a RELATIONSHIP, and this is the source scan that keeps it
 * one.
 *
 * The invariant every assertion here serves: `team_members` is the only place
 * a person exists. Everything the Library Committee adds must be a fact about
 * the COMMITTEE, and no committee operation may create, edit or delete a
 * person. That is easy to state, easy to agree with, and — as this repository
 * has learned elsewhere — easy to undo with one convenient column or one
 * cascade pointing the wrong way. So it is checked against the files rather
 * than trusted.
 *
 * A source scan, in this repo's tradition: a committee action that grew a
 * `team_members` write would be valid TypeScript, would pass a build, and
 * would only show up as a librarian's profile disappearing.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const MIGRATION = "supabase/migrations/0150_library_committee.sql";
const ACTIONS = "app/(admin)/admin/(protected)/team/committee/actions.ts";
const DATA = "lib/committee/data.ts";
const TEAM_ACTIONS = "app/(admin)/admin/(protected)/team/actions.ts";

/** Assertions about what SQL does must not trip over what it explains. */
const stripSqlComments = (sql: string) => sql.replace(/^\s*--.*$/gm, "");

const migration = () => stripSqlComments(read(MIGRATION));

// ── The schema ──────────────────────────────────────────────────────────────

describe("migration 0150 models a relationship, not a second people table", () => {
  const sql = migration();

  it("creates exactly the two committee tables", () => {
    expect(sql).toMatch(/create table if not exists public\.committee_sections/);
    expect(sql).toMatch(/create table if not exists public\.committee_members/);
  });

  it("stores no copy of a person's identity", () => {
    // The whole failure mode in one test: a `name_km` or a `photo_url` on
    // `committee_members` means the same human is entered twice and can
    // disagree with themselves between /about/team and /about/committee.
    const seatTable = sql.slice(
      sql.indexOf("create table if not exists public.committee_members"),
      sql.indexOf("comment on table public.committee_members"),
    );
    for (const column of [
      "name_km",
      "name_en",
      "photo_url",
      "photo_alt",
      "education",
      "slug",
      "user_id",
      "bio_km",
      "bio_en",
      "phone",
    ]) {
      expect(seatTable, `committee_members must not carry ${column}`).not.toMatch(
        new RegExp(`\\b${column}\\b`),
      );
    }
  });

  it("points the cascade at the person, so a seat can never delete one", () => {
    expect(sql).toMatch(
      /team_member_id\s+uuid not null\s*\n?\s*references public\.team_members\(id\) on delete cascade/,
    );
  });

  it("lets a deleted section leave its seats standing", () => {
    // ON DELETE SET NULL, not CASCADE: deleting a grouping must not remove
    // people from the committee.
    expect(sql).toMatch(
      /committee_section_id\s+uuid\s*\n?\s*references public\.committee_sections\(id\) on delete set null/,
    );
  });

  it("allows one seat per person, and says so with a single-column unique index", () => {
    // Deliberately NOT unique(team_member_id, committee_section_id): the
    // section is nullable, NULLs never collide, and two unsectioned seats for
    // one person would both be accepted — the reader would meet them twice.
    expect(sql).toMatch(
      /create unique index if not exists committee_members_team_member_key\s*\n?\s*on public\.committee_members \(team_member_id\)/,
    );
    expect(sql).not.toMatch(/unique[\s\S]{0,60}\(team_member_id,\s*committee_section_id\)/);
  });

  it("constrains the layout variant to the two the page can draw", () => {
    expect(sql).toMatch(/check \(layout_variant in \('leadership', 'grid'\)\)/);
  });

  it("publishes a seat only on purpose", () => {
    // team_members.is_published defaults to true; a committee seat does not.
    expect(sql).toMatch(/is_published\s+boolean not null default false/);
  });

  it("touches neither team table", () => {
    for (const forbidden of [
      /alter table public\.team_members/,
      /alter table public\.team_sections/,
      /drop table[\s\S]{0,40}team_members/,
      /delete from public\.team_members/,
      /update public\.team_members/,
    ]) {
      expect(sql, `0150 must not modify the team tables (${forbidden})`).not.toMatch(forbidden);
    }
  });

  it("keeps both tables off the Data API", () => {
    // CLAUDE.md's rule for a new public-schema table: RLS *and* an explicit
    // revoke, because PostgREST auto-exposes every table on this project.
    for (const table of ["committee_sections", "committee_members"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} +enable row level security`));
      expect(sql).toMatch(
        new RegExp(`revoke all on public\\.${table} +from public, anon, authenticated`),
      );
    }
  });
});

// ── The public read model ───────────────────────────────────────────────────

describe("committee_members_public exposes a committee, not a personnel file", () => {
  const sql = migration();
  const view = sql.slice(
    sql.indexOf("create view public.committee_members_public"),
    sql.indexOf("comment on view public.committee_members_public"),
  );

  it("was found", () => {
    expect(view.length).toBeGreaterThan(200);
  });

  it("carries no contact detail, account link or full biography", () => {
    for (const column of ["phone", "email", "user_id", "bio_km", "bio_en", "years_experience"]) {
      expect(view, `the public view must not select ${column}`).not.toMatch(
        new RegExp(`\\b${column}\\b`),
      );
    }
  });

  it("publishes a profile slug only for someone published on /about/team", () => {
    // Otherwise the committee page advertises a URL the middleware slug gate
    // answers with a 404 — the page cannot be relied on to remember, so the
    // view withholds the slug instead.
    expect(view).toMatch(/case when tm\.is_published then tm\.slug end as slug/);
  });

  it("bakes in both publish rules rather than leaving them to a caller", () => {
    expect(view).toMatch(/where cm\.is_published = true/);
    expect(view).toMatch(/cm\.committee_section_id is null or cs\.is_active/);
  });

  it("reads the person from team_members instead of copying them", () => {
    expect(view).toMatch(/join public\.team_members\s+tm on tm\.id = cm\.team_member_id/);
  });

  it("is not granted to anon or authenticated", () => {
    // The page renders server-side through the service client, like
    // /about/team. Granting the view to anon would widen the surface for no
    // caller that exists.
    expect(sql).toMatch(
      /revoke all on public\.committee_members_public from public, anon, authenticated/,
    );
    expect(sql).toMatch(/grant select on public\.committee_members_public to service_role/);
  });
});

// ── The mutations ───────────────────────────────────────────────────────────

describe("no committee mutation can reach a person", () => {
  const source = read(ACTIONS);

  it("never writes to team_members or team_sections", () => {
    // Read-only lookups are allowed (`.select("id")` to verify a reference);
    // an insert, update or delete is not.
    for (const verb of ["insert", "update", "delete", "upsert"]) {
      expect(
        source,
        `committee actions must not ${verb} team_members`,
      ).not.toMatch(new RegExp(`from\\("team_members"\\)[\\s\\S]{0,80}\\.${verb}\\(`));
      expect(
        source,
        `committee actions must not ${verb} team_sections`,
      ).not.toMatch(new RegExp(`from\\("team_sections"\\)[\\s\\S]{0,80}\\.${verb}\\(`));
    }
  });

  it("removes the seat and only the seat", () => {
    const fn = source.slice(
      source.indexOf("export async function removeCommitteeMember"),
      source.indexOf("export async function toggleCommitteeMemberPublished"),
    );
    expect(fn).toContain('from("committee_members").delete()');
    expect(fn).not.toContain("team_members");
    // The audit row states the invariant in words, for whoever reads the log.
    expect(fn).toContain("team_member_deleted: false");
  });

  it("verifies every id it is handed before it writes it", () => {
    expect(source).toMatch(/async function requireTeamMember/);
    expect(source).toMatch(/async function validateSectionId/);
    expect(source).toContain("await requireTeamMember(");
    expect(source).toContain("await validateSectionId(");
  });

  it("guards every exported mutation with a registry policy", () => {
    const exported = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    expect(exported.length).toBeGreaterThan(8);
    for (const name of exported) {
      const start = source.indexOf(`export async function ${name}(`);
      const next = source.indexOf("export async function ", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      expect(body, `${name} has no requireAction()`).toMatch(
        /requireAction\("team\.committee\.(manage|sections)"\)/,
      );
    }
  });

  it("guards before it opens a service-role client, in every action", () => {
    /* The service client bypasses RLS, so nothing may construct one on a path
       that has not established who is asking.

       Checked per FUNCTION rather than per file, which is the difference
       between an invariant and a formatting rule: the two reference-checking
       helpers at the top of this file also open a client, and they are called
       only from inside actions that have already run their guard. A
       whole-file position test failed on them while proving nothing about the
       actions themselves. */
    const exported = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    for (const name of exported) {
      const start = source.indexOf(`export async function ${name}(`);
      const next = source.indexOf("export async function ", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      const clientAt = body.indexOf("createServiceClient()");
      if (clientAt === -1) continue;
      const guardAt = body.indexOf("requireAction(");
      expect(guardAt, `${name}: no guard`).toBeGreaterThanOrEqual(0);
      expect(guardAt, `${name}: service client precedes the guard`).toBeLessThan(clientAt);
    }
  });

  it("asks what each update and delete actually changed", () => {
    // PostgREST answers a predicate that matched nothing exactly like a
    // successful write, so a seat someone else removed would otherwise be
    // reported as saved.
    expect(source).toContain("changedRow(");
    expect(source).toMatch(/\.update\([\s\S]{0,200}\.select\("id"\)/);
  });

  it("writes an audit row for every committee event", () => {
    for (const event of [
      "committee_member.create",
      "committee_member.update",
      "committee_member.remove",
      "committee_member.publish",
      "committee_member.unpublish",
      "committee_member.reorder",
      "committee_section.create",
      "committee_section.update",
      "committee_section.delete",
    ]) {
      expect(source, `no audit row for ${event}`).toContain(`"${event}"`);
    }
  });

  it("invalidates both locales of the public page on every change", () => {
    // revalidatePath("/about/committee") alone is a no-op: public routes live
    // under /[locale], so the helper is the locale-aware one.
    expect(source).toContain(
      'import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate"',
    );
    expect(source).toContain('revalidatePath("/about/committee")');
  });
});

describe("a team edit refreshes the committee page too", () => {
  it("team actions revalidate /about/committee", () => {
    // The committee renders the same people: name, portrait, position and the
    // profile link all come from `team_members`, so a staff correction that
    // invalidated only /about/team would leave the two pages disagreeing.
    const source = read(TEAM_ACTIONS);
    expect(source).toContain('revalidatePath("/about/committee")');
  });
});

// ── The read ────────────────────────────────────────────────────────────────

describe("a failed read is not an empty committee", () => {
  const source = read(DATA);

  it("reports `unavailable` rather than zero members", () => {
    expect(source).toContain("unavailable: true");
    expect(source).toMatch(/MISSING_RELATION/);
  });

  it("treats a missing relation as 'not set up yet', not as an outage", () => {
    expect(source).toMatch(/42P01/);
    expect(source).toMatch(/MISSING_RELATION\.has\(error\.code \?\? ""\)[\s\S]{0,80}unavailable: false/);
  });

  it("reads the privacy-enforcing view, never the base tables", () => {
    expect(source).toContain('from("committee_members_public")');
    expect(source).not.toContain('from("committee_members")');
    expect(source).not.toContain('from("team_members")');
  });
});
