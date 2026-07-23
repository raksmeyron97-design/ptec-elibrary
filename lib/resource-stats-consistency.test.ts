// lib/resource-stats-consistency.test.ts
//
// Guards the single-source-of-truth contract for RESOURCE COUNTS, the way
// lib/settings-consistency.test.ts guards it for organization data.
//
// The failure mode these tests exist to prevent is not a wrong number — it is
// a SECOND PLACE that computes a number. Every observed inconsistency on this
// site ("110+" on the homepage, 116 on /books, "110+115" in the CTA) traced
// back to a surface that ran its own count instead of reading the shared
// service. Those duplicates are gone; these tests fail the moment one returns.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SELF = "lib/resource-stats-consistency.test.ts";

/** Repo-wide regex search over tracked source files (respects .gitignore). */
function grepSource(pattern: string, globs = ["*.ts", "*.tsx"]): string[] {
  try {
    const out = execFileSync("git", ["grep", "-l", "-E", pattern, "--", ...globs], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return []; // git grep exits 1 on no matches
  }
}

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Nobody re-implements the count
// ─────────────────────────────────────────────────────────────────────────────

describe("counting the countable entities happens in exactly one place", () => {
  const COUNTED_TABLES = ["books", "research_reports", "publications", "learning_paths"];

  it.each(COUNTED_TABLES)(
    "no file outside the stats layer runs a published-count over %s",
    (table) => {
      // Matches `.from("<table>").select(... count: "exact" ...)` on one line.
      // `.update(..., { count: "exact" })` is a bulk-write row tally, not a
      // statistic, so the pattern requires a select. Admin
      // status breakdowns are legitimate (they are labelled per status and
      // never public), so the allowlist is explicit rather than heuristic.
      const allowed = [
        SELF,
        "lib/collection-stats.ts",
        "lib/collection-stats.test.ts",
        "lib/admin/resource-stats.ts", // admin status breakdown — labelled, non-public
        "lib/admin/ebooks.ts",
        "lib/admin/theses.ts",
        "lib/admin/posts.ts",
        "lib/admin/sidebar-badges.ts",
        "lib/admin/intelligence.ts",
        "lib/admin/dashboard.ts",
        "lib/books-data.ts", // filtered listing count — a different metric
        "lib/posts-data.ts",
        "lib/exports/works.ts",
        "app/actions/review.ts",
        "app/actions/theses.ts",
        "app/actions/data-quality.ts",
        "app/actions/book-requests.ts",
        "app/(admin)/admin/(protected)/books/actions.ts",
        "app/(admin)/admin/(protected)/publications/page.tsx",
        "app/(admin)/admin/(protected)/catalogs/page.tsx",
      ];
      const offenders = grepSource(
        `from\\("${table}"\\)\\.select\\(.*count: "exact"`,
      ).filter((f) => !allowed.includes(f));
      expect(offenders).toEqual([]);
    },
  );

  it("the auth screens read the shared service, not their own books count", () => {
    for (const file of ["app/(auth)/auth/login/page.tsx", "app/(auth)/auth/signup/page.tsx"]) {
      const src = read(file);
      expect(src).toContain("getCollectionStats");
      // The exact duplicate that used to live here.
      expect(src).not.toMatch(/from\("books"\)[\s\S]{0,80}count: "exact"/);
    }
  });

  it("/llms.txt reads the shared service, not a local countPublished helper", () => {
    const src = read("app/llms.txt/route.ts");
    expect(src).toContain("getCollectionStats");
    expect(src).not.toContain("function countPublished");
  });

  it("get_home_stats() reads the canonical view rather than spelling out the rule", () => {
    const sql = read("supabase/migrations/0103_public_resource_statistics.sql");
    expect(sql).toContain("SELECT digital_resources FROM public.public_resource_statistics");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The rule lives in one place in SQL and one place in TypeScript
// ─────────────────────────────────────────────────────────────────────────────

describe("the digital-resources rule", () => {
  it("is the same three types in the migration and in the service", () => {
    const sql = read("supabase/migrations/0103_public_resource_statistics.sql");
    const ts = read("lib/collection-stats.ts");

    // SQL: digital_resources sums exactly books + research_reports +
    // publications. Slice from the "(" that opens the summed expression to
    // its closing "  ) AS digital_resources", so no neighbouring column
    // definition leaks into the assertion.
    const digitalEnd = sql.indexOf("  ) AS digital_resources");
    const digitalStart = sql.lastIndexOf("\n  (\n", digitalEnd);
    const digitalExpr = sql.slice(digitalStart, digitalEnd);
    expect(digitalStart).toBeGreaterThan(-1);
    expect(digitalExpr).toContain("public.books");
    expect(digitalExpr).toContain("public.research_reports");
    expect(digitalExpr).toContain("public.publications");
    expect(digitalExpr).not.toContain("catalog_books");
    expect(digitalExpr).not.toContain("learning_paths");

    // TypeScript mirror.
    expect(ts).toContain(
      'export const DIGITAL_RESOURCE_KEYS = ["books", "theses", "publications"] as const;',
    );
  });

  it("uses one visibility predicate — is_published (is_active for the physical catalog)", () => {
    const sql = read("supabase/migrations/0103_public_resource_statistics.sql");
    // No page may use a looser or different rule (status = 'published',
    // visibility != 'private', published_at <= now(), ...). is_published IS
    // status = 'published', kept in sync by a trigger.
    expect(sql).not.toMatch(/visibility\s*!?=/);
    expect(sql).not.toMatch(/WHERE\s+status\s*=/i);
    const catalogLine = sql.split("\n").find((l) => l.includes("physical_catalogs"))!;
    expect(catalogLine).toContain("is_active    = true");
  });

  it("counts from base tables only — a join could count a resource twice", () => {
    const sql = read("supabase/migrations/0103_public_resource_statistics.sql");
    const viewBody = sql.slice(
      sql.indexOf("CREATE OR REPLACE VIEW public.public_resource_statistics"),
      sql.indexOf("COMMENT ON VIEW public.public_resource_statistics"),
    );
    expect(viewBody).not.toMatch(/\bjoin\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Security posture of the aggregate
// ─────────────────────────────────────────────────────────────────────────────

describe("the public aggregate exposes numbers and nothing else", () => {
  const sql = () => read("supabase/migrations/0103_public_resource_statistics.sql");

  it("the public view is security_invoker, not security definer", () => {
    const body = sql().slice(
      sql().indexOf("CREATE OR REPLACE VIEW public.public_resource_statistics"),
      sql().indexOf("COMMENT ON VIEW public.public_resource_statistics"),
    );
    expect(body).toContain("WITH (security_invoker = true)");
    expect(body).not.toMatch(/security\s+definer/i);
  });

  it("the admin search-health view is not readable by anon or authenticated", () => {
    expect(sql()).toContain(
      "REVOKE ALL ON public.public_resource_search_health FROM anon, authenticated",
    );
    expect(sql()).not.toMatch(
      /GRANT SELECT ON public\.public_resource_search_health TO (anon|authenticated)/,
    );
  });

  it("get_home_stats keeps its pinned search_path", () => {
    const fn = sql().slice(sql().indexOf("CREATE OR REPLACE FUNCTION public.get_home_stats"));
    expect(fn).toContain("SET search_path = public");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The display defects that started this
// ─────────────────────────────────────────────────────────────────────────────

describe("display defects stay fixed", () => {
  it("no component pairs a rounded figure with an exact one in adjacent spans", () => {
    // `<span aria-hidden>110+</span><span className="sr-only">115</span>` has
    // no separator in the DOM's text content — copy/paste, search snippets and
    // any CSS-less render concatenated it to "110+115".
    const src = read("components/ui/home/SignupCta.tsx");
    expect(src).not.toContain("formatApproximateCount");
    expect(src).not.toMatch(/aria-hidden>\{value\}<\/span>\s*<span className="sr-only">/);
  });

  it("the homepage states the resource count under exactly one label", () => {
    const src = read("components/ui/home/SignupCta.tsx");
    // "N educational resources" in prose PLUS "N Digital resources" in the
    // stat strip read as two different, disagreeing metrics.
    expect(src).not.toContain('t("ctaBody"');
    expect(src).toContain('t("statDigitalResources")');
  });

  it("the retired count-bearing message keys are gone from both locales", () => {
    for (const locale of ["en", "km"]) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        home: Record<string, string>;
      };
      expect(messages.home).not.toHaveProperty("ctaBody");
      expect(messages.home).not.toHaveProperty("ctaStatResources");
    }
  });

  it("no translation string bakes a resource total into its text", () => {
    // Counts are interpolated, never translated: a number inside a message
    // cannot be revalidated and drifts silently.
    for (const locale of ["en", "km"]) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        Record<string, unknown>
      >;
      const offenders: string[] = [];
      for (const [ns, entries] of Object.entries(messages)) {
        if (typeof entries !== "object" || entries === null) continue;
        for (const [key, value] of Object.entries(entries)) {
          if (typeof value !== "string") continue;
          // "N+" as a standalone quantity. "12+4" (the B.Ed. 12+4 programme
          // name) is arithmetic in a proper noun, not a counter, so the
          // trailing digit disqualifies it.
          if (/\b\d{2,}\+(?!\d)/.test(value)) offenders.push(`${locale}.${ns}.${key}`);
        }
      }
      // "30+ Publications" in the About lede is editorial prose about the
      // press imprint, not a library resource counter — allowlisted by name
      // so a NEW baked-in figure still fails.
      expect(offenders.filter((k) => !k.endsWith(".aboutPressTagline"))).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Listing pages never count a loaded array
// ─────────────────────────────────────────────────────────────────────────────

describe("listing totals come from the database, not from the loaded page", () => {
  it.each([
    ["app/[locale]/(public)/books/page.tsx", "books"],
    ["app/[locale]/(public)/theses/page.tsx", "theses"],
    ["app/[locale]/(public)/publications/page.tsx", "publications"],
    ["app/[locale]/(public)/catalogs/page.tsx", "physicalCatalogs"],
    ["app/[locale]/(public)/paths/page.tsx", "learningPaths"],
  ])("%s reads the canonical global total", (file, metric) => {
    const src = read(file);
    expect(src).toContain("getCollectionStats");
    expect(src).toContain(metric);
  });

  it.each([
    "app/[locale]/(public)/books/page.tsx",
    "app/[locale]/(public)/theses/page.tsx",
    "app/[locale]/(public)/publications/page.tsx",
    "app/[locale]/(public)/catalogs/page.tsx",
  ])("%s distinguishes the filtered total from the global one", (file) => {
    expect(read(file)).toContain("chooseCountLabel");
  });

  it("the mobile filter sheet renders the page's label rather than building its own", () => {
    const src = read("components/ui/books/MobileFilterSheet.tsx");
    expect(src).toContain("countLabel");
    expect(src).not.toMatch(/resourcesPlural.*count: total/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. The PWA must not serve an obsolete count
// ─────────────────────────────────────────────────────────────────────────────

describe("service worker cannot preserve a stale resource total", () => {
  it("does not cache the canonical statistics endpoint", () => {
    // The aggregate is read server-side only, so it must never appear in the
    // SW's public-REST allowlist. If it ever did, a StaleWhileRevalidate
    // entry could serve last week's total for up to six hours.
    const policy = read("lib/sw-policy.ts");
    expect(policy).not.toContain("public_resource_statistics");
    expect(policy).not.toContain("public_resource_search_health");
  });

  it("serves page navigations network-first, so counts refresh when online", () => {
    const sw = read("app/sw.ts");
    const navRule = sw.slice(
      sw.indexOf('matcher: ({ request }) => request.mode === "navigate"'),
      sw.indexOf("// ── 4."),
    );
    expect(navRule).toContain("new NetworkFirst(");
    expect(navRule).not.toContain("CacheFirst");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Every mutation that can move a count busts the stats cache
// ─────────────────────────────────────────────────────────────────────────────

describe("cache invalidation covers every counted entity", () => {
  it.each([
    "revalidateBook",
    "revalidateThesis",
    "revalidatePublication",
    "revalidateCatalogBook",
    "revalidateLearningPath",
  ])("%s calls revalidateCollectionStats", (helper) => {
    const src = read("lib/cache/revalidate.ts");
    const body = src.slice(src.indexOf(`export function ${helper}`));
    const end = body.indexOf("\n}\n");
    expect(body.slice(0, end)).toContain("revalidateCollectionStats()");
  });

  it("revalidateCollectionStats busts the tag AND the homepage in both locales", () => {
    const src = read("lib/cache/revalidate.ts");
    const body = src.slice(src.indexOf("export function revalidateCollectionStats"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn).toContain('revalidateTag(TAGS.collectionStats, "max")');
    // revalidatePath("/") is a no-op for these routes — see the note at the
    // top of lib/cache/revalidate.ts.
    expect(fn).toContain('revalidatePublicPath("/")');
  });
});
