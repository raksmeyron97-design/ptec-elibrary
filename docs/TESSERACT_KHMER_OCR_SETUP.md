# Self-hosted Khmer OCR (Tesseract)

**ការស្គាល់អក្សរខ្មែរ (OCR) ដំណើរការនៅលើម៉ាស៊ីនរបស់យើងផ្ទាល់ — គ្មានការចំណាយលើ API ទេ**

Recovery pipeline for books whose PDF text layer cannot be read, or cannot be
trusted. Recognition runs locally with open-source Tesseract; **no OCR API is
called and nothing is billed per page.**

| Piece | Where |
|---|---|
| Candidate audit (read-only) | `scripts/audit-scanned-books.ts` |
| Queue | `scripts/scanned-books-queue.json` |
| OCR engine | `scripts/ocr-khmer-tesseract.ts` |
| Rules (pure, unit-tested) | `lib/ocr/` |
| Container | `infra/ocr/` |

---

## 1. Why this exists

Extraction already works for most of the collection. `lib/pdf-page-index.ts`
reads a PDF's text stream with pdf.js and writes one row per page into
`book_pages` — which is what powers "found inside" page hits in
`/api/search/native`, and what every AI citation is drawn from.

Three failure classes defeat it, and only the third has a cheap fix.

### A. Scanned PDFs — the page is a picture

The text stream is empty because the characters were never in the file. pdf.js
recovers nothing, `resource_index_state` records `no_text_layer`, and the book
is correctly marked as holding no searchable text. **OCR is the only path.**

In production this is 218 published books.

### B. Legacy Khmer fonts — the characters are wrong

Limon, ABC and early Khmer OS PDFs display Khmer correctly on screen while
storing Latin-1/Latin-Extended code points internally, because the font carries
no usable ToUnicode CMap. Extraction *succeeds*, `analyzeTextHealth`
(`lib/semantic/text-quality.ts`) calls it `khmer-legacy-font`, and what is
stored spells nothing:

```
stored:  យុ ទ ស ប េ ងៀ ន ទំ េនើ ប
actual:  យុទ្ធសាស្ត្របង្រៀនទំនើប
```

**OCR is the only path** — the characters that spell the words are not in the
file at all.

### C. Fragmented Khmer — the characters are right, the arrangement is not

A coeng or a vowel emitted with spaces around it: `អ្ ន ក` for `អ្នក`. Every
code point is correct and merely misplaced.

**OCR is the WRONG tool here.** `lib/text/khmer-reassemble.ts` repairs this
deterministically, in milliseconds, for free, and without inventing a single
code point — the repair is *forced* by Khmer orthography, because a dependent
vowel cannot begin a syllable and a coeng must sit between two consonants. Run
`scripts/repair-khmer-reassemble.ts` instead. In production this is 73 books
that the OCR audit deliberately refuses to queue.

### Why reassembly cannot substitute for OCR

The reassembler only ever *removes whitespace between existing code points*. It
never inserts a character and never replaces one:

| Damage reason | Characters | Fix |
|---|---|---|
| `khmer-coeng-detached` | present, misplaced | reassembly |
| `khmer-vowels-orphaned` | present, misplaced | reassembly |
| `khmer-glyph-spacing` | present, misplaced | reassembly (opt-in rule 4) |
| `khmer-coeng-missing` | **absent** | OCR |
| `khmer-legacy-font` | **substituted** | OCR |
| no text layer | **absent** | OCR |

`lib/ocr/candidates.ts` encodes exactly that split, and
`lib/ocr/candidates.test.ts` pins it.

---

## 2. The pipeline

```
book_pages  ·  resource_index_state  ·  damaged-khmer-books.json
        │
        ▼
scripts/audit-scanned-books.ts                        (READ-ONLY)
        │
        ▼
scripts/scanned-books-queue.json
        │
        ▼
scripts/ocr-khmer-tesseract.ts
        │
        ├─ resolve the storage URL    lib/pdf-page-index.ts → lib/zima.ts allow-list
        ├─ stream the PDF to disk
        │
        ├─ per page:
        │     pdftoppm -r 300 -gray -png -singlefile
        │     (optional sharp preprocessing)
        │     tesseract <page.png> stdout -l khm --psm 3 --dpi 300
        │     normalizeOcrText()       lib/ocr/text.ts
        │     reassembleKhmerText()    lib/text/khmer-reassemble.ts
        │     analyzeTextHealth()      lib/semantic/text-quality.ts
        │     delete the page image
        │
        ├─ decideRecordWrite()         lib/ocr/text.ts
        │
        └─ --apply only:
              deleteRecordPages → budgetedBatches → insertBatch
              delete book_chunks + resource_semantic_insights
              writeIndexState(indexed, detail: "tesseract-ocr …")
```

Almost nothing here is new infrastructure. The storage allow-list, the
statement budgeting, the idempotent page replacement, the index-state
bookkeeping and the Khmer repair are all existing modules; this pipeline adds
the rasteriser, the recognizer, and the rules about when their output may be
stored.

**The order of the chain is the argument.** OCR runs *before* reassembly, not
instead of it: recognition produces the characters, reassembly fixes the
spacing a recognizer can still get wrong, and the health check judges the
result. Reversing it — regex first, on text whose characters are absent — is
the thing this pipeline exists because you cannot do.

---

## 3. Install

### macOS (local development)

```bash
brew install tesseract tesseract-lang poppler

tesseract --version        # expect 5.x
tesseract --list-langs     # MUST list khm
pdftoppm -v
```

`tesseract-lang` is a separate formula and it is the one that matters.
**Without `khm.traineddata` Tesseract does not fail — it falls back to English
and returns confident Latin gibberish for every Khmer page.** That is why
`probeOcrEnvironment()` checks the language list before any page is touched,
and why `--check-env` exists.

> On a Mac where Homebrew has no bottle for your macOS version, `brew` builds
> Tesseract and Leptonica **from source**; budget 30–60 minutes. If it stops
> with `Cannot link pkgconf`, run `brew link --overwrite pkgconf` and retry.
> The container below is faster, is reproducible, and is the supported
> production path either way.

### Docker (ZimaOS / any Linux host — the production path)

```bash
docker build -f infra/ocr/Dockerfile -t ptec-ocr .
docker run --rm ptec-ocr          # prints versions, languages, hosts contacted
```

Expected:

```
tesseract 5.3.0  ·  poppler 22.12.0
languages: eng, khm, osd

OCR runs locally. Hosts contacted by this check: none
Hosted OCR / inference API calls: 0
Ready.
```

The image is Debian bookworm (`node:22-bookworm-slim`) rather than the app
image's Alpine, because Debian ships `tesseract-ocr-khm` as a first-class
package pinned by the distribution release. **The build fails if `khm` is
missing** — an image that cannot read Khmer is worse than no image, because the
failure is invisible until a human reads the output.

| Component | Version in the image | Source | License |
|---|---|---|---|
| Tesseract | 5.3.0 | Debian bookworm `tesseract-ocr` | Apache-2.0 |
| Khmer model | `khm.traineddata` | Debian bookworm `tesseract-ocr-khm` | Apache-2.0 |
| English model | `eng.traineddata` | Debian bookworm `tesseract-ocr-eng` | Apache-2.0 |
| Poppler | 22.12.0 | Debian bookworm `poppler-utils` | GPL-2.0 |

Language data is baked into the image and never downloaded at run time.

### Compose

```bash
cd infra/ocr
cp .env.ocr.example .env.ocr       # fill in; git never sees it
docker compose run --rm ocr npx tsx scripts/ocr-khmer-tesseract.ts --check-env
```

`docker-compose.yml` defines a **one-shot worker, not a service**: OCR is a
recovery pass over a bounded queue that an operator then reads. A daemon would
invite an unattended process that rewrites `book_pages` on a timer.

---

## 4. Environment

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | reading books, writing pages |
| `ZIMA_API_URL`, `ZIMA_API_KEY` | fetching the PDFs |
| `R2_*` | legacy rows storing a bare object key instead of a URL |
| `OCR_WORK_DIR` | where page images are rendered (a volume in the container) |
| `OCR_QUEUE_PATH` | queue location, if not `scripts/scanned-books-queue.json` |
| `TESSERACT_BIN`, `PDFTOPPM_BIN`, `PDFINFO_BIN` | non-standard binary paths |

**No AI provider key.** `GEMINI_API_KEY` is deliberately absent from
`.env.ocr.example`, and `lib/ocr/no-google-ocr.test.ts` fails if it reappears.

### The environment rule that matters most

The storage variables and the database variables must describe the **same
deployment**. A process holding one environment's `ZIMA_API_URL` and another's
Supabase credentials has observed nothing about the files it was asked about —
this is the failure that once wrote `unfetchable` against 203 healthy
production books (`lib/indexing/environment.ts`, migration 0134).

Both scripts run `judgeEnvironment()` over real file URLs from the target
database before doing anything. A dry run continues after a warning; **an
`--apply` run refuses and exits 2.**

---

## 5. Find the candidates

```bash
npx tsx scripts/audit-scanned-books.ts --dry-run    # report only
npx tsx scripts/audit-scanned-books.ts              # report + write the queue
npx tsx scripts/audit-scanned-books.ts --json       # machine-readable
npx tsx scripts/audit-scanned-books.ts --all        # include non-candidates
```

Read-only against the database. The only thing it writes is the queue file, and
`--dry-run` suppresses even that.

### What it measures, and what it refuses to measure

Page counts are **exact for every book** and cost no page text. PostgREST on
this deployment exposes neither scalar functions nor aggregates in `select`
(both were tried against the live API and refused: *"failed to parse select
parameter"* and *"Use of aggregate functions is not allowed"*), so the
short-page count comes from a `LIKE` pattern of thirty underscores — precisely
"content is at least thirty characters long", evaluated inside Postgres. `_`
counts **characters**, not bytes, which is the only reason this is a legitimate
measure for a collection that is mostly Khmer.

Page **text** is fetched only for the shortlist: books whose exact short-page
ratio already admits the low-text signal, plus books named in the damage
catalog. Over the production library that is 94 books out of 1,916. Everywhere
else the character measures stay `null`, and **a mean that was never measured
can never condemn a book** — `null` is not zero.

### Candidate reasons and blockers

| Candidate reason | Meaning |
|---|---|
| `no-text-layer` | extraction parsed the PDF and found text on no page |
| `extraction-failed-permanent` | a permanent failure of the document itself |
| `low-text-yield` | pages exist and carry almost nothing |
| `khmer-legacy-font` | characters substituted by a broken font cmap |
| `khmer-coeng-missing` | characters dropped by the extractor |

| Blocker | Meaning | Veto? |
|---|---|---|
| `never-extracted` | nobody has run the cheap path yet | yes |
| `storage-unresolved` | we have not seen the document | yes |
| `config-failure` | **our** environment was wrong; says nothing about the book | yes |
| `extraction-retry-pending` | queued work, not a broken book | yes |
| `no-pdf-file` | the record carries no PDF | yes |
| `repairable-by-reassembly` | the free deterministic repair covers it | no |
| `too-few-pages-to-judge` | one or two rows are not statistics | no |
| `healthy-text` | nothing wrong with it | no |

A veto holds even when a candidate signal also fired, **because a signal says
something about the book and a veto says we never saw the book.** Zero page
rows is four different situations — a scan, a book nobody has extracted yet, a
storage outage, and our own misconfiguration — and only the first is evidence.

### The queue

```json
{
  "generatedAt": "2026-09-17T15:25:10.369Z",
  "source": "audit-scanned-books",
  "target": "REMOTE project supabase.storage-ptec.online",
  "count": 232,
  "books": [
    {
      "id": "0402ddf9-…",
      "slug": "សៀវភៅពិសោធគីមីវិទ្យា-ភាគ២",
      "title": "សៀវភៅពិសោធគីមីវិទ្យា ភាគ២",
      "language": "Khmer",
      "candidateReasons": ["khmer-legacy-font"],
      "blockers": [],
      "indexStatus": "indexed",
      "failureKind": null,
      "bookPageCount": 79,
      "meanCharsPerPage": 923.3,
      "medianCharsPerPage": 804,
      "maxCharsPerPage": 2719,
      "lowTextPageRatio": 0,
      "damageReasons": ["khmer-legacy-font", "khmer-coeng-detached", "khmer-vowels-orphaned"]
    }
  ]
}
```

The queue deliberately carries **no file URL**. A storage URL is a permanent,
credential-free download link (`docs/BOOK-DOWNLOAD-PERMISSION.md`) and this file
is meant to be read, diffed and shared; the OCR run resolves the URL from the
book id at the moment it needs it.

`target` records which database the queue was measured against, so an apply pass
cannot be pointed at a different one by accident.

---

## 6. Dry run — this is the default

```bash
npx tsx scripts/ocr-khmer-tesseract.ts --slug "បរិវត្តកម្មការអប់រំស្ទែម" --dry-run
npx tsx scripts/ocr-khmer-tesseract.ts --limit 5 --dry-run
```

In the container:

```bash
docker compose run --rm ocr npx tsx scripts/ocr-khmer-tesseract.ts \
  --slug "បរិវត្តកម្មការអប់រំស្ទែម" --dry-run
```

Without `--apply` **nothing is written** — not `book_pages`, not
`resource_index_state`, not `book_chunks`. A dry run reads the first three
pages and prints, per page: render time, OCR time, character count, Khmer
ratio, health verdict and any damage reasons — then the actual Khmer text.

**Reading that text is the point.** Every automatic measure available here can
be satisfied by output that is well-formed and wrong; only a reader can say
whether the words are right. `analyzeTextHealth`'s verdict is satisfied by
*removing spaces*, so a `healthy` verdict proves the pipeline ran — it is not
proof that the Khmer is correct, and nothing here quotes it as if it were.

---

## 7. Apply

```bash
npx tsx scripts/ocr-khmer-tesseract.ts --slug "<slug>" --apply   # one book
npx tsx scripts/ocr-khmer-tesseract.ts --limit 3 --apply         # then three
npx tsx scripts/ocr-khmer-tesseract.ts --limit 20 --apply        # then a batch
```

Escalate in that order, and check `/search` and the book page between stages.

### What `--apply` guarantees

- **Idempotent.** `deleteRecordPages` then insert, exactly as `indexPdfPages`
  does. A second run over the same book produces the same rows rather than a
  unique violation on `(record_type, record_id, page_no)`.
- **Healthy text is not overwritten.** If the record's existing pages read as
  healthy, the run skips with `EXISTING_TEXT_HEALTHY`. `--force` is the only
  override, and it logs loudly before it does it.
- **Damaged OCR output is never stored, and `--force` does not change that.** A
  zero exit code from Tesseract means the process ran, not that the output is
  Khmer.
- **Absent beats truncated.** A failure mid-insert empties the record before the
  error propagates, because a book holding OCR pages 1–100 of 400 answers "found
  inside" for a quarter of itself and is silent about the rest — which nothing
  downstream can distinguish from a book that only mentions a phrase early.
- **Derived data is discarded.** `book_chunks` and `resource_semantic_insights`
  were computed from the text being replaced, so they are deleted. They are
  **not** rebuilt here; see §10.

### Provenance

Recorded in `resource_index_state.detail`:

```
tesseract-ocr lang=khm psm=3 dpi=300 preprocess=none verdict=healthy
```

**No migration was added, deliberately.** This pipeline replaces a record
*whole*, so provenance is a property of the record rather than of a page, and a
column on every one of the library's 210,642 page rows to record a value that is
constant within each record would be schema for its own sake. `detail` already
exists, is already rendered by the admin Data Quality panel, and
`classifyFailure()` returns `null` for an `indexed` status — so a note there
schedules no retry and sets no failure kind.

---

## 8. Flags

| Flag | Default | Meaning |
|---|---|---|
| `--check-env` | | verify tesseract, the `khm` model and poppler, then exit |
| `--slug <slug>` | | OCR one book |
| `--limit <n>` | | take the first *n* books from the queue |
| `--queue <path>` | `scripts/scanned-books-queue.json` | queue file (`$OCR_QUEUE_PATH`) |
| `--reason <r>` | all | only queue entries carrying this candidate reason |
| `--dry-run` | **on** | read 3 pages, write nothing |
| `--apply` | off | the only writing mode |
| `--force` | off | permit replacing text judged *healthy*; never permits storing damaged OCR |
| `--page-start <n>` | `1` | first PDF page |
| `--page-end <n>` | 3 pages (dry run) / whole document (`--apply`) | last PDF page |
| `--dpi <n>` | `300` | rasterisation density |
| `--psm <n>` | `3` | Tesseract page segmentation mode |
| `--lang <codes>` | `khm` | try `khm+eng` for mixed pages |
| `--preprocess <mode>` | `none` | `none` \| `normalize` \| `threshold` |
| `--output-dir <path>` | `$OCR_WORK_DIR`, else the OS temp dir | where pages are rendered |
| `--keep-images` | off | do not delete the rendered pages |
| `--verbose` | off | print the full OCR text of every page |
| `--json` | off | machine-readable report on stdout |

### Preprocessing

`none` is the default and is right for a PDF rendered from vector text —
poppler already produces grayscale and a further decode/encode round trip per
page buys nothing. `normalize` stretches the histogram and recovers faded
photocopies without deciding anything about a pixel. `threshold` binarises, and
is **opt-in per book**: Khmer diacritics — a coeng, a `ុ`, a `ំ` — are one or
two pixels tall at body size, and a threshold tuned for clean black text erases
them.

Measure before changing it; §12 has the comparison for the reference book.

---

## 9. Troubleshooting

| Symptom | Code | What to do |
|---|---|---|
| `tesseract is not installed or not on PATH` | `TESSERACT_UNAVAILABLE` | `brew install tesseract`, or run the container |
| `has no traineddata for: khm` | `KHMER_MODEL_MISSING` | `brew install tesseract-lang`. In Docker the build would have failed, so check which image you are running |
| `pdftoppm is not installed` | `POPPLER_UNAVAILABLE` | `brew install poppler` |
| `storage answered HTTP 404/5xx` | `PDF_FETCH_FAILED` | transient; retry. Check the file exists (`scripts/check-file-health.ts`) |
| `The storage allow-list refused this URL` | `STORAGE_UNRESOLVABLE` | **your** `ZIMA_API_URL` does not match the database's files. Fix the environment, not the record |
| `ENVIRONMENT MISMATCH — refusing to write` | | same cause, caught before a page is read |
| tesseract exits non-zero | `OCR_PROCESS_FAILED` | usually a bad page image — `--keep-images` and open it |
| Output is empty | `OCR_EMPTY` | the pages may genuinely be blank. Check a rendered image |
| `OCR output judged damaged` | `TEXT_HEALTH_FAILED` | Tesseract read *something* and it is not usable Khmer. Try `--preprocess normalize`, a higher `--dpi`, or `--lang khm+eng`. Do not force it |
| `already holds N healthy page(s)` | `EXISTING_TEXT_HEALTHY` | working as intended. `--force` only if you are sure |
| insert failed, pages removed | `PARTIAL_WRITE_CLEANED` | the record is empty and retryable; re-run |
| Latin gibberish for Khmer pages | — | `khm` is missing and Tesseract fell back to English. `--check-env` |

Every code is one of `OCR_ERROR_CODES` in `lib/ocr/errors.ts`; the ones that
describe the machine rather than the document are listed there as
`ENVIRONMENTAL_CODES`.

---

## 10. After OCR: search and embeddings

`book_pages` is the source for `/api/search/native` "found inside" hits, and —
through `book_chunks` — for semantic retrieval and every AI citation. Full-text
search works the moment the rows land.

Chunks and semantic insights are **deleted and not rebuilt**, deliberately:

```bash
npx tsx scripts/embed-library.ts --chunks-only
```

Separate commands, because embedding spends a metered per-day quota and OCR does
not. Chaining them means one quota stop aborts work that had already succeeded —
the same reasoning that keeps `/api/cron/index-reconcile` from embedding what it
extracts. **Do not add an embedding call to the OCR path.**

---

## 11. Performance and resource use

One page at a time, always. A 500-page textbook at 300 DPI is several gigabytes
of PNG; rendering a document up front is how a batch job fills a disk before it
recognizes anything. Each page image is deleted as soon as it has been read
(`--keep-images` opts out), so peak disk is one page and peak memory is one page
of text. The PDF itself is **streamed** to disk rather than buffered, so memory
does not scale with the largest book in the library.

---

## 12. Measured

_2026-09-17, against the production library (1,916 published books, 210,642
`book_pages` rows over 1,695 books). Container `ptec-ocr` on Docker Desktop for
macOS (x86-64), Tesseract 5.3.0, `-l khm --psm 3 --dpi 300`. Do not quote these
for a different corpus, host or DPI._

### Candidate census

| | Books |
|---|---|
| Published books | 1,916 |
| **OCR candidates** | **232** |
| — `no-text-layer` | 218 |
| — `khmer-coeng-missing` | 10 |
| — `khmer-legacy-font` | 8 |
| — `low-text-yield` | 1 |
| Not queued: `healthy-text` | 1,593 |
| Not queued: `repairable-by-reassembly` | 73 |
| Not queued: `too-few-pages-to-judge` | 14 |
| Not queued: `never-extracted` | 2 |
| Not queued: `storage-unresolved` | 1 |
| Not queued: `extraction-retry-pending` | 1 |

(Reasons sum above 232 because a book can carry several — five books are both
`khmer-legacy-font` and `khmer-coeng-missing`.)

The 73 `repairable-by-reassembly` books are the number that matters most here:
they are the ones this audit **refuses** to spend OCR on, because
`scripts/repair-khmer-reassemble.ts` fixes them exactly, for free.

### Reference book — `បរិវត្តកម្មការអប់រំស្ទែម`

183-page PDF, currently holding 178 extracted pages at mean 1,044.7 chars,
queued for `khmer-coeng-missing`. Dry run, pages 1–3:

| Page | render | ocr | chars | khmer ratio | verdict | reassembled |
|---|---|---|---|---|---|---|
| 1 | 26,688 ms | 5,834 ms | 217 | 0.58 | healthy | no |
| 2 | 12,998 ms | 15,657 ms | 2,141 | 0.91 | healthy | **yes** |
| 3 | 1,199 ms | 2,498 ms | 1,447 | 0.91 | healthy | no |

Record-level health of the OCR output: **healthy** — khmer 0.892, coeng density
0.163, dangling coeng 0.000, orphan vowels 0.001, legacy artefacts 0.000, Khmer
space ratio 0.029, no damage reasons.

Write decision: *would replace `damaged-text`* — the existing pages are judged
damaged, so no `--force` would be needed.

The first page's 26.7 s render is a cold start (page cache, first `pdftoppm`
touch of a freshly written 183-page file). A separate run over pages 3–4 only,
where nothing is cold, gives the steady state:

| Page | render | ocr | chars | khmer ratio |
|---|---|---|---|---|
| 3 | 1,325 ms | 2,690 ms | 1,447 | 0.91 |
| 4 | 1,271 ms | 3,539 ms | 2,602 | 0.28 |

So **~4–5 s per page**, and a 180-page book is roughly 12–15 minutes on this
host. A Linux server without Docker Desktop's filesystem layer will be faster.
Page 4's khmer ratio of 0.28 is a real property of that page — it is largely a
table of Latin headings — not a recognition failure.

Sample of the output, page 3 (compare with the legacy-font example in §1 B):

```
អារម្ភកថា
សៀវភៅ "បរិវត្តកម្មការអប់រំស្ទែម_មគ្គុទ្ទេសក៍អភិវឌ្ឍន៍វិជ្ជាជីវៈជាប្រចាំស្តីពីការរចនាកម្មវិធីសិក្សា
នវានុវត្តន៍គរុកោសល្យ និងការប្រើប្រាស់បច្ចេកវិទ្យា នៅមធ្យមសិក្សា" នេះ ជាសមិទ្ធិផលមួយ …
```

That is real Khmer Unicode, read from the rendered page. Latin acronyms inside
the Khmer (`STEM`, `KAPE`) come back mangled — `អង្គការខេប (42 )` for `(KAPE)` —
which is what `--lang khm+eng` is for on documents where those matter.

### Why `--preprocess` defaults to `none`

Same book, same pages, same settings but `--preprocess normalize`:

| Page | `none` chars | `normalize` chars |
|---|---|---|
| 2 | 2,141 | 2,089 |
| 3 | 1,447 | 1,450 |

Within noise, and `normalize` costs a full decode/encode round trip per page.
This is a PDF rendered from vector text, where poppler's own `-gray` output is
already clean — so histogram stretching has nothing to recover. Keep `none`
here; reach for `normalize` on a *photocopied* scan, and measure it on that
book rather than assuming it transfers.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean for everything in this change |
| `npx eslint lib/ocr scripts/ocr-*.ts scripts/audit-scanned-books.ts` | clean |
| `npx vitest run lib/ocr` | 75 passed |
| `npx vitest run` (whole suite) | 343 files / 7,142 tests passed |
| container `--check-env` | tesseract 5.3.0, poppler 22.12.0, `eng khm osd`, 0 billed calls |
| **negative control** — `--apply` with a mismatched `ZIMA_API_URL` | refused before any page or row was touched, **exit 2** |

The negative control matters as much as the positive one. An environment guard
that has never been *seen* to refuse is a guard nobody has tested; this one was
run against the production database with `ZIMA_API_URL=http://localhost:4000`
and `--apply`, and it stopped with:

```
✖ ENVIRONMENT MISMATCH — refusing to write.
  … Its storage allow-list is built from ZIMA_API_URL (localhost), and the
  files live on: storage-ptec.online. Running would record every record as
  "unfetchable" — a verdict about this machine's configuration, not about the
  files.
```

The audit itself takes ~13 minutes against the production database: two full
scans of `book_pages` (210,642 rows at 1,000 per request) plus the text of the
94 shortlisted books, all sequential round trips to a remote Postgres.

No `--apply` has been run. Nothing in any database has been written by this
pipeline; every production interaction recorded here was a read.

---

## 13. Running the batch on the ZimaOS box

A full pass over the scanned collection is a **multi-day** job. It belongs on
the box, not on a laptop — not because the box is faster (it is a 4-core
virtualised x86_64, fewer cores than a typical laptop) but because it can run
unattended for days without sleeping, and without competing with whatever else
is on the workstation. A run measured at 2.7–7.0 s/page on a quiet laptop was
26.4 s/page on the same laptop at load average 136.

### The batch is resumable, so an interrupted run costs almost nothing

`canSkipBeforeOcr` asks whether a record already holds healthy text *before*
recognising a page, so re-running the same command skips completed books at
about a second each rather than re-recognising them for ten minutes each.
Interrupting a batch is safe at any point: a book is written only after all its
pages are read, so a killed run leaves the in-flight book with **zero** rows,
never a partial index (verified — the book interrupted mid-run held 0 rows).

### One-time setup on the box

```bash
ssh <box>
cd /DATA/AppData/ptec-elibrary/app
git pull                                    # must include the OCR commit

cp infra/ocr/.env.ocr.example infra/ocr/.env.ocr
$EDITOR infra/ocr/.env.ocr                  # Supabase + Zima, same deployment
```

The OCR image is **built on the box**, which is a deliberate exception to "the
box does not build" in `docs/ZIMAOS-DEPLOYMENT.md`. That rule exists because
cross-building the Next.js app under emulation took 40+ minutes; this image
runs no webpack build at all — it is `apt-get install` plus `npm ci`. If you
would rather keep the box build-free, publish it to GHCR the way
`docker-publish.yml` publishes the app and pull it instead; nothing in the
worker depends on which way the image arrived.

```bash
cd infra/ocr
docker compose build                        # ~10 min; fails if khm is missing
docker compose run --rm ocr npx tsx scripts/ocr-khmer-tesseract.ts --check-env
```

Expect `tesseract 5.3.0 · poppler 22.12.0`, `languages: eng, khm, osd`, and
`Hosted OCR / inference API calls: 0`.

### Run the scanned books

```bash
cd /DATA/AppData/ptec-elibrary/app/infra/ocr
docker compose run --rm -d --name ptec-ocr-batch ocr \
  npx tsx scripts/ocr-khmer-tesseract.ts \
  --reason no-text-layer --limit 218 --apply --lang khm+eng
```

`--reason no-text-layer` selects the 218 books that hold **no text at all**, so
OCR can only add and there is nothing to lose. It reads the committed
`scripts/scanned-books-queue.json`, so no file needs to be copied to the box.
The remaining 14 (`khmer-legacy-font`, `khmer-coeng-missing`, `low-text-yield`)
are deliberately excluded: those hold text that OCR would REPLACE, and §12
shows why that is a per-book judgement.

Detached (`-d`) so it survives the SSH session. Follow it with:

```bash
docker logs -f ptec-ocr-batch
docker logs ptec-ocr-batch | grep -c '→ '          # books finished
docker logs ptec-ocr-batch | grep -E '→ (failed|skipped)'
```

To stop, `docker stop ptec-ocr-batch`; to resume, re-run the same command.

### If the box is struggling

Tesseract's OpenMP pool is most of its CPU appetite, and on a small box capping
it often raises total throughput rather than lowering it:

```bash
docker compose run --rm -e OMP_THREAD_LIMIT=1 ocr npx tsx …
```

Measure before and after on the same book with `--page-start/--page-end`; do
not assume it helps.

### Disk

The image is ~3.8 GB, because `npm ci` installs the whole dependency tree —
`tsx` and `dotenv` are devDependencies and every script here runs through them.
Rendered pages are written to the `ocr-work` volume one page at a time and
deleted immediately, so the working set is one PNG, not a book.

---

## 14. Cost

- **OCR engine**: Tesseract, open source, running on our own CPU.
- **Google OCR API calls during OCR: 0.**
- **Gemini Vision OCR calls during OCR: 0.**
- **Paid OCR service: none.**

This is *not* a claim of zero cost or zero network traffic. The worker uses CPU
and disk on the host, and it does make network requests — it downloads the PDF
from storage and it talks to Supabase. The reference run above contacted
`storage-ptec.online` once and `supabase.storage-ptec.online` three times, and
prints that list every time it runs.

The precise claim is **zero OCR API calls and zero per-page OCR spend**, and it
is enforced in two places rather than asserted:

- **Statically**, by `lib/ocr/no-google-ocr.test.ts`, which fails if any module
  on the OCR path imports an AI SDK, a vision API or anything from `lib/ai/`, or
  reads a provider API key from the environment.
- **At run time**, by `lib/ocr/egress.ts`, which records every host the process
  contacts and **refuses** a request to a hosted inference endpoint rather than
  reporting it after the money is spent.

Both halves exist because `scripts/repair-khmer-pages.ts` — the Gemini Vision
OCR path this replaces — lives in the same directory, imports the same storage
helpers and writes the same table. Nothing in the *shape* of either script says
which one spends money.

That script is untouched and still available. It remains the better tool for a
page where Khmer Unicode accuracy matters more than cost.
