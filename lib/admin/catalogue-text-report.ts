// lib/admin/catalogue-text-report.ts
//
// Does a book's own prose say anything about that book?
//
// PURE. It is handed rows the data-quality action has already fetched and
// scored, decides nothing about the database and writes nothing to it — the
// same contract as lib/admin/contributor-trust-report.ts, and for the same
// reason: every finding here is a record a librarian may be about to retitle
// or rewrite, and neither decision belongs to a scan.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Measured against production on 2026-09-23 (SEO corpus audit F-B1, F-B2):
//
//   1,483 of 1,956 book descriptions (75.8%) are identical to at least one
//     other once the title, the subject name and the digits are masked out.
//     They fall into 62 templates, and ONE of them —
//     "សៀវភៅ «…» គឺជាឯកសារជំនួយស្មារតី និងការសិក្សាស្រាវជ្រាវដ៏មានសារៈសំខាន់…"
//     — carries 1,043 books on its own.
//   1,949 of 1,956 meta descriptions are cut to that prose at 157 characters,
//     so the template is what a search result shows.
//   191 titles are exactly 65 characters and cut mid-word. What the cut
//     removed is the grade number that distinguishes one volume of a textbook
//     series from the next, so 57 books collapse into 18 groups of "identical"
//     titles over provably different documents.
//
// No rule in this repository measured either one. The catalogue's
// derived-description rule (lib/catalogs/derived-description.ts) is the
// closest thing and would flag 0 of the 1,483: it asks whether a description
// restates the record's own FIELDS, which is a different question from whether
// a thousand records share one sentence.
//
// ── Why it reports and never repairs ────────────────────────────────────────
//
// A truncated title must be RETITLED, never retired: the missing grade number
// exists on the title page and nowhere in this database, so no rule here can
// reconstruct it, and archiving one of these records would 301 a real
// textbook's URL onto a different book. A templated description must be
// REWRITTEN, and a model-written replacement is explicitly not the answer —
// it would publish fluent prose about a book nothing here has read.
//
// So this ranks the work and stops. It opens no write path.

/** One published record, as the quality action already fetched it. */
export type CatalogueTextRow = {
  id: string;
  title: string | null;
  description: string | null;
  /** The record's subject/category name, masked out before templates are
   *  compared — a template that interpolates it is still one template. */
  subject: string | null;
  editUrl: string;
};

export type DescriptionTemplate = {
  /** Stable key for the masked shape. Not shown to anyone. */
  key: string;
  /** A real description from the group, so a librarian can recognise it. */
  sample: string;
  /** How many published records share this shape. */
  count: number;
  /** A few members, for the drill-down. Never the whole group. */
  examples: { id: string; title: string; editUrl: string }[];
};

export type TruncatedTitleFinding = {
  id: string;
  title: string;
  editUrl: string;
  /** How many OTHER records this title is byte-identical to once normalized.
   *  0 is common and still a finding: the title is cut either way. */
  sharedWith: number;
};

export type CatalogueTextReport = {
  /** Largest template first. */
  templates: DescriptionTemplate[];
  /** Most-collided first, then by title, so the ordering is deterministic. */
  truncatedTitles: TruncatedTitleFinding[];
  counts: {
    /** Records examined. */
    examined: number;
    /** Records carrying any description at all. */
    described: number;
    /** Records whose description shape is shared with at least one other. */
    templated: number;
    /** `templated / described`, or 0 when nothing is described. NOT a share of
     *  `examined`: a record with no description has no template, and folding
     *  the two questions together would let a library with no prose at all
     *  score 0% templated and read as healthy. */
    templatedShare: number;
    /** Distinct shared shapes. */
    templateGroups: number;
    /** Titles at the truncation length. */
    truncatedTitles: number;
    /** Of those, how many share their title with another record. */
    truncatedAndColliding: number;
  };
};

/**
 * The length an upstream cataloguing step cut titles to.
 *
 * Not a rule this repository applies — no 65-character cap exists anywhere in
 * it — which is exactly why the number is a FINGERPRINT rather than a policy:
 * 191 production titles land on it precisely, and a real title stopping on any
 * one length 191 times is not something a collection does by itself.
 *
 * Counted in CODE POINTS, not UTF-16 units. Khmer is entirely inside the BMP
 * so the two agree for this collection, but a title carrying an emoji or a
 * rare CJK character would count double under `.length` and slip past a check
 * that the cut left it exactly at the cap.
 */
export const TITLE_TRUNCATION_LENGTH = 65;

/** How many members of a template group to carry for the drill-down. */
const EXAMPLES_PER_TEMPLATE = 5;

/** Everything that is not a letter, number or combining mark. Khmer marks are
 *  letters here, the same bilingual rule as lib/books/duplicate-detection. */
const NON_WORD = /[^\p{L}\p{N}\p{M}]+/gu;

/** Latin and Khmer digits alike: a template that interpolates a grade, a year
 *  or a page count is still one template. */
const DIGITS = /[\p{Nd}]+/gu;

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(NON_WORD, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * A description reduced to its SHAPE: what is left once everything specific to
 * the record is taken out.
 *
 * Three things are removed, in this order, and each one is a way the same
 * sentence is made to look bespoke:
 *
 *   the record's own title, wherever it appears — the 1,043-book template
 *     opens by quoting it
 *   the record's subject name — the next-largest templates interpolate it
 *   every digit, in either script — grades, years, page counts, editions
 *
 * Returns "" when nothing distinctive is left, which is treated as no shape at
 * all rather than as a template every empty description belongs to.
 */
export function descriptionShape(row: CatalogueTextRow): string {
  const description = (row.description ?? "").trim();
  if (!description) return "";

  let shape = fold(description);
  for (const specific of [row.title, row.subject]) {
    const folded = fold(specific ?? "");
    if (folded.length < 3) continue;
    shape = shape.split(folded).join(" ");
  }
  shape = shape.replace(DIGITS, " ").replace(/\s+/g, " ").trim();

  // A shape that is now almost nothing says nothing about sharing: two
  // one-word descriptions matching is not a template, it is a coincidence.
  return shape.split(" ").filter(Boolean).length >= 4 ? shape : "";
}

/** Title length in CODE POINTS — see TITLE_TRUNCATION_LENGTH. */
export function titleLength(title: string | null | undefined): number {
  return title ? [...title].length : 0;
}

/**
 * The report.
 *
 * Deliberately does NOT group records by duplicate title: `/admin/books/duplicates`
 * owns that question and already answers it with a dismissal verdict and a
 * comparison strip. What this adds is the RETITLE queue — records whose title
 * was cut by a process upstream of this repository — and `sharedWith` says
 * which of them are also feeding that queue false duplicates.
 */
export function buildCatalogueTextReport(
  rows: readonly CatalogueTextRow[],
): CatalogueTextReport {
  const byShape = new Map<string, CatalogueTextRow[]>();
  let described = 0;

  for (const row of rows) {
    if ((row.description ?? "").trim()) described += 1;
    const shape = descriptionShape(row);
    if (!shape) continue;
    const group = byShape.get(shape);
    if (group) group.push(row);
    else byShape.set(shape, [row]);
  }

  const templates: DescriptionTemplate[] = [...byShape]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      sample: (group[0].description ?? "").trim(),
      count: group.length,
      examples: group.slice(0, EXAMPLES_PER_TEMPLATE).map((r) => ({
        id: r.id,
        title: r.title ?? "",
        editUrl: r.editUrl,
      })),
    }))
    // Largest first; the key breaks ties so two runs over unchanged data
    // produce the same order.
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const templated = templates.reduce((sum, t) => sum + t.count, 0);

  // Title collisions, over the same folding the duplicate detector uses.
  const titleCounts = new Map<string, number>();
  for (const row of rows) {
    const folded = fold(row.title ?? "");
    if (!folded) continue;
    titleCounts.set(folded, (titleCounts.get(folded) ?? 0) + 1);
  }

  const truncatedTitles: TruncatedTitleFinding[] = rows
    .filter((r) => titleLength(r.title) === TITLE_TRUNCATION_LENGTH)
    .map((r) => ({
      id: r.id,
      title: r.title ?? "",
      editUrl: r.editUrl,
      sharedWith: Math.max(0, (titleCounts.get(fold(r.title ?? "")) ?? 1) - 1),
    }))
    .sort((a, b) => b.sharedWith - a.sharedWith || a.title.localeCompare(b.title));

  return {
    templates,
    truncatedTitles,
    counts: {
      examined: rows.length,
      described,
      templated,
      templatedShare: described > 0 ? templated / described : 0,
      templateGroups: templates.length,
      truncatedTitles: truncatedTitles.length,
      truncatedAndColliding: truncatedTitles.filter((t) => t.sharedWith > 0).length,
    },
  };
}
