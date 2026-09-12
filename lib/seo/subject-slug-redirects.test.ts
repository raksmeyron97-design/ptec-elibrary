import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SUBJECT_SLUG_REDIRECTS,
  SUBJECT_REDIRECT_STATUS,
  LEGACY_SUBJECT_SLUG,
  subjectSlugRedirectRules,
} from "@/lib/seo/subject-slug-redirects";
import { slugify } from "@/lib/book-utils";

const ROOT = path.join(__dirname, "..", "..");
// Two migrations now carry these pairs: 0142 (the original nine) and 0143
// (the tenth, found on production later). Both are read and unioned — an
// applied migration is immutable, so a newly discovered slug gets a new file
// rather than an edit to one production has already run.
const MIGRATIONS = [
  "supabase/migrations/0142_subject_slug_cleanup.sql",
  "supabase/migrations/0143_subject_slug_cleanup_tenth.sql",
].map((rel) => path.join(ROOT, rel));

describe("subject slug redirects — the table itself", () => {
  it("covers all ten retired slugs", () => {
    expect(SUBJECT_SLUG_REDIRECTS).toHaveLength(10);
  });

  it.each(SUBJECT_SLUG_REDIRECTS.map((r) => [r.from, r]))(
    "%s targets exactly what slugify() mints from the category name",
    (_from, r) => {
      // The target is not a judgement call and not a translation: it is what
      // the app would produce for this category today, which is why the other
      // fourteen categories already read as Khmer. If slugify() ever changes,
      // this fails rather than letting the redirect point somewhere stale.
      expect(slugify(r.name)).toBe(r.to);
    },
  );

  it("retires only generated slugs, and never lands on another one", () => {
    for (const r of SUBJECT_SLUG_REDIRECTS) {
      expect(LEGACY_SUBJECT_SLUG.test(r.from), `${r.from} should be a book-<epoch> slug`).toBe(true);
      expect(LEGACY_SUBJECT_SLUG.test(r.to), `${r.to} must not be another generated slug`).toBe(false);
    }
  });

  it("has no duplicate source or target — categories.slug is UNIQUE", () => {
    const froms = SUBJECT_SLUG_REDIRECTS.map((r) => r.from);
    const tos = SUBJECT_SLUG_REDIRECTS.map((r) => r.to);
    expect(new Set(froms).size).toBe(froms.length);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it("never redirects a slug onto itself", () => {
    for (const r of SUBJECT_SLUG_REDIRECTS) expect(r.to).not.toBe(r.from);
  });

  it("emits no empty target — an empty slug would redirect to the hub", () => {
    for (const r of SUBJECT_SLUG_REDIRECTS) expect(r.to.length).toBeGreaterThan(0);
  });
});

describe("the redirect rules handed to next.config.ts", () => {
  const rules = subjectSlugRedirectRules();

  it("covers both locales for every retired slug", () => {
    expect(rules).toHaveLength(SUBJECT_SLUG_REDIRECTS.length * 2);
    for (const r of SUBJECT_SLUG_REDIRECTS) {
      // Config redirects run BEFORE middleware, so /km has not been stripped
      // yet and must be stated explicitly.
      expect(rules.some((x) => x.source === `/subjects/${r.from}`)).toBe(true);
      expect(rules.some((x) => x.source === `/km/subjects/${r.from}`)).toBe(true);
    }
  });

  it("is a literal 301, not Next's 308 — matching every other retired URL here", () => {
    // `permanent: true` would emit 308. Google treats the two alike, but legacy
    // /theses/<uuid>, the /en strip and retired catalog slugs all answer 301,
    // and a retired subject slug is the same kind of event.
    expect(SUBJECT_REDIRECT_STATUS).toBe(301);
    for (const rule of rules) expect(rule.statusCode).toBe(SUBJECT_REDIRECT_STATUS);
  });

  it("percent-encodes the Khmer destination — a Location header is a URI", () => {
    for (const rule of rules) {
      expect(rule.destination).not.toMatch(/[^\x20-\x7E]/);
      expect(decodeURIComponent(rule.destination)).toMatch(/^(\/km)?\/subjects\/.+/);
    }
  });

  it("keeps each rule inside its own locale", () => {
    for (const rule of rules) {
      const kmSource = rule.source.startsWith("/km/");
      expect(rule.destination.startsWith("/km/")).toBe(kmSource);
    }
  });

  it("never redirects to another retired slug — no chains", () => {
    const retired = new Set(SUBJECT_SLUG_REDIRECTS.map((r) => r.from));
    for (const rule of rules) {
      const slug = decodeURIComponent(rule.destination).replace(/^(\/km)?\/subjects\//, "");
      expect(retired.has(slug), `${rule.source} redirects to a retired slug`).toBe(false);
    }
  });

  it("is actually wired into next.config.ts", () => {
    const cfg = fs
      .readFileSync(path.join(ROOT, "next.config.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
    expect(cfg).toMatch(/async redirects\(\)/);
    expect(cfg).toMatch(/subjectSlugRedirectRules\(\)/);
  });
});

describe("migrations 0142 + 0143 agree with this table", () => {
  // Two definitions of the same ten pairs — one in SQL, one in TypeScript.
  // They must be identical or the DB and the redirects disagree, which is a
  // 301 into a 404. Reproducing slugify() in SQL was rejected for the same
  // reason 0130 refused to reimplement normalizeTitle(): the copies drift.
  const sources = MIGRATIONS.map((file) => ({
    file: path.basename(file),
    sql: fs.readFileSync(file, "utf8"),
  }));

  const pairs = MIGRATIONS.flatMap((file) => {
    const sql = fs.readFileSync(file, "utf8");
    const body = sql.slice(sql.indexOf("select * from (values"), sql.indexOf(") as t("));
    return [...body.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map(
      (m) => ({ from: m[1], to: m[2], name: m[3] }),
    );
  });

  it("parses ten pairs out of the migrations", () => {
    expect(pairs).toHaveLength(10);
  });

  it("matches the TypeScript table exactly, pair for pair", () => {
    const norm = (xs: { from: string; to: string; name: string }[]) =>
      [...xs].map(({ from, to, name }) => ({ from, to, name })).sort((a, b) => a.from.localeCompare(b.from));
    expect(norm(pairs)).toEqual(norm([...SUBJECT_SLUG_REDIRECTS]));
  });

  it("is idempotent and collision-safe by construction", () => {
    // A missing row must no-op (the e2e stack applies this chain to a database
    // that never had these categories), and a taken target must RAISE rather
    // than silently skip — a skipped rename leaves next.config.ts 301ing into
    // a 404.
    // Asserted of EVERY migration in the set, not just the first: a later file
    // that dropped the collision check would still redirect an indexed URL
    // into a 404, and a union-only check would not notice.
    for (const { file, sql } of sources) {
      expect(sql, file).toMatch(/if cat_id is null then/);
      expect(sql, file).toMatch(/raise exception/);
      expect(sql, file).toMatch(/where slug = pair\.new_slug and id <> cat_id/);
    }
  });

  it("keys the update on the old slug, never on the name", () => {
    // Names are editable in the admin panel; the retired slug is the stable
    // identifier and the one Google holds.
    for (const { file, sql } of sources) {
      expect(sql, file).toMatch(/where slug = pair\.old_slug/);
      expect(sql, file).toMatch(
        /update public\.categories set slug = pair\.new_slug where id = cat_id/,
      );
    }
  });
});
