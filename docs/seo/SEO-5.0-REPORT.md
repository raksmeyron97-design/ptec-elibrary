# SEO 5.0 — Final Report

Programme run 2026-09-19 → 2026-09-21, in two pull requests. Every figure
below carries how it was established: **VERIFIED_PRODUCTION** (read from the
live site with a GET), **VERIFIED_LOCAL** (measured against a local
production build on the seeded database), **INFERRED** (computed from
measured inputs, not observed), or **UNKNOWN**.

Rights-review material — which titles, which publishers, which counts — is
deliberately not in this document. It lives in git-ignored working notes.

---

## 1. Executive summary

SEO 5.0 set out to grow reach. Two thirds of the work turned out to be
about **not claiming things that are not true**, and the rest about
measuring what had never been measured.

What shipped:

1. **A file-access policy the whole app agrees on.** A book can now be
   published as catalogue-only, and one pure function decides it for the
   download route, the file route, the AI retrieval path, the citation
   metadata, the metadata exports and the UI — so a drawn button and a
   served byte stream cannot disagree.
2. **Khmer page numbers are page numbers.** The furniture filter that keeps
   tables of contents out of AI evidence used an ASCII-only digit class, so
   it had never once fired on a Khmer page. Measured over 20,000 production
   pages: Khmer pages refusing an evidence slot **19.01% → 23.63%**; Latin
   unchanged at 10.87%.
3. **A page-weight budget.** Page size was not measured by anything, and
   the homepage had grown ~60 KB between two audits with nobody choosing
   it. There is now a committed instrument, a committed threshold, and a
   check that exits non-zero.
4. **Honest access claims.** Three surfaces said no account was needed to
   read. Reading a file requires one. Fixed in both locales.

What did **not** ship, deliberately: no URL, canonical, hreflang or schema
`@type` changed, and no new URL family was created.

---

## 2. Changes made

| # | Change | Evidence |
|---|---|---|
| 01 | Rights-signal classifier (pure) + a public-site-only exposure audit | VERIFIED_LOCAL |
| 02 | `file_access` ∈ public / read_online / catalogue_only, mirrored from the old boolean by a trigger; every reader routed through one function | VERIFIED_LOCAL |
| 03–06 | Khmer furniture detection, the ASCII-class sweep, importer rules | VERIFIED_PRODUCTION |
| 07 | A "(PDF)" cue in book titles, behind a flag that is **off everywhere** | VERIFIED_LOCAL |
| 08 | Counts-only production dry run of table-of-contents coverage | VERIFIED_PRODUCTION |
| 09 | Book cards carry only what they draw; page-weight budget | VERIFIED_LOCAL + VERIFIED_PRODUCTION |
| 13 | Access claims corrected on three surfaces, both locales | VERIFIED_LOCAL |

SEO5-10 was declined by the owner. SEO5-11 (handoff) is owner-facing and
lives outside this repo's public docs.

---

## 3. Two numbers this programme had to correct about itself

**A figure that never held.** SEO 4.x reported that furniture in retrieved
evidence fell 21.0% → 1.2%. That was measured with an ASCII-only locator
class, so it never described a Khmer page at all. Corrected in `CLAUDE.md`
and restated as what was actually measured: a *corpus refusal rate*, not a
retrieved-evidence share, and the retrieved-evidence figure needs a paid
benchmark run to restate.

**A claim about a type that was false.** SEO5-09 narrowed a client
component's prop type and reported it as enforcing the rule. It enforced
nothing: TypeScript's excess-property check fires only on object literals,
and every call site passes a variable. See §5.

---

## 4. Tests added, each with a negative control

| Test | Rule |
|---|---|
| `lib/books/file-access-boundary.test.ts` | the access gate sits above the auth check and above the crawler check, so a refusal happens before any storage fetch |
| `lib/semantic/contents-dry-run.test.ts` | the production dry run has no write path, prints its target host before opening a client, and contains no `.limit()` above 1,000 |
| `lib/books/card-data.test.ts` | every book-card call site goes through the mapper; nothing casts its way to the type; the brand is type-only and reaches no payload; no file address is declared or emitted |

Negative controls were run, not assumed. The card-data scan named exactly
the seven unmapped call sites and the one cast before the fix, and passes
after. The page-weight budget was run against the pre-fix build and exits 1.

**A limitation recorded rather than hidden:** one early negative control
used `if (false && …)`, which leaves the forbidden string in the source, so
the source scans still passed. That is why the file-access work also has
behavioural route tests.

---

## 5. Why a narrower type was not enough

A book card is a client component, so everything passed to it is serialised
into the document's payload — once per card. It read 13 fields and was
handed a whole book record.

Narrowing the prop type changed nothing measurable. TypeScript's
excess-property check applies to object *literals*; every call site passes a
variable, and a wide variable stays structurally assignable to a narrow
field list. The rule looked enforced and was not.

Three layers now, each covering a hole in the others:

1. a **phantom brand** — a `unique symbol` only the mapper module can mint,
   declared and never defined, so it emits nothing at runtime;
2. a **source scan** for the two escapes a brand cannot close — a cast, and
   a call site that never reaches the mapper;
3. **mapping at the serialisation boundaries**, which is where the bytes are
   decided.

The rendered card markup is byte-identical before and after: 42 cards across
six surfaces in both locales, `diff` returns nothing, both captures hash the
same.

---

## 6. Page weight, measured

**VERIFIED_PRODUCTION**, 2026-09-21, uncompressed document:

| page | document | payload | payload share | brotli q5 |
|---|---:|---:|---:|---:|
| `/` | 864.3 KB | 438.3 KB | 50.7% | 94.4 KB |
| `/km` | 981.6 KB | 537.4 KB | 54.7% | 102.2 KB |
| `/books` | 658.0 KB | 295.3 KB | 44.9% | 71.1 KB |
| a book page | 453.3 KB | 253.5 KB | 55.9% | 64.0 KB |

Of that, **49.1 KB** on `/` and **49.4 KB** on `/km` is record fields no card
renders — 836 key/value pairs, of which a single long text field is 31.0 KB,
repeated once per card and drawn nowhere.

**VERIFIED_LOCAL** — two production builds of the same tree, both warmed,
same seeded database:

| page | before | after | change |
|---|---:|---:|---:|
| `/` | 670.7 KB | 659.6 KB | −11.1 KB (−1.7%) |
| `/km` | 786.4 KB | 774.5 KB | −11.9 KB (−1.5%) |
| `/books` | 394.8 KB | 390.7 KB | −4.1 KB (−1.0%) |
| a book page | 393.1 KB | 392.6 KB | −0.5 KB (−0.1%) |

**INFERRED** — the local database holds 6 published books and production
holds 1,956, so the local totals do not transfer. Multiplying the measured
per-card cost by the real card counts projects roughly **−5 to −6%** of the
uncompressed homepage. Compressed, 5–10% of each removed byte survived
Brotli in the local pair, so the download saving is nearer **4 KB of
94 KB**. Neither has been observed and both are listed in §8.

### State the scale plainly

The card fix removes about **49 KB from a ~880 KB homepage** before
compression, and considerably less after. It is worth doing and it is not
the headline. **The lasting result of SEO5-09 is the budget.**

### Where the rest of the weight is — the next targets

| item | size on the Khmer homepage | |
|---|---:|---|
| class-name strings in the payload | **91.8 KB** | the same markup shipped twice, once to render and once to hydrate — structural, and the largest single item |
| inline SVG | **81.7 KB** | icons inlined per instance rather than referenced |
| fields no card renders | 49.1 KB | what SEO5-09 removes |
| the locale-cookie object | 2.9 KB | repeated per link, but 70 of 71 occurrences are back-references the framework already dedupes — small, and recorded so nobody spends a day on it |

---

## 7. Two measurement defects found before any number was published

Either alone would have produced a figure that lied.

**A cold first request is not the page.** The first hit after a server start
fills the render cache and streamed ~4.8 KB more on the book page than every
request after it — enough to turn a 0.5 KB saving into a 4.3 KB
"regression". The instrument now warms each page and discards the answer.

**Message keys are not data.** The translation catalogues contain entries
whose key is a field name and whose value is that name humanised. The metric
counted them, giving it a floor it could never reach, so a finished fix read
as unfinished. Filtered by comparing key and value letter-for-letter.

**And a build with no database exits 0.** A build begun while the local
database was down printed `Generating static pages (125/125) ✓` with no
error, having rendered every page empty. It measured 26% smaller and the
metric under test read as already fixed. The run was discarded and redone.

---

## 8. NEEDS PRODUCTION VERIFICATION

Nothing in §6 measures the fix *on production*, because the fix is not
deployed. These close it, all read-only:

```sh
# page weight, after deploy — compare against the committed baseline
npx tsx scripts/measure-page-weight.ts \
  --base https://library.ptec.edu.kh --book "/books/<a-real-slug>" \
  --compare reports/seo/weight-production-2026-09-21.json

# the depth gate and the crawl graph
npx tsx scripts/audit-crawl-depth.ts

# the access gate, against a book actually set to catalogue-only
curl -sI https://library.ptec.edu.kh/api/books/<slug>/download   # expect 403
curl -sI https://library.ptec.edu.kh/api/books/<slug>/file       # expect 403
```

Also owed: confirm the sitemap's book count still matches the listing's own
total, and that the library entity no longer lists the institution's website
as one of its own profiles.

**One trap to expect.** A cached render can make a correct fix look
reverted. If a check disagrees with the code, invalidate the relevant cache
tag before concluding anything.

---

## 9. What is NOT verified

- The production effect of SEO5-09 (§8).
- The retrieved-evidence share of furniture after the Khmer fix. The corpus
  refusal rate was re-measured; the retrieval figure needs a paid benchmark
  run and was not spent.
- Table-of-contents coverage was measured as counts only. Whether those
  tables of contents are *usable* as structured data is a separate question
  and is blocked on text extraction preserving line breaks.

---

## 10. Future work

- **Line structure in extracted page text.** A table of contents is only
  machine-readable while its line breaks survive. Whatever writes page text
  next — in particular the Khmer OCR batch — should store line-structured
  text and collapse at query time, not before.
- **The two large payload items in §6**, in that order: duplicated markup,
  then inline SVG.
- **Dead code found on the way:** the infinite-scroll grid component and its
  server action are imported by nothing. Both were narrowed anyway, because
  an action's return value is serialised exactly like a payload, but they
  save nothing today. Delete them or wire them back in — not done here,
  because deletion is unrelated review surface.
- **Rotating a storage object when a book is restricted.** Restricting a
  book stops every route from serving it; it does not invalidate an address
  someone already holds.
