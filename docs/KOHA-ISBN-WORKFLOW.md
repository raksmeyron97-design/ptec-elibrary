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

## Fetch by ISBN — an existing record

The edit form has the same lookup beside its ISBN field ("Fetch details via
ISBN"), for records that came in thin — the PMB migration left most without a
description, publisher or year. Its rules (`lib/isbn/enrich.ts`) differ from
Add by ISBN's because the record already says which book it is:

- The candidates are merged field by field: the description from Google Books
  (Open Library's provider never returns one), publisher, year and the cover
  from Open Library, subjects as keywords.
- An **empty** field is filled. A field that **already holds something
  different** is offered with a tick box and changes only when ticked. A
  description that merely restates the record
  (`lib/catalogs/derived-description.ts`) is offered pre-ticked. A found cover
  is offered only to a record showing the generated one.
- **Nothing is filled while the found title disagrees with the record's.** A
  mistyped ISBN fetches a real book: `9781853963285`, once given for Fidler's
  *Strategic management for school development*, is Open Library's
  *Educational management today* (1996). The librarian can override.
- It saves nothing; Save does, through the ordinary update path (and the Koha
  write, for a record Koha owns).

`scripts/enrich-catalog-book.ts` does the same from a terminal, plus an
`--abstract` mode for books with no ISBN (the author's own abstract, typed or
pasted by the librarian — no AI). It is a dry run without `--apply`, replaces a
differing value only when named in `--replace`, and prints the MARC21
(`020`, `041`, `264`, `520`, `653`) for Koha, where publisher, year, language
and ISBN have to be set to last (docs/KOHA-SYNC.md).

## Fetch from publisher link — "About this book"

Open Library and Google Books often have no description for academic books;
the publisher's own page does. "About this book / Description" sits on the
first tab of both catalogue forms (it was on "Cover & SEO", where cataloguers
did not find it) with a link box above it: paste the publisher's page, press
Fetch (`publisher-actions.ts`).

- **Which text** (`lib/catalogs/publisher-description.ts`): the page's own
  "About this book" section (Springer's `section[data-title]`, or a real
  heading named Description / Synopsis / Summary / Overview), else the
  LONGEST of JSON-LD, `og:description` and `meta description`. Measured
  2026-10-04: Springer's JSON-LD cuts the text at 200 characters, its meta
  tag has all 1,732; SAGE's meta tags end in "...". A text ending in an
  ellipsis is flagged as shortened.
- **No text on the page, but a DOI in the URL** (Springer, Wiley, T&F): the
  Crossref abstract, when Crossref has one.
- **The User-Agent is the library's own** (`PTEC-eLibrary/1.0`). Springer
  serves it the real page and serves a browser-imitating one a JavaScript
  challenge. Bot walls (Springer's, Cloudflare, AWS WAF — OUP answers 202)
  are recognised and reported as such: the librarian copies the text by hand.
- An empty field is filled; an existing description is replaced only after
  a confirmation that shows the new text. Nothing is saved until Save.

## Safety

- **Publisher links are fetched by the server** (`lib/net/public-fetch.ts`),
  which sits on the ZimaOS box's LAN. Only http(s) on ports 80/443, no
  credentials in the URL, no single-label or `.local` names; every address a
  name resolves to must be public unicast, checked in the socket's own DNS
  lookup (so DNS rebinding gets no socket); IP literals are checked before
  connecting; redirects are followed by hand, at most 4, each re-checked; the
  body is read to 3 MB after decompression; only HTML is read. Rate-limited to
  30 fetches per 10 minutes per librarian (`RL_PUBLISHER_FETCH_PER_10MIN`).
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
