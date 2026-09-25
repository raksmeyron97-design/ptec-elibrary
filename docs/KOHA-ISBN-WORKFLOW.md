# Add by ISBN

**Status (2026-09-25): Phase 4.** `/admin/catalogs/add` opens on an ISBN
lookup. It fills in the ordinary Add form for the librarian to review; it never
saves anything by itself. Until Koha is live, "save" means a PTEC catalogue
record, through the unchanged `addCatalogBook` action. Writing to Koha is
Phase 5.

## The flow

```
scan / type ISBN
  → validate (strict: a bad check digit is refused, never corrected)
  → PTEC duplicate?  catalog_books.isbn, both ISBN-13 and ISBN-10
       yes → "Already in the catalogue": Open record · Add copies
             (providers are not asked unless the librarian says it is a different record)
  → Koha duplicate?  GET /biblios, when the Koha integration can read;
                     "not connected yet" otherwise
  → cache            isbn_metadata_cache (found 90 days, not found 7, errors never)
  → providers        Open Library and Google Books, in parallel
  → candidates       one card per edition, with its source
  → "Use this record" → the Add form, pre-filled, with a note saying where from
  → the librarian reviews, sets category / department / DDC / shelf, and saves
```

A USB barcode scanner types the digits and presses Enter, so scanning needs no
special support. The ISBN field is focused when the page opens.

## Providers — measured, not assumed

| | What we use | Why |
|---|---|---|
| **Open Library** | `/isbn/<isbn>.json` for the edition; `/search.json?isbn=` for **author names and subjects only** | `/api/books?bibkeys=` answered 404 for an ISBN the edition endpoint resolves. The search endpoint answers at the WORK level — for *Effective Java* it listed four publishers, five years and three languages — so taking a publisher or year from it would put another edition's facts on this record. Authors don't vary by edition. |
| **Google Books** | `/books/v1/volumes?q=isbn:` | Keyless requests are charged to Google's shared default project, whose daily quota was **already exhausted** (429). With `GOOGLE_BOOKS_API_KEY` set it is dependable; without, it pauses itself for an hour after each 429 and the panel says an API key would lift it. A volume is kept only if its own identifiers carry the ISBN — Google returns near misses. |

**No cover is offered.** Measured 2026-09-25: `covers.openlibrary.org` is in the
site's CSP but redirects to `archive.org`, which is not, so the browser refused
the image — and a record saved with that URL would show a broken cover on its
public page. Google's image host is not in the CSP at all. The fix is to copy a
chosen cover into PTEC storage through the existing cover pipeline (a follow-up);
widening the CSP to a user-content host is not.

## What is filled in, and what is not

Filled: title (with subtitle when it fits), author(s) joined with `; ` (the
byline splitter's unambiguous delimiter), ISBN-13, publisher, year, language
(the provider's, else the title's script — the CSV importer's rule), subjects as
keyword suggestions, description (Google only). No cover (see above).

**Not filled: category, department, DDC, shelf.** A provider's subjects are not
PTEC's taxonomy, and a plausible-looking wrong category is worse than an empty
one the librarian notices.

## Safety

- Server-side only: the lookup is a Server Action behind `catalog: write`,
  rate-limited to 60 lookups per 10 minutes per librarian
  (`RL_ISBN_LOOKUP_PER_10MIN`). Provider URLs are constants; only digits reach them.
- `GOOGLE_BOOKS_API_KEY` is server-only and never appears in an error message.
- `isbn_metadata_cache` (migration `0156`) has RLS enabled and is revoked from
  every API role; only the service client reads or writes it.
- Nothing is written to the catalogue, and nothing to Koha, without a person
  pressing Save.

## Checking it

`npx vitest run lib/isbn lib/koha/biblios.test.ts` covers valid, invalid,
ISBN-10, ISBN-13, duplicate, provider failure, no result and multiple results.
Open Library fixtures are recorded responses; the Google volumes fixture is
**synthetic** (documented shape) because every keyless request was refused when
the fixtures were captured — it is labelled as such in its own file.
