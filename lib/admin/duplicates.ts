// Pure, testable duplicate-detection for the admin book catalog.
// Browser-safe — no DB imports — so the grouping logic is unit-tested without
// a database (lib/admin/duplicates.test.ts).
//
// Design principle (from the SEO brief): NEVER auto-merge on title similarity
// alone. This module only *surfaces* probable duplicates ranked by how strong
// the shared signal is; a human picks the canonical record and confirms the
// retire in the admin UI.

export type DuplicateBook = {
  id: string;
  slug: string;
  title: string;
  isbn: string | null;
  /** Publication year (0/undefined when unknown). */
  year: number | null;
  author: string | null;
  pages: number | null;
  fileSizeKb: number | null;
  contentHash: string | null;
  createdAt: string | null;
};

export type DuplicateSignal =
  | "isbn"
  | "content-hash"
  | "file-size"
  | "title"
  | "title-prefix"
  | "author"
  | "year";
export type DuplicateConfidence = "high" | "medium" | "low";

export type DuplicateGroup = {
  key: string;
  confidence: DuplicateConfidence;
  signals: DuplicateSignal[];
  books: DuplicateBook[];
};

/*
 * NORMALIZATION LIVES IN ONE PLACE, AND IT IS NOT HERE.
 *
 * These are re-exported from lib/books/duplicate-detection/normalize.ts so the
 * review queue, the upload gate and the bulk importer cannot develop separate
 * opinions about what "the same title" or "the same ISBN" means — they had
 * three, and the importer's was the weakest of them. They stay exported from
 * this module because existing call sites import them from here, and because
 * this module still owns a different question: how matching records are
 * GROUPED, not how their fields are folded.
 */
export { normalizeIsbn, normalizeTitle } from "@/lib/books/duplicate-detection/normalize";
import { normalizeIsbn, normalizeTitle } from "@/lib/books/duplicate-detection/normalize";

function normalizeAuthor(author: string | null | undefined): string | null {
  const a = author?.trim().toLowerCase();
  return a && a !== "unknown" && a !== "unknown author" ? a : null;
}

const CONFIDENCE_RANK: Record<DuplicateConfidence, number> = { high: 3, medium: 2, low: 1 };

/**
 * Groups probable duplicates. A pair is grouped when it shares one of:
 *   * identical normalized ISBN            → high
 *   * identical non-null content hash      → high
 *   * identical normalized title AND (same author OR same year OR same file
 *     size)                                → medium
 *   * identical normalized title only      → low
 *   * one title is a word-boundary PREFIX of another by the same author
 *                                          → low  ("title-prefix")
 *
 * Each returned group is a maximal set of books connected by these signals
 * (union-find), tagged with the strongest confidence and the signals seen.
 */
export function findDuplicateGroups(books: DuplicateBook[]): DuplicateGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  // Evidence is keyed by cluster ROOT, so a merge has to carry the losing
  // root's signals and confidence across. Without this, two clusters joining
  // silently discard whichever root stopped being the representative — which
  // downgraded a real MEDIUM group (same title + author + year) to LOW the
  // moment a third, prefix-matched record joined it.
  const clusterSignals = new Map<string, Set<DuplicateSignal>>();
  const clusterConfidence = new Map<string, DuplicateConfidence>();

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent.set(ra, rb);

    const movingSignals = clusterSignals.get(ra);
    if (movingSignals) {
      const target = clusterSignals.get(rb) ?? new Set<DuplicateSignal>();
      for (const sig of movingSignals) target.add(sig);
      clusterSignals.set(rb, target);
      clusterSignals.delete(ra);
    }

    const movingConfidence = clusterConfidence.get(ra);
    if (movingConfidence) {
      const target = clusterConfidence.get(rb);
      if (!target || CONFIDENCE_RANK[movingConfidence] > CONFIDENCE_RANK[target]) {
        clusterConfidence.set(rb, movingConfidence);
      }
      clusterConfidence.delete(ra);
    }
  };
  for (const b of books) parent.set(b.id, b.id);

  const byId = new Map(books.map((b) => [b.id, b]));
  const isbnIndex = new Map<string, string[]>();
  const hashIndex = new Map<string, string[]>();
  const titleIndex = new Map<string, string[]>();

  const push = (index: Map<string, string[]>, key: string | null, id: string) => {
    if (!key) return;
    const list = index.get(key) ?? [];
    list.push(id);
    index.set(key, list);
  };

  for (const b of books) {
    push(isbnIndex, normalizeIsbn(b.isbn), b.id);
    push(hashIndex, b.contentHash, b.id);
    push(titleIndex, normalizeTitle(b.title) || null, b.id);
  }

  const connect = (ids: string[], signal: DuplicateSignal, confidence: DuplicateConfidence) => {
    if (ids.length < 2) return;
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    const root = find(ids[0]);
    const set = clusterSignals.get(root) ?? new Set<DuplicateSignal>();
    set.add(signal);
    clusterSignals.set(root, set);
    const prev = clusterConfidence.get(root);
    if (!prev || CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[prev]) {
      clusterConfidence.set(root, confidence);
    }
  };

  for (const ids of isbnIndex.values()) connect(ids, "isbn", "high");
  for (const ids of hashIndex.values()) connect(ids, "content-hash", "high");

  // Title clusters: qualify each with the strongest corroborating signal.
  for (const ids of titleIndex.values()) {
    if (ids.length < 2) continue;
    const rows = ids.map((id) => byId.get(id)!);
    const authors = new Set(rows.map((r) => normalizeAuthor(r.author)).filter(Boolean));
    const years = new Set(rows.map((r) => r.year).filter((y): y is number => !!y && y > 0));
    const sizes = new Set(rows.map((r) => r.fileSizeKb).filter((s): s is number => !!s));
    const sameAuthor = authors.size === 1 && rows.every((r) => normalizeAuthor(r.author));
    const sameYear = years.size === 1 && rows.every((r) => r.year && r.year > 0);
    const sameSize = sizes.size === 1 && rows.every((r) => r.fileSizeKb);

    connect(ids, "title", "low");
    const root = find(ids[0]);
    const set = clusterSignals.get(root)!;
    if (sameAuthor) set.add("author");
    if (sameYear) set.add("year");
    if (sameSize) set.add("file-size");
    if (sameAuthor || sameYear || sameSize) {
      const prev = clusterConfidence.get(root)!;
      if (CONFIDENCE_RANK["medium"] > CONFIDENCE_RANK[prev]) clusterConfidence.set(root, "medium");
    }
  }

  // Subtitle / edition variants: one normalized title is a word-boundary prefix
  // of another by the same author.
  //
  // This exists because exact-title matching misses the most common real
  // cataloguing duplicate — the same work entered once with its full title and
  // once truncated. In this library:
  //   "Introduction to Research Methods: A Practical Guide"
  //   "Introduction to Research Methods: A Practical Guide for Anyone
  //    Undertaking a Research Project (5th ed.)"
  // — same author, same work, two published records, invisible to every other
  // signal here.
  //
  // Deliberately "low": a prefix is ALSO how genuine separate editions look
  // ("… , 5th Edition"), and this module never auto-merges. Low confidence
  // means "a person should look at these two", not "these are the same file".
  //
  // Bucketed by author so this stays linear in the library size rather than
  // O(n²) across every book.
  const PREFIX_MIN_LEN = 20; // "research methods" alone must not cluster the shelf
  const byAuthor = new Map<string, string[]>();
  for (const b of books) {
    const a = normalizeAuthor(b.author);
    if (!a) continue; // an unknown author is not evidence of anything
    push(byAuthor, a, b.id);
  }
  for (const ids of byAuthor.values()) {
    if (ids.length < 2) continue;
    const rows = ids
      .map((id) => ({ id, norm: normalizeTitle(byId.get(id)!.title) }))
      .filter((r) => r.norm.length >= PREFIX_MIN_LEN)
      // Shortest first, so each title is only ever tested as the prefix of a
      // longer one.
      .sort((x, y) => x.norm.length - y.norm.length);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[i].norm === rows[j].norm) continue; // exact pass owns this
        // Word boundary: "a practical guide" must not match "a practical guidebook".
        if (!rows[j].norm.startsWith(rows[i].norm + " ")) continue;
        connect([rows[i].id, rows[j].id], "title-prefix", "low");
      }
    }
  }

  // Collect final clusters of size > 1.
  const clusters = new Map<string, DuplicateBook[]>();
  for (const b of books) {
    const root = find(b.id);
    const list = clusters.get(root) ?? [];
    list.push(b);
    clusters.set(root, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, groupBooks] of clusters) {
    if (groupBooks.length < 2) continue;
    // Oldest record first — a sensible default "keep this one" suggestion.
    groupBooks.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    groups.push({
      key: root,
      confidence: clusterConfidence.get(root) ?? "low",
      signals: [...(clusterSignals.get(root) ?? new Set())].sort(),
      books: groupBooks,
    });
  }

  // Strongest, largest groups first.
  groups.sort(
    (a, b) =>
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      b.books.length - a.books.length ||
      a.books[0].title.localeCompare(b.books[0].title),
  );
  return groups;
}
