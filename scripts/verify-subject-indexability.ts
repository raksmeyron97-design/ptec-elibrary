// scripts/verify-subject-indexability.ts
//
//   npx tsx scripts/verify-subject-indexability.ts
//   npx tsx scripts/verify-subject-indexability.ts --base https://library.ptec.edu.kh
//   npx tsx scripts/verify-subject-indexability.ts --slug វិធីសាស្ត្របង្រៀនរូបវិទ្យា
//   npx tsx scripts/verify-subject-indexability.ts --json reports/seo/subject-gate.json
//
// READ-ONLY. Fetches the sitemap, the /subjects hub and every subject hub they
// name, and checks that what the site ADVERTISES agrees with what each page
// SAYS. It writes nothing anywhere but the optional --json path, and never
// touches a database.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// The SEO 3.3 depth gate (lib/subjects/indexability.ts) is decided in one
// function, so the sitemap and the page's robots meta cannot disagree — in the
// code. This is the check that they do not disagree in PRODUCTION, where a
// stale ISR entry, a CDN cache or a half-finished deploy can serve one of them
// from a previous build. Before the gate, a hub holding ONE book was
// `index, follow` and in sitemap.xml.
//
// ── Why it asserts RELATIONS, not counts ────────────────────────────────────
//
// The obvious check is "the sitemap carries 19 subject URLs". That number is
// true for exactly as long as nobody publishes a book: the twentieth category
// to reach five resources turns a correct deploy into a red build, and the
// check gets deleted rather than fixed. Every assertion here is instead a
// relation between two things the site says about ITSELF, so it needs no
// fixture, cannot go stale as the collection grows, and still fails the moment
// the gate regresses. Measured against production on 2026-09-13: 6 failures
// before the gate shipped, 0 after.
//
// The one exception is --slug, for spot-checking a hub you already believe is
// suppressed. A suppressed hub is by definition linked from nowhere, so no
// crawl of the site can discover it and no relation can be asserted about it.

// `export {}` at the foot of this file is load-bearing: without it TypeScript
// treats a script with no top-level import as a GLOBAL script, and its consts
// collide with the identically-named ones in verify-production-entities.ts.

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const JSON_OUT = flag("json");
/** A slug you believe is suppressed — asserted noindex AND absent from both lists. */
const SUPPRESSED_SLUG = flag("slug");

type Outcome = "ok" | "warn" | "fail";
type Result = { check: string; outcome: Outcome; detail: string | null };

const results: Result[] = [];
const record = (check: string, outcome: Outcome, detail: string | null = null) => {
  results.push({ check, outcome, detail });
  const label = outcome === "ok" ? "ok  " : outcome === "warn" ? "WARN" : "FAIL";
  console.log(`  ${label}  ${check}`);
  if (detail) console.log(`        ${detail}`);
};

// ── Reading what the site says ───────────────────────────────────────────────

async function text(path: string): Promise<string> {
  const res = await fetch(`${BASE}${encodeURI(path)}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.text();
}

/**
 * The `robots` meta a hub renders, lowercased — or null when it renders none,
 * which for Next means the route-level default and is NOT the same answer as
 * an empty string.
 */
function robotsOf(html: string): string | null {
  const m = html.match(/<meta name="robots" content="([^"]*)"/i);
  return m ? m[1].toLowerCase() : null;
}

/** Subject paths the sitemap advertises, as decoded `/subjects/<slug>` paths. */
function sitemapSubjectPaths(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1].trim();
    if (!loc.startsWith(`${BASE}/subjects/`)) continue;
    out.add(decodeURI(loc.slice(BASE.length)));
  }
  return [...out];
}

/** Subject paths the hub links, as decoded `/subjects/<slug>` paths. */
function hubSubjectPaths(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(\/subjects\/[^"#?]+)"/g)) {
    out.add(decodeURI(m[1]));
  }
  return [...out];
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nSubject indexability — ${BASE}\n`);

  const [sitemapXml, hubHtml] = await Promise.all([text("/sitemap.xml"), text("/subjects")]);
  const advertised = sitemapSubjectPaths(sitemapXml);
  const linked = hubSubjectPaths(hubHtml);

  console.log(`  ${advertised.length} subject URLs in the sitemap, ${linked.length} linked from /subjects\n`);

  // A site with no indexable subject at all is far more likely to be broken
  // than to be correct, and every relation below would pass vacuously.
  if (advertised.length === 0) {
    record("the sitemap advertises at least one subject", "fail", "none — the taxonomy is not being published");
  } else {
    record("the sitemap advertises at least one subject", "ok");
  }

  // Indexable ⊆ browsable, by construction (index ⇒ not suppressed). A URL the
  // sitemap advertises that the hub will not link is an orphan we nominated.
  const orphans = advertised.filter((p) => !linked.includes(p));
  record(
    "every subject in the sitemap is linked from /subjects",
    orphans.length === 0 ? "ok" : "fail",
    orphans.length ? `orphaned: ${orphans.join(", ")}` : null,
  );

  // Fetch each hub once; both loops below read the same responses.
  const pages = new Map<string, string | null>();
  for (const path of [...new Set([...advertised, ...linked])]) {
    try {
      pages.set(path, robotsOf(await text(path)));
    } catch (err) {
      record(`GET ${path}`, "fail", (err as Error).message);
      pages.set(path, null);
    }
  }

  // THE contradiction this gate exists to prevent: a URL submitted for
  // indexing whose page declines to be indexed.
  const contradicting = advertised.filter((p) => (pages.get(p) ?? "").includes("noindex"));
  record(
    "no subject in the sitemap answers noindex",
    contradicting.length === 0 ? "ok" : "fail",
    contradicting.length ? `${contradicting.length}: ${contradicting.join(", ")}` : null,
  );

  // The other half of the same coin. A hub the sitemap omits is below the
  // depth bar, and the page must say so — otherwise it is indexable by any
  // crawler that found it through the hub, which is every crawler.
  const thin = linked.filter((p) => !advertised.includes(p));
  const loud = thin.filter((p) => !(pages.get(p) ?? "").includes("noindex"));
  record(
    `every subject below the bar answers noindex (${thin.length} of them)`,
    loud.length === 0 ? "ok" : "fail",
    loud.length ? `still indexable: ${loud.join(", ")}` : null,
  );

  // `follow` in every case. A thin hub's resources are real and must keep
  // receiving the crawl; what is withdrawn is the claim about the PAGE.
  const nofollowed = [...pages].filter(([, r]) => (r ?? "").includes("nofollow")).map(([p]) => p);
  record(
    "no subject hub is nofollow",
    nofollowed.length === 0 ? "ok" : "fail",
    nofollowed.length ? `link equity stranded at: ${nofollowed.join(", ")}` : null,
  );

  if (SUPPRESSED_SLUG) {
    const path = `/subjects/${SUPPRESSED_SLUG}`;
    let robots: string | null = null;
    let reachable = true;
    try {
      robots = robotsOf(await text(path));
    } catch (err) {
      reachable = false;
      // A suppressed hub is unadvertised, not deleted — it stays a real page
      // for anyone holding the link. A 404 here is a different decision than
      // the one this gate makes, so it is reported rather than passed.
      record(`--slug ${SUPPRESSED_SLUG} is still reachable`, "warn", (err as Error).message);
    }
    if (reachable) {
      record(
        `--slug ${SUPPRESSED_SLUG} answers noindex`,
        (robots ?? "").includes("noindex") ? "ok" : "fail",
        robots === null ? "the page renders no robots meta at all" : `robots: '${robots}'`,
      );
    }
    // Exact comparison, never a substring: វិធីសាស្ត្របង្រៀនរូបវិទ្យា ENDS WITH
    // រូបវិទ្យា, which is a different, legitimately indexable subject. The first
    // run of this check matched the wrong hub and reported a defect that was
    // not there.
    const advertisedIt = advertised.includes(path);
    const linkedIt = linked.includes(path);
    record(
      `--slug ${SUPPRESSED_SLUG} is advertised nowhere`,
      !advertisedIt && !linkedIt ? "ok" : "fail",
      advertisedIt || linkedIt
        ? `${advertisedIt ? "in the sitemap" : ""}${advertisedIt && linkedIt ? " and " : ""}${linkedIt ? "linked from /subjects" : ""}`
        : null,
    );
  }

  const failed = results.filter((r) => r.outcome === "fail").length;
  const warned = results.filter((r) => r.outcome === "warn").length;
  console.log(
    `\n${results.length - failed - warned}/${results.length} passed` +
      (warned ? `, ${warned} warned` : "") +
      (failed ? `, ${failed} FAILED` : ""),
  );

  if (JSON_OUT) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          base: BASE,
          generatedAt: new Date().toISOString(),
          advertised: advertised.length,
          linked: linked.length,
          failed,
          warned,
          results,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Wrote ${JSON_OUT}`);
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(`\nverification could not run: ${(err as Error).message}\n`);
  process.exit(1);
});

export {};
