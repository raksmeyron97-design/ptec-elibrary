// lib/books/card-data.ts
//
// The fields a book CARD renders — and nothing else.
//
// ── Why this type exists ─────────────────────────────────────────────────────
//
// `BookCard` is a client component, so everything handed to it is serialised
// into the RSC flight payload and shipped in the document. It was taking a
// whole `Book`, and reads 13 of its fields. Fields the card never renders
// therefore appeared once per card in every listing document: `isbn`,
// `publisher`, `availability`, `pages`, `year`, `summary`, `tags`.
//
// A narrower prop type is the fix, but the TYPE is the point rather than the
// mapping: passing a whole `Book` again has to become a type error, or the
// next shelf added will pass one and nobody will measure it.
//
// ── Narrowing the interface alone did NOT do that ────────────────────────────
//
// TypeScript's excess-property check fires only on object LITERALS. Every
// call site here passes a variable — `<BookCard book={book} />` — and a
// `Book` variable is structurally assignable to a plain field list, so the
// narrowed interface compiled, shipped, and serialised exactly as much as
// before. The rule looked enforced and enforced nothing.
//
// Hence the BRAND: a phantom `unique symbol` key that only this module can
// produce. It exists in the type system and nowhere else — no runtime value
// is ever assigned to it, so it cannot reach the flight payload (pinned in
// lib/books/card-data.test.ts, and measured in reports/seo/weight-after.json).
// A `Book` variable now fails to assign because it lacks the key, and the
// only way to obtain one is `toBookCardData`/`toBookCardList`.
//
// The brand is necessary and not sufficient: a call site can still reach for
// `as BookCardData`, and a NEW client component can take the wide type and
// never come here at all. Those two escapes are what the source scan in
// lib/books/card-data.test.ts watches.
//
// ── It is also a security boundary, deliberately ─────────────────────────────
//
// `Book` carries `pdfUrl`. This does NOT, and must not: 0131 established
// that a storage URL reaching a client payload is a permanent, credential-
// free download link, and 0151 made a book's file policy meaningful. A card
// shows a cover, a title and some counts; it has never needed a file
// address. `lib/books/storage-url-exposure.test.ts` guards the value side,
// and the absence of the field here is the structural half.

/**
 * Phantom brand. `declare const` means it is DECLARED and never defined:
 * there is no runtime symbol, no property, and nothing to serialise.
 */
declare const CARD_DATA_BRAND: unique symbol;

/**
 * The fields, unbranded.
 *
 * This is the INPUT shape — what a row must carry to be narrowed. It is
 * deliberately not the prop type: assignability to it is exactly the hole
 * the brand closes.
 */
export interface BookCardFields {
  slug: string;
  title: string;
  author: string;
  /** Cover image URL, or null for the generated cover. */
  coverUrl?: string | null;
  /** Fallback tint for the generated cover. */
  cover?: string | null;
  category?: string | null;
  department?: string | null;
  rating?: number | null;
  reviewCount?: number;
  viewCount?: number;
  downloadCount?: number;
  /** ISO timestamp — drives the "new" badge. */
  createdAt?: string;
  /** Continue-reading variant only. */
  lastReadAt?: string | null;
  progressPct?: number;
  /** Row id, for the save/list controls. */
  dbId?: string | null;
}

/**
 * A book as a card renders it — obtainable only from `toBookCardData`.
 *
 * The brand is type-only. At runtime a `BookCardData` is a plain object with
 * the fields above and no extra key.
 */
export type BookCardData = BookCardFields & {
  readonly [CARD_DATA_BRAND]: true;
};

/**
 * The superset a card may be built FROM — any row shape carrying the fields.
 *
 * Deliberately NOT intersected with `Record<string, unknown>`: TypeScript
 * gives an implicit index signature to type ALIASES and not to interfaces,
 * so that intersection quietly refused every interface-typed row — and
 * refused `BookCardData` itself, which made the mapper non-idempotent.
 * A wider row is accepted because excess-property checks do not apply to a
 * variable, which is the one place that laxness is what we want.
 */
export type BookCardSource = BookCardFields;

/**
 * Narrow a row to exactly what a card renders.
 *
 * Explicit field-by-field, not a rest-destructure: a spread keeps whatever
 * it is given, which is the behaviour this function exists to stop. Adding
 * a field to `Book` must not silently add it to every card payload.
 *
 * The cast is the one place in the repo that may mint the brand, and it is
 * applied to an object literal listing every field — so the compiler still
 * checks the shape, and the cast only adds the phantom key.
 */
export function toBookCardData(book: BookCardSource): BookCardData {
  return {
    slug: book.slug,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl ?? null,
    cover: book.cover ?? null,
    category: book.category ?? null,
    department: book.department ?? null,
    rating: book.rating ?? null,
    reviewCount: book.reviewCount,
    viewCount: book.viewCount,
    downloadCount: book.downloadCount,
    createdAt: book.createdAt,
    lastReadAt: book.lastReadAt ?? null,
    progressPct: book.progressPct,
    dbId: book.dbId ?? null,
  } satisfies BookCardFields as BookCardData;
}

/** Narrow a list. */
export function toBookCardList(books: readonly BookCardSource[]): BookCardData[] {
  return books.map(toBookCardData);
}
