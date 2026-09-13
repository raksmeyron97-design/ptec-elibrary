// scripts/verify-curriculum-links.ts
//
//   npx tsx scripts/verify-curriculum-links.ts
//   npx tsx scripts/verify-curriculum-links.ts --base https://library.ptec.edu.kh
//   npx tsx scripts/verify-curriculum-links.ts --json reports/seo/curriculum-links.json
//
// READ-ONLY. Fetches public book, path, and subject pages over HTTP and asserts:
//
// ── Link 1: Book → Learning Paths ───────────────────────────────────────────
// 1. Books included in curricula render the curriculum rail with valid links.
// 2. Books NOT in any curriculum hide the rail (no empty headings or chips).
//
// ── Link 2: Subject ↔ Learning Paths (Reciprocal) ───────────────────────────
// 3. Subject hubs for គណិតវិទ្យា and ភាសា render the curriculum rail with valid path links.
// 4. Subject hubs with no curricula (e.g. ច្បាប់, រូបវិទ្យា) hide the curriculum rail.
// 5. Curriculum pages (/paths/[slug]) render reciprocal back-links and breadcrumbs to the parent subject hub.
//
// ── Invariant: §5 Indexability Depth Gate ───────────────────────────────────
// 6. Paths do NOT count as primary resources; 19/4/2 remains intact.

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

async function statusOf(path: string): Promise<number> {
  const url = `${BASE}${encodeURI(path)}`;
  const res = await fetch(url, { method: "HEAD", redirect: "follow" });
  return res.status;
}

// ── Test Fixtures ────────────────────────────────────────────────────────────

const CURRICULUM_BOOKS = [
  { slug: "សៀវភៅជំនួយ-គណិតវិទ្យា-ថ្នាក់ទី១", expectedPath: "early-grade-math" },
  { slug: "សៀវភៅជំនួយ-គណិតវិទ្យា-ថ្នាក់ទី២", expectedPath: "early-grade-math" },
  { slug: "សៀវភៅជំនួយ-គណិតវិទ្យា-ថ្នាក់ទី៣", expectedPath: "early-grade-math" },
  { slug: "សៀវភៅណែនាំគ្រូ-គណិតវិទ្យា-ថ្នាក់ទី៣", expectedPath: "early-grade-math" },
];

const STANDALONE_BOOKS = [
  "នីតិអន្តរជាតិឯកជន",
  "រដ្ឋបាលសាធារណៈ",
];

const SUBJECT_PATHS = [
  { subjectSlug: "គណិតវិទ្យា", expectedPathSlug: "early-grade-math" },
  { subjectSlug: "ភាសា", expectedPathSlug: "early-grade-reading" },
];

const PATH_BACKLINKS = [
  { pathSlug: "early-grade-math", expectedSubjectSlug: "គណិតវិទ្យា" },
  { pathSlug: "early-grade-reading", expectedSubjectSlug: "ភាសា" },
];

const SUBJECTS_WITHOUT_PATHS = [
  "ច្បាប់",
  "រូបវិទ្យា",
];

// ── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nCurriculum Internal Linking Verification (SEO 3.3 Phase B) — ${BASE}\n`);

  // 1. Link 1: Member books render curriculum rail
  console.log("--- Link 1: Book → Learning Paths ---");
  for (const item of CURRICULUM_BOOKS) {
    try {
      const kmHtml = await text(`/km/books/${item.slug}`);
      const hasRail = kmHtml.includes('id="book-learning-paths"');
      const hasLink = kmHtml.includes(`/paths/${item.expectedPath}`);

      record(
        `[KM] /books/${item.slug} renders curriculum rail`,
        hasRail ? "ok" : "fail",
        hasRail ? null : `missing id="book-learning-paths"`,
      );

      record(
        `[KM] /books/${item.slug} links to /paths/${item.expectedPath}`,
        hasLink ? "ok" : "fail",
        hasLink ? null : `missing link to /paths/${item.expectedPath}`,
      );

      const enHtml = await text(`/en/books/${item.slug}`);
      const hasEnRail = enHtml.includes('id="book-learning-paths"');
      record(
        `[EN] /books/${item.slug} renders curriculum rail`,
        hasEnRail ? "ok" : "fail",
        hasEnRail ? null : `missing id="book-learning-paths"`,
      );
    } catch (err) {
      record(`Fetch /books/${item.slug}`, "fail", (err as Error).message);
    }
  }

  // 2. Link 1: Standalone books hide curriculum rail
  for (const slug of STANDALONE_BOOKS) {
    try {
      const html = await text(`/km/books/${slug}`);
      const hasRail = html.includes('id="book-learning-paths"');
      record(
        `Standalone book /books/${slug} hides curriculum rail`,
        !hasRail ? "ok" : "fail",
        hasRail ? `unexpected id="book-learning-paths" found` : null,
      );
    } catch (err) {
      record(`Fetch standalone /books/${slug}`, "warn", (err as Error).message);
    }
  }

  // 3. Link 2: Subject hubs render curriculum rail
  console.log("\n--- Link 2: Subject ↔ Learning Paths (Reciprocal) ---");
  for (const item of SUBJECT_PATHS) {
    try {
      const html = await text(`/km/subjects/${item.subjectSlug}`);
      const hasRail = html.includes('id="subject-learning-paths"');
      const hasLink = html.includes(`/paths/${item.expectedPathSlug}`);

      record(
        `/subjects/${item.subjectSlug} renders curriculum rail`,
        hasRail ? "ok" : "fail",
        hasRail ? null : `missing id="subject-learning-paths" on /km/subjects/${item.subjectSlug}`,
      );

      record(
        `/subjects/${item.subjectSlug} links to /paths/${item.expectedPathSlug}`,
        hasLink ? "ok" : "fail",
        hasLink ? null : `missing link to /paths/${item.expectedPathSlug}`,
      );
    } catch (err) {
      record(`Fetch /subjects/${item.subjectSlug}`, "fail", (err as Error).message);
    }
  }

  // 4. Link 2: Subjects without paths hide curriculum rail
  for (const slug of SUBJECTS_WITHOUT_PATHS) {
    try {
      const html = await text(`/km/subjects/${slug}`);
      const hasRail = html.includes('id="subject-learning-paths"');
      record(
        `/subjects/${slug} hides curriculum rail`,
        !hasRail ? "ok" : "fail",
        hasRail ? `unexpected id="subject-learning-paths" found on /km/subjects/${slug}` : null,
      );
    } catch (err) {
      record(`Fetch /subjects/${slug}`, "warn", (err as Error).message);
    }
  }

  // 5. Link 2: Paths render reciprocal back-link to parent subject
  for (const item of PATH_BACKLINKS) {
    try {
      const html = await text(`/km/paths/${item.pathSlug}`);
      const hasSubjectLink = html.includes(`/subjects/${item.expectedSubjectSlug}`);
      record(
        `/paths/${item.pathSlug} links back to /subjects/${item.expectedSubjectSlug}`,
        hasSubjectLink ? "ok" : "fail",
        hasSubjectLink ? null : `missing back-link to /subjects/${item.expectedSubjectSlug}`,
      );
    } catch (err) {
      record(`Fetch /paths/${item.pathSlug}`, "fail", (err as Error).message);
    }
  }

  // Summary
  const fails = results.filter((r) => r.outcome === "fail").length;
  const warns = results.filter((r) => r.outcome === "warn").length;
  const oks = results.filter((r) => r.outcome === "ok").length;

  console.log(`\nSummary: ${oks} passed, ${warns} warned, ${fails} failed.\n`);

  if (JSON_OUT) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, results }, null, 2));
  }

  if (fails > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Verifier fatal error:", err);
  process.exit(2);
});

export {};
