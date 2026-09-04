# Intelligent book ingestion & duplicate prevention

How a book gets into the collection, and what stops it getting in twice.

Primary surface: `/admin/books/upload` (single + bulk).
Related: `/admin/books/duplicates` (review queue), `/admin/review` (approval
queue), `/admin/edit/[id]`.

---

## 1. The rule everything else follows

**Duplicate identity is decided deterministically. A language model never
participates in it.**

Gemini may *draft* a book's metadata from its PDF
(`app/actions/ai-extraction.ts`), and that draft is labelled as a draft in the
form. But every input to the duplicate decision is a database fact or a pure
function of one, so the answer is reproducible, explainable in words, and
testable offline. "The model thought it looked familiar" is not a reason a
librarian can be given, and not a reason that can be audited.

## 2. Where the rules live

```
lib/books/duplicate-detection/
├── normalize.ts   titles, ISBNs, people, taxonomy — the ONE definition of
│                  "the same string"
├── similarity.ts  token + character similarity, no dependency
├── signals.ts     what counts as a duplicate, how strongly, and why
├── batch.ts       a whole CSV: catalogue matches AND row-against-row
├── client-hash.ts sha256 in the browser, before the upload
├── service.ts     server-only: bounded candidate fetch → the pure scorer
└── index.ts       barrel (pure modules only — service.ts is imported directly)

lib/books/upload-preflight.ts   the "ready to upload" checklist rules
```

Everything except `service.ts` is pure and browser-safe on purpose: the rules
that decide whether a librarian is blocked are unit-tested without a database.

**`lib/admin/duplicates.ts` (the review queue's grouper) re-exports
`normalizeTitle`/`normalizeIsbn` from here rather than keeping its own.** The
importer used to hold a third copy — an exact folded `title|author` key — which
is why a row sharing an ISBN with an existing book sailed through the bulk
import while a second edition was refused. Three doors into the collection, one
answer.

## 3. The signals, and what each one may do

| Signal | Evidence | Ceiling | May block? |
|---|---|---|---|
| `content_hash` | byte-identical PDF | 100 | **yes, never overridable** |
| `isbn` | same ISBN after canonicalisation | 97 | **yes, overridable once** |
| `exact_title` / `normalized_title` | same title after folding | 94 | no |
| `title_author`, `title_author_year` | corroboration on a title match | 94 | no |
| `fuzzy_title` | similar title | 94 | no |
| `title_prefix` | one title contains the other | 94 | no |

**Only an identifier reaches the blocking band.** A title, an author and a year
describe a *work*; two editions of one textbook agree on all three. The
94-point ceiling on attribute evidence (`NON_IDENTIFIER_CEILING`) is what keeps
"same title" from ever silently refusing a legitimate second edition.

Bands (`DUPLICATE_THRESHOLDS`): **95–100** blocks · **80–94** strong warning ·
**60–79** review · **below 60** is not reported at all.

### Evidence *against* identity

Two facts demote a match rather than raising it, both deterministic:

- **different valid ISBNs** — two different registered numbers cannot be one
  copy;
- **different declared editions** — `2nd Edition`, `third edition`,
  `revised ed.`, `បោះពុម្ពលើកទី២` are read out of the title itself.

### Series awareness

This collection is largely school textbooks, whose most common near-identical
pair is consecutive volumes: `…ថ្នាក់ទី៧` / `…ថ្នាក់ទី៨`, `Mathematics Grade 7`
/ `Grade 8`. Character similarity puts those in the 90s. `isSeriesVariant()`
drops a pair whose titles are identical once every digit is removed *and* whose
digit sequences differ. It is narrow on purpose — a real duplicate that differs
by more than a number is unaffected — and a shared content hash still wins.

### Boilerplate awareness

The same problem where the thing that differs is a **word**. A curriculum names
every volume `សៀវភៅណែនាំគ្រូបង្រៀន {SUBJECT} ថ្នាក់ទី{GRADE} (STEPSAM3)`, so
Chemistry and Biology share 40+ characters around a 3-character subject word.

This shipped as a real defect: a librarian importing 15 such guides had 12 of
them refused as copies of each other. The normalizer was never at fault — it
keeps Khmer letters, combining marks and Khmer digits, and the 15 titles
normalize to 15 distinct strings. `titleSimilarity()` was: it took the
`Math.max` of a token measure and whole-string edit distance, and edit distance
reads a 3-character difference inside a 50-character title as **94% alike**.
The token measure had correctly said 66 and lost the `max`.

Two changes, and they are separable:

1. **The character measure is used only where it is the only informed measure**
   — when a title tokenizes to a single token, which is the space-less Khmer
   case it was introduced for. Once both titles have words, the token measure
   decides. `fuzzyTokenRatio()` absorbs the typo case that edit distance used
   to rescue, by pairing an unmatched token with its best counterpart and
   crediting a fraction of a match: `psycology`/`psychology` still scores ~0.9,
   `ជីវវិទ្យា`/`គីមីវិទ្យា` scores 0.7 and earns nothing.
2. **`isDistinguishingVariant()`** covers the space-less case the token measure
   cannot reach: strip the shared opening and shared ending, and if what is
   left is substantial (≥3 code points) and mutually unrecognisable on both
   sides, the titles name different books. A truncation, a dropped word or a
   misspelling leaves one side empty or one character long and is untouched.

Two editions of one work no longer rely on edit distance rating them alike
either: `titleWithoutEdition()` removes the marker `editionMarker()` already
finds, and equal bases establish the same title directly. That matters for
short titles, where `Maths 2nd ed` / `Maths 3rd ed` is one character in twelve
and used to fall out of the band.

Neither rule can touch identifier evidence — a shared content hash or ISBN has
already returned by the time they run. Pinned by
`lib/books/duplicate-detection/stepsam3.test.ts`, which asserts the 15 real
titles produce **no** verdict, and that the same guide entered twice still does.

## 4. ISBN canonicalisation

`normalizeIsbn()` returns the **ISBN-13** form, so `978-1-23456-789-0` and the
ISBN-10 of the same book collapse onto one key, and legacy pre-2007 rows still
match. It is deliberately **lenient about the check digit**: two records
carrying the same mistyped ISBN are still the same record twice, and refusing to
match them is a duplicate this catalogue then keeps.

Checksum validity is a separate question, answered by `validateIsbn()` and
surfaced in the form as a field-level warning. **An invalid ISBN never blocks a
save** — a real printed ISBN can be wrong, and refusing the record loses the
book in order to save the number.

## 5. Bilingual normalization

Khmer carries meaning in combining marks (`U+17B6 ា` is a vowel sign, Unicode
category `Mn`/`Mc`, **not** a letter). A normalizer that kept only `\p{L}\p{N}`
would shred every Khmer title into a consonant skeleton and cluster unrelated
books. Marks are kept (`\p{L}\p{N}\p{M}`); Latin combining diacritics are
stripped after NFKD, so "Zoë" and "Zoe" agree. No script is romanised. The
Khmer zero-width word separator is treated as a word boundary.

Because Khmer has no spaces, a Khmer title is legitimately one token — which is
why the code-point edit distance exists at all. It is **not** blended into
every comparison: see *Boilerplate awareness* above for why a `Math.max` of the
two measures let a shared title frame outvote the words that differ.

## 6. Where the checks actually happen

```
pick PDF ──► validate type/size ──► page count ──► sha256 (browser)
                                                        │
type metadata ──► debounced check ◄─────────────────────┘
                        │
                        ▼
             pre-upload quality gate
                        │
            [blocked?] ─┴─► save refused, existing record offered
                        │
                        ▼
     upload PDF ──► /api/admin/upload re-hashes, 409 on a duplicate file
                        │
                        ▼
     saveBookRecord ──► assertNotDuplicate() — the SAME detector, at insert
                        │
                        ▼
              book_files.content_hash unique index (0060)
```

Four layers, and only the last two are load-bearing:

1. **The browser hash** is an early warning. Without it a librarian learns
   their 40 MB PDF is already in the library only after the transfer. A client
   that lies about it gains nothing.
2. **The debounced check** (`checkBookDuplicates`) is advisory. It carries the
   same permission as creating a book — `books: write` — because it reads
   unpublished and archived titles, ISBNs and author names.
3. **`assertNotDuplicate()`** inside `saveBookRecord` is authoritative. It runs
   before the slug loop and every insert, so a blocked save leaves nothing
   behind.
4. **The partial unique index on `book_files.content_hash`** is the race
   backstop for two requests that arrive together.

### Why ISBN has no unique index

A shared content hash is an *invariant*: there is no legitimate second record
of the same bytes, so the database enforces it. A shared ISBN is a **policy**:
a librarian looking at a genuine cataloguing error in the existing record can
override it. A unique index would make that override impossible. Two concurrent
saves of one ISBN can therefore both land; the pair surfaces immediately in
`/admin/books/duplicates` as a high-confidence group.

### The override, and its price

Only an ISBN collision can be overridden, only when the acknowledged book id
still matches the blocking match the server itself finds, and the result is
**never published** — it is routed to `/admin/review` so a second librarian
confirms it. Both the block and the override write an `admin_actions` row
(`book.duplicate_blocked`, `book.duplicate_override`) carrying the signal,
confidence, score and reason. No PDF content, no payloads.

## 7. Candidate generation (migration 0130)

`find_book_duplicate_candidates()` returns a **bounded candidate set** — the
rows that could plausibly match — and scores nothing. Five separately indexed,
separately capped branches: content hash, ISBN digits, exact folded title,
trigram word-similarity, ILIKE prefix, and exact author.

Normalising titles in SQL to match the TypeScript normalizer exactly was
rejected: Postgres has no NFKD + Unicode-category fold that agrees with
`normalizeTitle()` character for character, so the two would drift silently and
the drift would look like *no duplicate found*. Trigram recall cannot drift that
way — a near miss just widens the candidate set, and the scorer still refuses
it.

Both functions in 0130 are `SECURITY INVOKER` and granted to `service_role`
only. PostgREST publishes every public-schema function to `anon` by default;
a public endpoint that returns unpublished titles by fuzzy match is a catalogue
leak.

**No `SET pg_trgm.word_similarity_threshold` in the function.** A `SET` clause
is validated at `CREATE FUNCTION` time and an extension's custom GUC is only
registered once its library has loaded, so a migration that happens to be the
first thing to touch pg_trgm fails with `permission denied to set parameter`.
Verified against the local stack.

## 8. Author memory

`saveBookRecord` upserts `authors` by exact name, so "Sok Dara", "sok dara" and
"Dr. Sok Dara" became three people, each owning part of one person's shelf.
`AuthorPicker` fixes that where it happens — at typing time — by offering
existing records with their book counts and attaching the book to the chosen
row **by id**.

Rules it will not break:

- **Exact normalized equality is the only identity.** "J. Smith" and "John
  Smith" produce different keys on purpose.
- **A fuzzy suggestion is labelled fuzzy** ("Similar name — confirm this is the
  same person"), and picking it is a human act.
- **The canonical id detaches the moment the name is edited** — an id that
  outlived the name it stood for would attach the book to the wrong person.
- **Nothing merges.** Merging is a separate, audited workflow
  (`mergePublicationAuthors`), because deleting an author row cascades to their
  bylines.
- A client-supplied author id is verified to exist before it becomes a foreign
  key; anything else falls back to upsert-by-name.

Category, department and publisher get the same treatment at a smaller scale:
`findTaxonomyByName()` folds case and padding, so "education" resolves to the
existing "Education" instead of minting a second row. It never renames or
merges an existing value.

## 9. Bulk import

`findAlreadyImported()` runs once over the whole CSV before anything is
transferred, and now uses the canonical detector. It adds the two things a
batch has and a single upload does not:

- **row-against-row** — two lines of one CSV can be the same book, and no check
  against the catalogue can see that because neither row exists yet. Each row is
  scored against the rows *before* it, so exactly one of a pair is flagged;
- **one catalogue read for the whole file** — 86 rows must not become 86 round
  trips.

Row outcomes: an identifier collision or a strong match **pre-skips** the row
(the file is never transferred); a *possible* match is flagged and still
uploaded, because same-title-alone is also how a second edition looks and
silently dropping those rows would lose books to protect against a maybe.

The pre-flight cannot see content hashes — it runs before any file is read — so
`/api/admin/bulk-upload`'s 409 remains the file-identity guarantee.

## 10. The audit script

```bash
npx tsx scripts/audit-book-duplicates.ts          # human-readable
npx tsx scripts/audit-book-duplicates.ts --json   # machine-readable
```

Read-only, by design. It reports duplicate books, author records that fold to
one name, author records that *might* be one person, and taxonomy values that
fold together. It changes nothing: merging authors moves bylines and retiring a
book takes it off the public shelf, so both stay deliberate admin workflows
with an audit trail.

## 11. Tests

| File | What it pins |
|---|---|
| `lib/books/duplicate-detection/normalize.test.ts` | title/ISBN/person/taxonomy folding, English and Khmer |
| `lib/books/duplicate-detection/similarity.test.ts` | the ORDER of similarity answers, not exact numbers |
| `lib/books/duplicate-detection/stepsam3.test.ts` | 15 real Khmer teacher's guides produce no false duplicate |
| `lib/books/duplicate-detection/signals.test.ts` | bands, the identifier-only block, edition + series awareness |
| `lib/books/duplicate-detection/batch.test.ts` | row-against-row, and parity with the single-upload verdict |
| `lib/books/duplicate-detection/service.test.ts` | RPC contract, degradation, "a failure is a failure" |
| `lib/books/upload-preflight.test.ts` | what blocks vs what warns |
| `app/actions/book-duplicates.test.ts` | authorization, input clamping, hostile payloads |
| `components/admin/books/DuplicateAlert.test.tsx` | the three states, the override, the announcements |
| `components/admin/books/AuthorPicker.test.tsx` | identity attaches only by human choice, and detaches on edit |
| `lib/admin/upload-duplicate-messages.test.ts` | every ICU message formats in **both** catalogues |

## 12. Known limitations

- **`/admin/edit/[id]` does not run the live gate.** `updateBook` accepts a
  canonical `authorId` and the detector supports `excludeBookId`, but the edit
  form itself still uses a plain author text box and shows no duplicate panel.
  Editing a title into an existing one is caught by `/admin/books/duplicates`,
  not at the point of the edit.
- **The bulk pre-flight has no content hashes**, so a re-compressed re-export of
  a book already held is only caught by title/ISBN, or at upload by the 409.
- **Two concurrent saves can share an ISBN** — see §6.
- **Candidate generation is capped** at 40 rows; a truncated sweep is reported
  as truncated rather than presented as complete.
- **Cross-type duplicates** (a book that is also catalogued as a thesis) are not
  scored here. `findDuplicatePdf()` still covers the file-identity case across
  `book_files` and `research_reports`.
