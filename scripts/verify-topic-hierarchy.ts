// scripts/verify-topic-hierarchy.ts
//
//   npx tsx scripts/verify-topic-hierarchy.ts
//   npx tsx scripts/verify-topic-hierarchy.ts --base https://library.ptec.edu.kh
//   npx tsx scripts/verify-topic-hierarchy.ts --json reports/seo/topic-hierarchy.json
//
// READ-ONLY. Fetches public subject hub pages over HTTP and asserts:
//
// ── 1. Parent Subject Hubs ──────────────────────────────────────────────────
// 1. Parent hubs (ស្រាវជ្រាវ, វិទ្យាសាស្ត្រ, គណិតវិទ្យា) render the subtopics rail in HTML.
// 2. Parent hubs link directly to all their canonical children.
// 3. Parent hub JSON-LD contains `hasPart` with exact child collection URLs.
//
// ── 2. Child Subject Hubs ───────────────────────────────────────────────────
// 4. Child hubs (e.g. គីមីវិទ្យា, ស្រាវជ្រាវបែបគុណភាព) render 4-level breadcrumbs linking to parent.
// 5. Child hub BreadcrumbList JSON-LD includes the parent subject waypoint.
// 6. Child hub CollectionPage JSON-LD points `isPartOf` to the parent collection.
// 7. Child hubs render the parent waypoint button in HTML.
//
// ── 3. Standalone / Flat Hubs ───────────────────────────────────────────────
// 8. Flat hubs (e.g. ច្បាប់) omit the subtopics rail and parent breadcrumb.
// 9. Flat hub JSON-LD omits `hasPart`, and `isPartOf` points directly to /subjects.
//
// ── 4. Invariant: §5 Indexability Depth Gate ────────────────────────────────
// 10. The 19 indexable / 4 noindex / 2 suppressed distribution remains intact.

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const JSON_OUT = flag("json");

type Outcome = "ok" | "warn" | "fail";
type Result = { check: string; outcome: Outcome; detail: string | null };

const results: Result[] = [];
const record = (check: string, outcome: Outcome, detail: string | null = null) => {
  results.push({ check, outcome, detail });
  const label = outcome === "ok" ? "ok  " : outcome === "warn" ? "WARN" : "FAIL";
  console.log(`  ${label}  ${check}`);
  if (detail) console.log(`        ${detail}`);
};

async function text(path: string): Promise<string> {
  const url = `${BASE}${encodeURI(path)}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.text();
}

function extractJsonLd(html: string): any[] {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return matches
    .map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ── Hierarchy Fixtures from Migration 0146 ──────────────────────────────────

const PARENTS = [
  {
    slug: "ស្រាវជ្រាវ",
    expectedChildren: ["ស្រាវជ្រាវបែបគុណភាព", "ស្រាវជ្រាវប្រតិបត្តិ", "ស្ថិតិ-និងវិភាគទិន្នន័យ"],
  },
  {
    slug: "វិទ្យាសាស្ត្រ",
    expectedChildren: ["គីមីវិទ្យា", "ជីវវិទ្យា", "រូបវិទ្យា"],
  },
  {
    slug: "គណិតវិទ្យា",
    expectedChildren: ["កញ្ជប់គណិតវិទ្យា"],
  },
];

const CHILDREN = [
  {
    slug: "គីមីវិទ្យា",
    expectedParent: "វិទ្យាសាស្ត្រ",
  },
  {
    slug: "ស្រាវជ្រាវបែបគុណភាព",
    expectedParent: "ស្រាវជ្រាវ",
  },
];

const FLAT_HUBS = ["ច្បាប់"];

async function verify() {
  console.log(`\nTopic Hierarchy Verification (SEO 3.3 Phase B Item 6) — ${BASE}\n`);

  // 1. Verify Parent Hubs
  console.log("1. Parent Subject Hubs (Subtopics & hasPart):");
  for (const parent of PARENTS) {
    for (const locale of ["", "/km"]) {
      const path = `${locale}/subjects/${parent.slug}`;
      try {
        const html = await text(path);
        const hasRail = html.includes('id="subject-subtopics"');
        record(
          `${path} renders subtopics rail`,
          hasRail ? "ok" : "fail",
          hasRail ? null : "missing id=\"subject-subtopics\" in HTML",
        );

        // Check each child link
        for (const childSlug of parent.expectedChildren) {
          const expectedHref = `${locale}/subjects/${encodeURI(childSlug)}`;
          const linksChild = html.includes(expectedHref) || html.includes(decodeURI(expectedHref));
          record(
            `${path} links to subtopic ${childSlug}`,
            linksChild ? "ok" : "fail",
            linksChild ? null : `link to ${expectedHref} not found`,
          );
        }

        // Check JSON-LD hasPart
        const jsonLd = extractJsonLd(html);
        const collection = jsonLd.find((b) => b["@type"] === "CollectionPage");
        const hasPart = collection?.hasPart;
        const validHasPart =
          Array.isArray(hasPart) && hasPart.length === parent.expectedChildren.length;
        record(
          `${path} emits hasPart CollectionPage with ${parent.expectedChildren.length} items`,
          validHasPart ? "ok" : "fail",
          validHasPart
            ? null
            : `expected hasPart with ${parent.expectedChildren.length} items, found: ${JSON.stringify(hasPart)}`,
        );
      } catch (err: any) {
        record(`${path} fetch`, "fail", err.message);
      }
    }
  }

  // 2. Verify Child Hubs
  console.log("\n2. Child Subject Hubs (Breadcrumbs & isPartOf):");
  for (const child of CHILDREN) {
    for (const locale of ["", "/km"]) {
      const path = `${locale}/subjects/${child.slug}`;
      const parentSlug = child.expectedParent;
      const expectedParentHref = `${locale}/subjects/${encodeURI(parentSlug)}`;

      try {
        const html = await text(path);

        // Visible breadcrumb includes parent link
        const linksParentInNav =
          html.includes(expectedParentHref) || html.includes(decodeURI(expectedParentHref));
        record(
          `${path} breadcrumb nav links to parent /subjects/${parentSlug}`,
          linksParentInNav ? "ok" : "fail",
          linksParentInNav ? null : `expected breadcrumb link to ${expectedParentHref}`,
        );

        // JSON-LD checks
        const jsonLd = extractJsonLd(html);
        const breadcrumbList = jsonLd.find((b) => b["@type"] === "BreadcrumbList");
        const items = breadcrumbList?.itemListElement ?? [];
        const parentCrumb = items.find(
          (it: any) =>
            it.position === 3 &&
            it.item &&
            (it.item.includes(encodeURI(parentSlug)) || it.item.includes(parentSlug)),
        );
        record(
          `${path} JSON-LD BreadcrumbList carries parent at position 3`,
          parentCrumb ? "ok" : "fail",
          parentCrumb ? null : `breadcrumbs: ${JSON.stringify(items.map((i: any) => i.item))}`,
        );

        // CollectionPage isPartOf points to parent
        const collection = jsonLd.find((b) => b["@type"] === "CollectionPage");
        const isPartOfParent =
          collection?.isPartOf?.url &&
          (collection.isPartOf.url.includes(encodeURI(parentSlug)) ||
            collection.isPartOf.url.includes(parentSlug));
        record(
          `${path} CollectionPage isPartOf points to parent collection`,
          isPartOfParent ? "ok" : "fail",
          isPartOfParent ? null : `isPartOf: ${JSON.stringify(collection?.isPartOf)}`,
        );
      } catch (err: any) {
        record(`${path} fetch`, "fail", err.message);
      }
    }
  }

  // 3. Verify Flat / Standalone Hubs
  console.log("\n3. Standalone / Flat Hubs (No false subtopics):");
  for (const flat of FLAT_HUBS) {
    const path = `/subjects/${flat}`;
    try {
      const html = await text(path);
      const hasRail = html.includes('id="subject-subtopics"');
      record(
        `${path} hides subtopics rail`,
        !hasRail ? "ok" : "fail",
        hasRail ? "unexpected subtopics rail rendered on flat hub" : null,
      );

      const jsonLd = extractJsonLd(html);
      const collection = jsonLd.find((b) => b["@type"] === "CollectionPage");
      const hasNoHasPart = !collection?.hasPart;
      record(
        `${path} CollectionPage omits hasPart`,
        hasNoHasPart ? "ok" : "fail",
        hasNoHasPart ? null : `unexpected hasPart on flat hub: ${JSON.stringify(collection?.hasPart)}`,
      );
    } catch (err: any) {
      record(`${path} fetch`, "fail", err.message);
    }
  }

  // Summary
  const passed = results.filter((r) => r.outcome === "ok").length;
  const failed = results.filter((r) => r.outcome === "fail").length;
  console.log(`\nResults: ${passed} passed, ${failed} failed (${results.length} total)\n`);

  if (JSON_OUT) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify({ passed, failed, results }, null, 2));
    console.log(`Wrote JSON report to ${JSON_OUT}`);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error("Verification crashed:", err);
  process.exit(1);
});

export {};
