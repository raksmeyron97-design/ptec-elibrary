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
| **Open Library** | `/isbn/<isbn>.json` for the edition; `/search.json?isbn=` for **author names and subjects only**, in parallel | Measured 3.0–3.7 s for the edition and ~0.9 s for search, so they run together with 10 s each (a 6 s budget timed out a real lookup). `/api/books?bibkeys=` answered 404 for an ISBN the edition endpoint resolves. The search endpoint answers at the WORK level — for *Effective Java* it listed four publishers, five years and three languages — so taking a publisher or year from it would put another edition's facts on this record. Authors don't vary by edition. |
| **Google Books** | `/books/v1/volumes?q=isbn:` | Keyless requests are charged to Google's shared default project, whose daily quota was **already exhausted** (429). With `GOOGLE_BOOKS_API_KEY` set it is dependable; without, it pauses itself for an hour after each 429 and the panel says an API key would lift it. A volume is kept only if its own identifiers carry the ISBN — Google returns near misses. |

## Covers — stored, never hotlinked

Open Library's covers redirect to `archive.org`, which the CSP does not allow
(measured: a record saved with the URL showed a broken cover), so a found cover
is never shown or stored as the provider's URL:

- **Preview** — the candidate card and the Add form show it through
  `GET /api/admin/catalogs/cover-preview?src=…` (catalogue editors only,
  rate-limited `RL_COVER_PREVIEW_PER_10MIN`), a same-origin image.
- **Save** — the form sends `cover_mode=import`; the server re-validates the
  source, fetches it, and runs it through the ordinary cover pipeline (magic
  bytes, 300×450 minimum, WebP re-encode, EXIF stripped) into PTEC storage's
  `catalog-covers/`. Nothing is fetched or stored until Save, so an abandoned
  form leaves no file behind.
- **Fetch rules** (`lib/isbn/cover-source.ts`) — only
  `https://covers.openlibrary.org/b/id/<id>-L.jpg`; redirects followed by hand,
  at most 4 hops, each https on `covers.openlibrary.org`, `archive.org` or
  `ia*.us.archive.org`; 5 MB cap; 20 s budget (measured 5.6–6.8 s).
- **Too small is refused, not upscaled.** The 300×450 minimum is the upload
  rule, unchanged: of six sampled Open Library covers four passed (most are
  500 px tall); one was 306×400 and one 154×210. The librarian sees the exact
  size and can upload another image.
- Google thumbnails are ~128 px wide, so none is offered.

## What is filled in, and what is not

Filled: title (with subtitle when it fits), author(s) joined with `; ` (the
byline splitter's unambiguous delimiter), ISBN-13, publisher, year, language
(the provider's, else the title's script — the CSV importer's rule), subjects as
keyword suggestions, description (Google only), and a found cover to import (Open Library).

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
