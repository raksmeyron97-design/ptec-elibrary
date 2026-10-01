// scripts/seo-draft-subject-intros.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     npx tsx scripts/seo-draft-subject-intros.ts [--out content/drafts/subject-intros.json]
//
// READ-ONLY, anon key only, one request at a time. Writes DRAFT introductions
// for every subject hub (SEO Phase 2.2) for librarians to review; it writes
// nothing to any database. Import approved entries with
// scripts/seo-import-subject-intros.ts.
//
// Every sentence is built from a database fact: the subject's counts, its
// most-downloaded e-books, its sub-topics and the published learning paths
// that name it. Nothing about what a subject "covers" or who teaches it is
// written here, because that is not in the database; a draft too short to
// reach 80 words says so in `notes` instead of being padded. The Khmer text
// is composed from phrases the site already publishes and is marked
// TODO(km-review). English subject names are SUGGESTED TRANSLATIONS (the
// schema holds no English name anywhere — 0146), marked needs_review.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  catalogMatchesSubject,
  learningPathMatchesSubject,
  publicationMatchesSubject,
  thesisMatchesSubject,
} from "../lib/subjects/matching";
import { countWords } from "../lib/seo/intro-drafts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "content/drafts/subject-intros.json";
const DELAY_MS = 300;
const TOP_TITLES = 3;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only, anon).");
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every row of a query, 1,000 at a time (PostgREST's max_rows), in order. */
async function fetchAll<T>(pathAndQuery: string): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    await sleep(DELAY_MS);
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: key!, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` },
    });
    if (!res.ok) {
      console.warn(`  ${pathAndQuery.split("?")[0]}: ${res.status} — treated as unavailable`);
      return null;
    }
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
    from += page.length;
  }
}

type Category = { id: string; name: string; slug: string };
type Book = { id: string; title: string; category_id: string | null; download_count: number | null };
type Thesis = { id: string; subject: string | null; program: string | null; faculty: string | null };
type Publication = { id: string; subjects: string[] | null };
type Catalog = { category: string | null };
type Path = { slug: string; title: string; title_km: string | null; subject: string | null };
type SubjectRow = { id: string; name_en: string | null; name_km: string | null; parent_id: string | null; legacy_category_id: string | null };

/** "A, B and C" in English; Khmer separates list items with a space. */
const list = (items: string[], and: string, sep = ", ") =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(sep)} ${and} ${items[items.length - 1]}`;
const KHMER = /[\u1780-\u17FF]/u;

// Suggested English names, keyed by the Khmer category name as production
// stores it (2026-09-30). A translation of a subject's name, not a fact about
// it: every one is needs_review, and none reaches a page until a librarian
// approves it. The storage shelf table was tried first and rejected — it
// names SHELVES ("Science" for biology, chemistry and physics alike).
const SUGGESTED_EN: Record<string, string> = {
  "កញ្ជប់គណិតវិទ្យា": "Mathematics Kits",
  "កម្មវិធី PISA": "PISA Programme",
  "កម្មវិធីសិក្សា": "Curriculum",
  "គណិតវិទ្យា": "Mathematics",
  "គរុកោសល្យ": "Pedagogy",
  "គីមីវិទ្យា": "Chemistry",
  "ចំណេះដឹងទូទៅ": "General Knowledge",
  "ច្បាប់": "Law",
  "ជីវវិទ្យា": "Biology",
  "ទស្សនវិជ្ជា": "Philosophy",
  "ទស្សនវិជ្ជាអប់រំ": "Philosophy of Education",
  "បច្ចេកវិទ្យា": "Technology",
  "បច្ចេកវិទ្យាព័ត៌មាន": "Information Technology",
  "បំណិនជីវិត": "Life Skills",
  "ប្រវត្តិសាស្ត្រ": "History",
  "ភាសា": "Languages",
  "ភាសាខ្មែរ": "Khmer Language",
  "ភាសាបារាំង": "French",
  "ភាសាអង់គ្លេសសិក្សា": "English Studies",
  "រូបវិទ្យា": "Physics",
  "វប្បធម៌": "Culture",
  "វិញ្ញាសាប្រឡង": "Exam Papers",
  "វិទ្យសាស្ត្រ": "Science",
  "វិធីសាស្ត្របង្រៀនរូបវិទ្យា": "Physics Teaching Methods",
  "សិក្សាសង្គម": "Social Studies",
  "សុខភាព": "Health",
  "ស្ថិតិ និងវិភាគទិន្នន័យ": "Statistics and Data Analysis",
  "ស្រាវជ្រាវ": "Research",
  "ស្រាវជ្រាវបែបគុណភាព": "Qualitative Research",
  "ស្រាវជ្រាវប្រតិបត្តិ": "Action Research",
  "អក្សរសិល្ប៍": "Literature",
  "អំណានកុមារ": "Children's Reading",
  "អប់រំ": "Education",
  "អប់រំកាយ និងកីឡា": "Physical Education and Sport",
  "អប់រំសិល្បៈ": "Arts Education",
};

// Names whose spelling differs from the form the site uses elsewhere. Reported
// for a Khmer reader; nothing here renames a category (its slug and every
// link depend on it).
const SPELLING_NOTES: Record<string, string> = {
  "កញ្ជប់គណិតវិទ្យា":
    "Spelling: the learning paths write កញ្ចប់ (package), this category កញ្ជប់. Confirm which is intended.",
  "វិទ្យសាស្ត្រ": "Spelling: the usual form is វិទ្យាសាស្ត្រ (with ា). Confirm which is intended.",
};

const englishName = (km: string | null): string | null => (km ? (SUGGESTED_EN[km] ?? null) : null);
const withEnglish = (km: string) => (englishName(km) ? `${englishName(km)} (${km})` : km);

function englishDraft(f: Facts): string {
  const parts: string[] = [];
  parts.push(`This page gathers everything PTEC Library holds on ${f.displayName}.`);
  const counts = [
    f.books > 0 ? `${f.books} free ${f.books === 1 ? "e-book" : "e-books"}` : null,
    f.theses > 0 ? `${f.theses} ${f.theses === 1 ? "thesis" : "theses"}` : null,
    f.articles > 0 ? `${f.articles} journal ${f.articles === 1 ? "article" : "articles"}` : null,
    f.printTitles > 0 ? `${f.printTitles} printed ${f.printTitles === 1 ? "book" : "books"} held in the library` : null,
  ].filter((x): x is string => x !== null);
  if (counts.length > 0) parts.push(`The collection holds ${list(counts, "and")}.`);
  if (f.topTitles.length > 0) {
    parts.push(
      `The most downloaded ${f.topTitles.length === 1 ? "e-book is" : "e-books are"} ${list(f.topTitles.map((t) => `“${t}”`), "and")}.`,
    );
  }
  if (f.subtopics.length > 0) parts.push(`Its subtopics are ${list(f.subtopics, "and")}.`);
  if (f.parent) parts.push(`It is a subtopic of ${f.parent}.`);
  if (f.paths.length > 0) {
    parts.push(
      `${f.paths.length === 1 ? "The learning path" : "The learning paths"} ${list(f.paths.map((p) => `“${p.title}”`), "and")} ${f.paths.length === 1 ? "draws" : "draw"} on this subject.`,
    );
  }
  return parts.join(" ");
}

// TODO(km-review): every phrase below comes from messages/km.json (subjects.*,
// the count phrases, home.heroMostDownloaded "សៀវភៅដែលទាញយកច្រើនបំផុត", "ប្រធានបទរង", "ផ្លូវសិក្សា"), but the
// sentences that join them are new.
function khmerDraft(f: Facts): string {
  const parts: string[] = [];
  parts.push(`ទំព័រនេះប្រមូលអ្វីៗទាំងអស់ដែលបណ្ណាល័យ វ.គ.ភ មានលើមុខវិជ្ជា ${f.nameKm}។`);
  const counts = [
    f.books > 0 ? `${f.books} សៀវភៅអេឡិចត្រូនិកឥតគិតថ្លៃ` : null,
    f.theses > 0 ? `${f.theses} និក្ខេបបទ` : null,
    f.articles > 0 ? `${f.articles} អត្ថបទទស្សនាវដ្ដី` : null,
    f.printTitles > 0 ? `${f.printTitles} សៀវភៅរូបវន្ត` : null,
  ].filter((x): x is string => x !== null);
  if (counts.length > 0) parts.push(`បណ្ណាល័យមាន ${list(counts, "និង", " ")}។`);
  if (f.topTitles.length > 0) {
    parts.push(`សៀវភៅដែលទាញយកច្រើនបំផុត៖ ${list(f.topTitles.map((t) => `«${t}»`), "និង", " ")}។`);
  }
  if (f.subtopicsKm.length > 0) parts.push(`ប្រធានបទរង៖ ${list(f.subtopicsKm, "និង", " ")}។`);
  if (f.parentKm) parts.push(`ប្រធានបទរងនៃ ${f.parentKm}។`);
  if (f.paths.length > 0) {
    parts.push(`ផ្លូវសិក្សា ${list(f.paths.map((p) => `«${p.titleKm ?? p.title}»`), "និង", " ")} ប្រើធនធានពីមុខវិជ្ជានេះ។`);
  }
  return parts.join(" ");
}

type Facts = {
  nameKm: string;
  displayName: string;
  books: number;
  theses: number;
  articles: number;
  printTitles: number;
  topTitles: string[];
  subtopics: string[];
  subtopicsKm: string[];
  parent: string | null;
  parentKm: string | null;
  paths: { slug: string; title: string; titleKm: string | null }[];
};

async function main(): Promise<void> {
  console.log(`Reading from ${new URL(url!).host} (anon, read-only, sequential)`);
  const categories = await fetchAll<Category>("categories?select=id,name,slug&order=id.asc");
  if (!categories) throw new Error("categories are not readable — nothing to draft");
  const books = (await fetchAll<Book>("books?select=id,title,category_id,download_count&is_published=eq.true&order=id.asc")) ?? [];
  const theses = await fetchAll<Thesis>("research_reports?select=id,subject,program,faculty&is_published=eq.true&order=id.asc");
  const publications = await fetchAll<Publication>("publications?select=id,subjects&is_published=eq.true&order=id.asc");
  const catalog = await fetchAll<Catalog>("catalog_books?select=category&is_active=eq.true&order=id.asc");
  const paths = await fetchAll<Path>("learning_paths?select=slug,title,title_km,subject&status=eq.published&order=position.asc");
  const hierarchy = await fetchAll<SubjectRow>("subjects?select=id,name_en,name_km,parent_id,legacy_category_id&status=eq.active&order=id.asc");

  const byLegacy = new Map((hierarchy ?? []).map((s) => [s.legacy_category_id, s]));
  const byId = new Map((hierarchy ?? []).map((s) => [s.id, s]));
  const nameOfSubject = (s: SubjectRow | undefined) =>
    s ? (categories.find((c) => c.id === s.legacy_category_id)?.name ?? s.name_km ?? null) : null;

  const entries = categories
    .filter((c) => c.slug && c.name)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((c) => {
      const own = books.filter((b) => b.category_id === c.id);
      // Only a Khmer name needs an English one; a Latin name already is one.
      const suggestion = KHMER.test(c.name) ? englishName(c.name) : null;
      const node = byLegacy.get(c.id);
      const children = node ? (hierarchy ?? []).filter((s) => s.parent_id === node.id) : [];
      const parentNode = node?.parent_id ? byId.get(node.parent_id) : undefined;
      const childNames = children.map((s) => nameOfSubject(s)).filter((n): n is string => Boolean(n));
      const parentName = nameOfSubject(parentNode);
      const facts: Facts = {
        nameKm: c.name,
        displayName: suggestion ? `${suggestion} (${c.name})` : c.name,
        books: own.length,
        theses: theses ? theses.filter((t) => thesisMatchesSubject(t, c.name)).length : 0,
        articles: publications ? publications.filter((p) => publicationMatchesSubject(p.subjects, c.name)).length : 0,
        printTitles: catalog ? catalog.filter((r) => catalogMatchesSubject(r.category, c.name)).length : 0,
        topTitles: [...own]
          .sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0) || a.id.localeCompare(b.id))
          .slice(0, TOP_TITLES)
          .map((b) => b.title.trim()),
        subtopics: childNames.map(withEnglish),
        subtopicsKm: childNames,
        parent: parentName ? withEnglish(parentName) : null,
        parentKm: parentName,
        paths: (paths ?? [])
          .filter((p) => learningPathMatchesSubject(p, c.name))
          .map((p) => ({ slug: p.slug, title: p.title, titleKm: p.title_km })),
      };
      const introEn = englishDraft(facts);
      const introKm = khmerDraft(facts);
      const wordsEn = countWords(introEn, "en");
      const wordsKm = countWords(introKm, "km");
      const notes: string[] = [];
      if (wordsEn < 80) {
        notes.push(
          `English draft is ${wordsEn} words, below the 80-word minimum: the database holds no more facts about this subject. Add what a librarian knows (what it covers at PTEC, which programmes use it) before approving.`,
        );
      }
      if (wordsEn > 150) notes.push(`English draft is ${wordsEn} words, above 150: shorten before approving.`);
      if (!suggestion && KHMER.test(c.name)) {
        notes.push("No English name suggestion: add name_en.value by hand, or leave it empty to keep showing the Khmer name.");
      }
      if (SPELLING_NOTES[c.name]) notes.push(SPELLING_NOTES[c.name]);
      if (!theses) notes.push("Thesis counts unavailable in this read (0 used).");
      if (!hierarchy) notes.push("Subtopics unavailable to the anon key; check the admin taxonomy before approving.");
      return {
        slug: c.slug,
        name_km: c.name,
        name_en: { value: suggestion, status: "needs_review", source: suggestion ? "suggested translation" : null },
        facts: {
          books: facts.books,
          theses: facts.theses,
          journal_articles: facts.articles,
          print_titles: facts.printTitles,
          top_books: facts.topTitles,
          subtopics: facts.subtopicsKm,
          parent: facts.parentKm,
          learning_paths: facts.paths.map((p) => p.slug),
        },
        intro_en: introEn,
        intro_km: introKm,
        words_en: wordsEn,
        words_km: wordsKm,
        km_review: "TODO(km-review)",
        status: "needs_review",
        notes,
      };
    });

  const doc = {
    about:
      "DRAFT subject introductions for librarian review (SEO Phase 2.2). Built only from database facts; nothing here is published. To publish an entry: edit intro_en/intro_km (80–150 words), set name_en.status to \"approved\" if the English name is right, clear km_review once a Khmer reader has approved intro_km, set status to \"approved\", then run scripts/seo-import-subject-intros.ts.",
    generated_at: new Date().toISOString(),
    source: `${new URL(url!).host} (anon, read-only)`,
    subjects: entries,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
  const short = entries.filter((e) => e.words_en < 80).length;
  console.log(`${entries.length} subjects drafted → ${OUT} (${short} below 80 words; ${entries.filter((e) => e.name_en.value).length} with an English name suggestion)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
