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

export type DuplicateSignal = "isbn" | "content-hash" | "file-size" | "title" | "author" | "year";
export type DuplicateConfidence = "high" | "medium" | "low";

export type DuplicateGroup = {
  key: string;
  confidence: DuplicateConfidence;
  signals: DuplicateSignal[];
  books: DuplicateBook[];
};

/** Lowercase, strip diacritics + punctuation, collapse whitespace. Used to
 *  cluster titles that differ only in casing/punctuation. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ក-៿]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Digits only (ISBN-10/13 with hyphens/spaces removed). Empty → null. */
export function normalizeIsbn(isbn: string | null | undefined): string | null {
  if (!isbn || isbn === "N/A") return null;
  const digits = isbn.replace(/[^0-9xX]/g, "").toUpperCase();
  return digits.length === 10 || digits.length === 13 ? digits : null;
}

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
  const union = (a: string, b: string) => parent.set(find(a), find(b));
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

  // Track the reason(s) that connected each root cluster.
  const clusterSignals = new Map<string, Set<DuplicateSignal>>();
  const clusterConfidence = new Map<string, DuplicateConfidence>();

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
