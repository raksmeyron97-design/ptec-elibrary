# Book curation — "Featured by PTEC Library"

*Migration `0149_books_featured.sql`. Rules: `lib/books/featured.ts`.
Mutations: `app/actions/featured-books.ts`. Admin: `/admin/books/featured`.
Public: the shelf at the top of `/books`.*

## Why this is a third axis

A book in this library has three independent facts about it, and the product
breaks the moment two of them are collapsed into one:

| Axis | Column(s) | Question it answers |
|---|---|---|
| Publication | `status` (0086) → `is_published` | Can a reader reach it? |
| Verification | `verified_at` / `verified_by` (0062) | Has a librarian checked the metadata? |
| **Curation** | `featured_at` / `featured_by` / `featured_position` (0149) | Did the library choose to promote it? |

So: **verified ≠ published**, **featured ≠ published**, **unfeature ≠
unpublish**, **unfeature ≠ reject**. `unfeatureBook()` writes only the three
curation columns — `status`, `is_published` and `verified_at` do not appear in
its update object at all, and `lib/books/featured.test.ts` fails if they ever
do. That is the structural version of the promise the confirmation dialog
makes to the librarian in words.

## Why three columns and not `is_pinned`

A boolean answers "is it featured?" and nothing else. The management page has
to answer "who chose this?", "when?" and "in what order do readers see them?"
— provenance a boolean would push into the audit log where the row cannot
render it, and an order that would fall back to `created_at`, which is
merchandising by accident.

`featured_by` is `ON DELETE SET NULL`: a staff account being removed must
never take the shelf down with it, and the `admin_audit_log` keeps the full
provenance regardless. The public view (`books_with_stats`) deliberately does
**not** carry `featured_by` — "Featured by PTEC Library" is an institutional
credit, the reader has no use for a staff profile id, and publishing one to
`anon` would be a disclosure with no reader-facing purpose.

## Eligibility

Published **and** verified, both — `assessFeatureEligibility()`, one pure
function asked by the row menu (to decide whether to draw the control), by the
confirmation dialog (to preview the refusal) and by the Server Action (against
the live row, which is the boundary). Featuring an unverified book would put
the library's name on the front of `/books` next to a record whose own
citation box still says it has not been checked.

It is **not** a CHECK constraint: a book that is later unpublished must not
make its own row un-updatable. Instead `featuredRowWarning()` flags such a row
on the management page — visibly wrong, still there, the librarian decides. The
public shelf filters on `is_published` regardless, so an unpublished book
leaves readers' view immediately whether or not anyone curates it off.

## Ordering, and the two concurrency guards

Positions are 1-based and contiguous, maintained **only** by
`public.set_featured_book_order(uuid[])`. Renumbering row by row collides with
the partial unique index the moment two books swap (a plain index cannot be
deferred), so the function parks every live row in the negative space in one
statement and then places them.

The same function is the concurrency authority. The caller must name **exactly**
the set it saw; a mismatch raises SQLSTATE `40001` and the whole renumber rolls
back. There is no half-applied order, and a librarian working from a page
rendered before a colleague featured something is told the shelf changed rather
than silently moving their colleague's book. `reorderFeaturedBooks()` checks the
same thing in TypeScript first (`isReorderOf`) so a stale page is refused before
it spends a write — but the guarantee is the database's.

The management page reorders as a **draft**: moves are local, a bar appears the
moment the order differs from the server's, and nothing reaches `/books` until
"Save order". Every other list in the panel commits on interaction; this one
publishes a public ordering, and a mis-drop that instantly reshuffles what
readers see is not recoverable by pressing the thing again.

Drag is the shortcut, never the mechanism: **Move up / Move down are real
buttons calling the identical `moveItem()`**, focus follows the moved row and a
live region announces where it landed. The `draggable` attribute and the arrows
are hidden together for a read-only viewer — leaving the row draggable while
hiding the arrows is a control that only looks gone.

## There is no maximum

`FEATURED_BOOKS_MAX` is `null`, and stays null — no product requirement sets
one, and inventing a round number would be a policy nobody decided.
`PUBLIC_FEATURED_RENDER_LIMIT` (24) is a separate thing: a **render** bound on
one section of a listing page, so a mis-click cannot push the whole collection
below a hundred promoted cards. Do not conflate them.

## Authorization and audit

One route policy and one action policy in `lib/admin/access-policy.ts`:

- `books.featured` — route `/admin/books/featured`, `perm("books", "read")`.
  Seeing what the library promotes is part of knowing the collection.
- `books.featured.view` — `perm("books", "read")`, the shelf read.
- `books.feature` — `perm("books", "write")`, all three mutations. One id
  because they are the same authority over the same public surface; splitting
  them would create ids no configuration could hold apart.

Client controls ask through `useCan("books.feature")`; the server re-decides in
`requireAction`. Audit rows go to `admin_audit_log` through `logAdminAction` —
`book.featured`, `book.unfeatured`, `book.feature_reordered`. There is no second
audit mechanism and no new table.

Curation is deliberately **excluded from `content_versions`** (0149 adds the
three columns to `capture_content_version`'s volatile list): reordering a
twelve-book shelf would otherwise write twelve row snapshots per save and bury
the metadata edits version history exists for. Version history answers "what did
this field say before?"; the audit log answers "who did what, when".

## Cache invalidation

`revalidateShelf()` calls `revalidateBook(slug, { affectsHome: false })` — the
shelf lives on `/books`, which that helper already covers in both locales, plus
the two admin paths. `affectsHome` is false because the homepage shelves are
ranked by download and view counts and curation does not feed them. Never write
`revalidatePath("/books")`: public routes are keyed `/en/books` and `/km/books`,
so the bare call is a silent no-op.

## Degradation before the migration

Every read has a `42703` path. `lib/admin/ebooks.ts` remembers the columns are
missing and drops them from its select; `getFeaturedBooksAdmin()` answers
`unavailable` and the page says so in words; `getFeaturedBooks()` answers an
empty shelf and the public section simply does not render. The workspace never
goes down because a migration has not been applied yet.
