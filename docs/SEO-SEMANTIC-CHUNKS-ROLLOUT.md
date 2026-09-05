# Semantic layer — rollout and operations

Audit: `docs/SEO-SEMANTIC-CHUNKS-AUDIT.md` ·
Architecture: `docs/SEO-SEMANTIC-CHUNKS-ARCHITECTURE.md`

---

## 1. What ships dark

The feature is inert until `scripts/build-semantic-insights.ts` writes rows.
With `resource_semantic_insights` empty, `getPublicTopics()` returns `[]`,
`<BookTopics/>` returns `null`, and every book detail page renders exactly as
it did before. There is no flag to set and nothing to turn on: the rollout unit
is a row.

That also means a rollback is `DELETE FROM resource_semantic_insights` — or, for
one record, deleting its row. No cache purge is required beyond the ordinary
`books` tag, which the table's read already rides on.

## 2. Order of operations

```bash
# 1. Apply the migration. CI does this on merge to main
#    (.github/workflows/migrate.yml) — never by hand in the SQL editor.

# 2. See what WOULD be written, against the real collection. Writes nothing.
npx tsx scripts/build-semantic-insights.ts --dry-run --verbose

# 3. Pilot: the 20 most recently added books.
npx tsx scripts/build-semantic-insights.ts --limit 20

# 4. Inspect /admin/data-quality → "Semantic coverage", and spot-check a
#    handful of /books/<slug> pages against the actual PDFs.

# 5. Full run. Idempotent and resumable; a record whose stored row is current
#    costs one cheap query.
npx tsx scripts/build-semantic-insights.ts

# One record, e.g. after re-extracting its PDF:
npx tsx scripts/build-semantic-insights.ts --only <slug>

# After changing any rule in lib/semantic/: bump SEMANTIC_VERSION, then
npx tsx scripts/build-semantic-insights.ts --all
```

**Always `--dry-run` first against a database you did not create.** The script
only reads `book_pages`, so it cannot damage the corpus — but an insight
computed from a half-finished extraction is published as fact.

## 3. Reading the result

The script's summary buckets every record, and the buckets have different
owners:

| Status | Meaning | Whose problem |
|---|---|---|
| `ok` | topics proven from body text | — |
| `damaged-text` | pages exist and are not the document's text | **ours** — the extraction toolchain |
| `no-text` | no extracted pages, or too few to judge | the indexer (`resource_index_state`) |
| `unsupported-topics` | text is good; no tag appears in the body | the cataloguer |

Keeping them apart is the point. Collapsing them into "no topics" would hide
the second bucket — currently 99 books — behind the appearance of a working
feature.

## 4. Measured baseline (production, 2026-09-05, dry run)

```
records examined     215
ok                    81      352 topics, 172 distinct labels, 4.3 per record
damaged-text          99      every Khmer-script book in the collection
no-text               27
unsupported-topics     8
```

Reproduce with `--dry-run --verbose`. If `ok` falls materially below 81 after a
rule change, the change tightened something; if `damaged-text` falls, either
the extraction toolchain was fixed or the detector was weakened — check which.

## 5. Verification

```bash
npx vitest run lib/semantic lib/pdf-page-index.test.ts   # the pure rules
npx tsc --noEmit
npm run lint
```

The unit tests carry verbatim production excerpts as fixtures — damaged Khmer
pages paired with what those documents actually say. They are the regression
guard for the gate that keeps 99 books out of public claims, so a change that
stops condemning them has stopped protecting the collection, whatever the
suite says elsewhere.

## 6. Measuring the SEO effect

Do **not** claim an SEO improvement from URL counts: this feature creates no
URLs. What it changes is the body content of 81 existing `/books/[slug]` pages.

Before enabling, record from Search Console for `library.ptec.edu.kh/books/*`:
impressions, clicks, CTR, average position, and the query set. Wait a full
crawl cycle after the run, then compare — and compare against the 134 books
that received nothing, which are a natural control group in the same section of
the same site. Watch Core Web Vitals on `/books/*` too: the section streams
inside `<Suspense>` and reads one cached row, so LCP and CLS should be flat.
If they are not, that is the finding, not the traffic.

## 7. Known limits

* **Khmer is entirely excluded**, and will be until PDF text extraction for
  legacy non-Unicode Khmer fonts is fixed (a font remap or OCR). That is a
  larger piece of work than this feature and is not scheduled here. The gate
  means the day it is fixed, a re-extraction plus `--all` picks those books up
  with no code change.
* **Latin text quality is not verified**, only Khmer. `analyzeTextHealth`
  reports "healthy" for Latin in the weak sense of "no Khmer damage found";
  a garbled English extraction would pass. No instance was observed in this
  collection, but the module does not claim to detect one.
* **Matching is literal.** "Sampling" and "sample selection" are different
  topics to this pipeline, and no synonym or translation expansion is applied,
  because nothing in the data says they are the same concept.
* **27 books have no extracted text**, 8 of them because of the statement
  timeout fixed in `lib/pdf-page-index.ts`. Re-running the page indexer over
  those records is a prerequisite for them ever gaining topics.
