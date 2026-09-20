// scripts/verify-open-graph.ts
//
//   npx tsx scripts/verify-open-graph.ts
//   npx tsx scripts/verify-open-graph.ts --base https://library.ptec.edu.kh
//   npx tsx scripts/verify-open-graph.ts --images          # also HEAD every og:image
//   npx tsx scripts/verify-open-graph.ts --json reports/seo/open-graph.json
//   npx tsx scripts/verify-open-graph.ts --strict          # a manual audit
//
// READ-ONLY. Fetches one live URL per public route TYPE (discovered from the
// production sitemap, so it needs no fixture and cannot go stale as the
// collection grows), parses the Open Graph tags out of the served HTML, and
// checks them against the contract in lib/seo/open-graph.ts.
//
// ── Why a production check and not only a unit test ──────────────────────────
//
// Every defect this was written after was invisible to a unit test, because
// each was an ABSENCE rather than a wrong value. Next replaces `openGraph`
// instead of deep-merging it, so a page that hand-wrote the object silently
// dropped whatever it did not repeat and nothing errored anywhere. Measured on
// production 2026-09-20, before the fix:
//
//   /authors/<slug>          no og:image at all when the person has no
//                            portrait, and no og:locale or og:locale:alternate
//   /journals/<j>/issues     no og:locale, no og:locale:alternate
//   /about/team, /about/rules, /about/timings, /about/collection,
//   /about/our-journey, /about/team/<slug>   no og:locale:alternate
//   /                        twitter:card = summary over a 1200x630 card
//   every og-default.png     no og:image:alt anywhere
//
// The unit tests now pin all of it offline. This is the check that the DEPLOY
// carries it — an ISR entry, a CDN object or a half-rolled deploy can still
// serve a page from a previous build.
//
// ── Fault vocabulary ─────────────────────────────────────────────────────────
//
// lib/verify/http.ts, unchanged: `fail` means the origin answered and the
// answer breaks the rule; `unknown` means no answer was obtained and is never
// counted as either a pass or a defect. An incomplete run exits 0 with a
// banner unless --strict.

import {
  errorOutcome,
  exitCodeFor,
  fetchText,
  fetchWithRetry,
  incompleteBanner,
  summaryLine,
  tally,
  type Outcome,
} from "../lib/verify/http";

// `export {}` at the foot of this file is load-bearing: without it TypeScript
// treats a script with no top-level import as a GLOBAL script, and its consts
// collide with the identically-named ones in the sibling verifiers.

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const JSON_OUT = flag("json");
const CHECK_IMAGES = argv.includes("--images");
const STRICT = argv.includes("--strict");

type Result = { check: string; outcome: Outcome; detail: string | null };
const results: Result[] = [];
const record = (check: string, outcome: Outcome, detail: string | null = null) => {
  results.push({ check, outcome, detail });
  const label = outcome === "ok" ? "ok  " : outcome === "warn" ? "WARN" : outcome === "unknown" ? "????" : "FAIL";
  console.log(`  ${label}  ${check}`);
  if (detail) console.log(`        ${detail}`);
};

// ── Reading what the page says ───────────────────────────────────────────────

/** Decode the handful of entities Next escapes into a meta content attribute. */
function decode(s: string): string {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Every value declared for `property` (og:locale:alternate can repeat). */
function ogAll(html: string, property: string): string[] {
  const re = new RegExp(
    `<meta[^>]+property="${property.replace(/[:.]/g, "\\$&")}"[^>]+content="([^"]*)"`,
    "gi",
  );
  return [...html.matchAll(re)].map((m) => decode(m[1]));
}

const og = (html: string, property: string): string | null => ogAll(html, property)[0] ?? null;

function meta(html: string, name: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`, "i"));
  return m ? decode(m[1]) : null;
}

function canonicalOf(html: string): string | null {
  const m = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i);
  return m ? decode(m[1]) : null;
}

const OG_LOCALES = ["en_US", "km_KH"];

export type OgSnapshot = {
  url: string;
  canonical: string | null;
  title: string | null;
  description: string | null;
  type: string | null;
  ogUrl: string | null;
  image: string | null;
  imageAlt: string | null;
  imageWidth: string | null;
  imageHeight: string | null;
  siteName: string | null;
  locale: string | null;
  alternateLocale: string[];
  twitterCard: string | null;
  robots: string | null;
};

function snapshot(url: string, html: string): OgSnapshot {
  return {
    url,
    canonical: canonicalOf(html),
    title: og(html, "og:title"),
    description: og(html, "og:description"),
    type: og(html, "og:type"),
    ogUrl: og(html, "og:url"),
    image: og(html, "og:image"),
    imageAlt: og(html, "og:image:alt"),
    imageWidth: og(html, "og:image:width"),
    imageHeight: og(html, "og:image:height"),
    siteName: og(html, "og:site_name"),
    locale: og(html, "og:locale"),
    alternateLocale: ogAll(html, "og:locale:alternate"),
    twitterCard: meta(html, "twitter:card"),
    robots: meta(html, "robots"),
  };
}

// ── The contract, asserted against a live page ───────────────────────────────

/**
 * `indexable` decides the SEVERITY, not the rule.
 *
 * A noindex page (an internal search, a composite author disambiguation page,
 * an empty journal) is still shareable, so a missing tag there is real — but it
 * is not the defect this gate exists to catch, and failing a deploy for it is
 * how a red stops being read. The contract applies to every page; only an
 * INDEXABLE page's breach fails.
 */
function checkContract(label: string, s: OgSnapshot): void {
  const indexable = !(s.robots ?? "").includes("noindex");
  const bad: Outcome = indexable ? "fail" : "warn";
  const suffix = indexable ? "" : " (noindex page — reported, not failed)";

  const required: [string, string | null][] = [
    ["og:title", s.title],
    ["og:type", s.type],
    ["og:url", s.ogUrl],
    ["og:image", s.image],
    ["og:image:alt", s.imageAlt],
    ["og:site_name", s.siteName],
    ["og:locale", s.locale],
  ];
  const missing = required.filter(([, v]) => !v || !v.trim()).map(([k]) => k);
  if (s.alternateLocale.length === 0) missing.push("og:locale:alternate");

  if (missing.length > 0) {
    record(`${label} — required OG fields${suffix}`, bad, `missing: ${missing.join(", ")}`);
  } else {
    record(`${label} — required OG fields`, "ok");
  }

  // og:url must BE the canonical, not merely resemble it. Two URLs for one
  // page split its social identity from its search identity.
  if (s.ogUrl && s.canonical) {
    if (s.ogUrl === s.canonical) {
      record(`${label} — og:url === canonical`, "ok");
    } else {
      record(`${label} — og:url === canonical`, bad, `og:url ${s.ogUrl} vs canonical ${s.canonical}`);
    }
  } else {
    record(`${label} — og:url === canonical`, bad, "one of the two is absent");
  }

  // Locale reciprocity. The alternate must be the OTHER published locale, and
  // the pair must be drawn from the two this site publishes.
  if (s.locale && !OG_LOCALES.includes(s.locale)) {
    record(`${label} — og:locale vocabulary`, bad, `${s.locale} is not one of ${OG_LOCALES.join(", ")}`);
  } else if (s.locale && s.alternateLocale.length > 0) {
    const expected = s.locale === "km_KH" ? "en_US" : "km_KH";
    if (s.alternateLocale.includes(expected) && !s.alternateLocale.includes(s.locale)) {
      record(`${label} — og:locale:alternate is reciprocal`, "ok");
    } else {
      record(
        `${label} — og:locale:alternate is reciprocal`,
        bad,
        `og:locale ${s.locale}, alternate [${s.alternateLocale.join(", ")}], expected ${expected}`,
      );
    }
  }

  // A Khmer URL must say so. This catches a whole class of locale bugs one
  // level up from the tags: a /km page served from the English render.
  const isKm = new URL(s.url).pathname.startsWith("/km");
  if (s.locale) {
    const want = isKm ? "km_KH" : "en_US";
    if (s.locale === want) record(`${label} — og:locale matches the URL's locale`, "ok");
    else record(`${label} — og:locale matches the URL's locale`, bad, `${s.url} served og:locale ${s.locale}`);
  }

  // Crawler safety (§13): absolute, https, on a host a crawler can reach
  // without a session. Never a localhost or a preview origin.
  if (s.image) {
    const issues: string[] = [];
    let parsed: URL | null = null;
    try {
      parsed = new URL(s.image);
    } catch {
      issues.push("not an absolute URL");
    }
    if (parsed) {
      if (parsed.protocol !== "https:") issues.push(`scheme ${parsed.protocol}`);
      if (/^(localhost|127\.|0\.0\.0\.0|\[?::1)/i.test(parsed.hostname)) issues.push("loopback host");
      if (/\.vercel\.app$/i.test(parsed.hostname)) issues.push("preview host");
      // The tunnel's FALLBACK hostname, which middleware 308s to the canonical
      // host. An og:image there is a redirect a crawler may not follow.
      if (/^library\.storage-ptec\.online$/i.test(parsed.hostname)) issues.push("tunnel fallback host");
    }
    record(
      `${label} — og:image is crawler-safe`,
      issues.length ? bad : "ok",
      issues.length ? `${s.image} — ${issues.join(", ")}` : null,
    );
  }

  // Declared dimensions must be declared TOGETHER or not at all; a lone
  // width is a hint a crawler cannot use.
  if ((s.imageWidth && !s.imageHeight) || (s.imageHeight && !s.imageWidth)) {
    record(`${label} — og:image dimensions`, bad, "one of width/height declared without the other");
  }

  if (s.twitterCard && !["summary", "summary_large_image", "player", "app"].includes(s.twitterCard)) {
    record(`${label} — twitter:card vocabulary`, "warn", s.twitterCard);
  }

  // The SHARED card is 1200 x 630 and this repository controls it, so a page
  // serving it under `twitter:card = summary` is knowably cropping a landscape
  // image to a small square. That is what / and /km shipped, because the
  // homepage declared `twitter: { title, description }` with no `card` and
  // `twitter` is replaced wholesale exactly like `openGraph`.
  //
  // A warn, not a fail: `summary` over a PORTRAIT (an author, a team member)
  // is a real editorial choice, and this only fires on the card whose shape is
  // known.
  if (s.image?.includes("/og-default.") && s.twitterCard === "summary") {
    record(
      `${label} — twitter:card suits the image`,
      "warn",
      "summary crops the shared 1200x630 card to a square; summary_large_image fits it",
    );
  }
}

/** HEAD the image and confirm a crawler actually gets image bytes. */
async function checkImageFetchable(label: string, url: string): Promise<void> {
  try {
    const res = await fetchWithRetry(url, { method: "GET", timeoutMs: 20_000 });
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) {
      record(`${label} — og:image serves image bytes`, "ok", `${res.status} ${type}`);
    } else {
      record(`${label} — og:image serves image bytes`, "fail", `${res.status} ${type || "no content-type"}`);
    }
  } catch (err) {
    record(`${label} — og:image serves image bytes`, ...errorOutcome(err));
  }
}

// ── Route discovery ──────────────────────────────────────────────────────────

/**
 * One live URL per public route TYPE, taken from the production sitemap.
 *
 * Deliberately not a hard-coded fixture list: slugs change, records are
 * unpublished, and a verifier that fails because a book was retitled is one
 * people learn to ignore. The SHAPES are fixed; the examples are whatever the
 * site currently advertises.
 */
const ROUTE_SHAPES: { label: string; re: RegExp; take?: number }[] = [
  { label: "home (en)", re: /^\/$/ },
  { label: "books listing", re: /^\/books$/ },
  { label: "book detail", re: /^\/books\/[^/]+$/ },
  { label: "theses listing", re: /^\/theses$/ },
  { label: "thesis detail", re: /^\/theses\/[^/]+$/ },
  { label: "subjects hub", re: /^\/subjects$/ },
  { label: "subject detail", re: /^\/subjects\/[^/]+$/ },
  { label: "authors hub", re: /^\/authors$/ },
  { label: "author detail", re: /^\/authors\/[^/]+$/, take: 3 },
  { label: "paths listing", re: /^\/paths$/ },
  { label: "path detail", re: /^\/paths\/[^/]+$/ },
  { label: "journals listing", re: /^\/journals$/ },
  { label: "journal detail", re: /^\/journals\/(?!articles)[^/]+$/ },
  { label: "journal issues", re: /^\/journals\/[^/]+\/issues$/ },
  { label: "journal issue", re: /^\/journals\/[^/]+\/issues\/[^/]+$/ },
  { label: "journal article", re: /^\/journals\/articles\/[^/]+$/ },
  { label: "posts listing", re: /^\/posts$/ },
  { label: "post detail", re: /^\/posts\/[^/]+$/ },
  { label: "catalogs listing", re: /^\/catalogs$/ },
  { label: "catalog detail", re: /^\/catalogs\/[^/]+$/ },
  { label: "about", re: /^\/about$/ },
  { label: "about/team", re: /^\/about\/team$/ },
  { label: "team member", re: /^\/about\/team\/[^/]+$/ },
  { label: "about/committee", re: /^\/about\/committee$/ },
  { label: "about/rules", re: /^\/about\/rules$/ },
  { label: "about/timings", re: /^\/about\/timings$/ },
  { label: "about/collection", re: /^\/about\/collection$/ },
  { label: "about/our-journey", re: /^\/about\/our-journey$/ },
  { label: "contact", re: /^\/contact$/ },
  { label: "policy", re: /^\/policy$/ },
  { label: "privacy", re: /^\/privacy$/ },
];

/** Khmer counterparts — the locale half of the contract needs both sides. */
const KM_SHAPES = ["home (en)", "books listing", "book detail", "subject detail", "author detail", "about/team"];

async function run(): Promise<void> {
  console.log(`\nOpen Graph contract — ${BASE}\n`);

  const xml = await fetchText(`${BASE}/sitemap.xml`);
  // Paths, never origins. A local production build emits the CANONICAL origin
  // in its sitemap (SITE_URL is a build-time constant), so filtering on
  // `startsWith(BASE)` would drop every URL when --base is a localhost build —
  // and a verifier that silently samples nothing reports "0 failed".
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => decode(m[1]))
    .map((u) => {
      try {
        return new URL(u).pathname;
      } catch {
        return u.startsWith("/") ? u : null;
      }
    })
    .filter((p): p is string => p !== null)
    .map((p) => (p === "" ? "/" : p));

  if (paths.length === 0) {
    record("the sitemap advertises at least one URL", "fail", "none — nothing could be sampled");
  } else {
    record(`the sitemap advertises ${paths.length} URLs`, "ok");
  }

  const samples: { label: string; path: string }[] = [];
  const unmatched: string[] = [];
  for (const shape of ROUTE_SHAPES) {
    const hits = paths.filter((p) => shape.re.test(decodeURI(p)) || shape.re.test(p));
    if (hits.length === 0) {
      unmatched.push(shape.label);
      continue;
    }
    for (const p of hits.slice(0, shape.take ?? 1)) samples.push({ label: shape.label, path: p });
    if (KM_SHAPES.includes(shape.label)) {
      const p = hits[0];
      samples.push({ label: `${shape.label} [km]`, path: p === "/" ? "/km" : `/km${p}` });
    }
  }

  // A shape the sitemap does not carry is NOT a pass. It is a route type this
  // run did not verify, and saying so is the whole point of the vocabulary.
  for (const label of unmatched) {
    record(`${label} — sampled from the sitemap`, "unknown", "no URL of this shape is advertised");
  }

  console.log(`\nSampling ${samples.length} live URLs across ${ROUTE_SHAPES.length} route shapes.\n`);

  const snapshots: OgSnapshot[] = [];
  for (const { label, path } of samples) {
    // NO encodeURI here. A sitemap <loc> is already percent-encoded and
    // URL.pathname keeps it that way, so encoding again turns %E1 into %25E1
    // and every Khmer slug 404s — which this verifier would then report as
    // cataloguing drift (`warn`) rather than as its own bug.
    const url = `${BASE}${path}`;
    let html: string;
    try {
      html = await fetchText(url);
    } catch (err) {
      record(`${label} — GET ${path}`, ...errorOutcome(err));
      continue;
    }
    const s = snapshot(url, html);
    snapshots.push(s);
    checkContract(label, s);
  }

  if (CHECK_IMAGES) {
    console.log("\nFetching every distinct og:image...\n");
    const seen = new Set<string>();
    for (const s of snapshots) {
      if (!s.image || seen.has(s.image)) continue;
      seen.add(s.image);
      await checkImageFetchable(s.image.includes("og-default") ? "shared card" : "og:image", s.image);
    }
  }

  const t = tally(results.map((r) => r.outcome));
  console.log(`\n${summaryLine(t)}`);
  const banner = incompleteBanner(t);
  if (banner) console.log(`\n${banner}`);

  if (JSON_OUT) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          base: BASE,
          generatedAt: new Date().toISOString(),
          sampled: samples.length,
          shapes: ROUTE_SHAPES.length,
          ...t,
          incomplete: t.unknown > 0,
          results,
          snapshots,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Wrote ${JSON_OUT}`);
  }
  console.log();

  process.exit(exitCodeFor(t, STRICT));
}

run().catch((err) => {
  // Reaching here means the sitemap could not be read, so NOTHING was checked.
  // A transport failure exits 0 with a loud banner rather than 1 — the
  // post-deploy workflows do `exit "$rc"`, and painting a build red for a
  // socket reset is how a real red stops being read.
  const [outcome, detail] = errorOutcome(err);
  console.error(`\nverification could not run — ${detail}\n`);
  process.exit(outcome === "unknown" && !STRICT ? 0 : 1);
});

export {};
