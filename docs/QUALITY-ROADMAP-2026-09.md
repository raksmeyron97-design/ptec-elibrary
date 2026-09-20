# Quality roadmap — September 2026

A `$0` phase. No paid AI API usage of any kind was incurred producing this
document or the work it records: no embedding backfill, no live-model
benchmark, no new provider. Everything measured here was measured either
offline against pure functions or read-only over HTTP against the public
production site.

Evidence labels used throughout the repository's audit documents:
`[CODE]` `[LOCAL]` `[CI]` `[PRODUCTION]` `[UNKNOWN]` `[DEFERRED]`.

---

## Where the platform actually stands

The infrastructure is mature and, where it was measured, correct. The
production entity smoke test passes 10 of 10 shape fixtures; the sitemap
advertises 2,313 URLs; recall over the search labels that can bear it is
R@1 97% / MRR 0.98. This phase therefore did not build infrastructure. It
looked for places where a **true-looking number or a true-looking page was
hiding a false claim**, and found three.

| # | Finding | Evidence | Status |
|---|---|---|---|
| 1 | The most-published `Person` in the library is a phone number | `[PRODUCTION]` | Fixed in code, production verification pending |
| 2 | Search scored a word as a match because it sat inside another word | `[PRODUCTION]` | Fixed in code, production verification pending |
| 3 | The search benchmark's `subject` score was measuring stale labels, not ranking | `[PRODUCTION]` | Instrument corrected |

---

## P0 — zero-cost trust blockers

### 1. Contributor identity — **done, pending production verification**

`[PRODUCTION]` Ten of 318 names on the public author roster do not identify
anybody. Each answered HTTP 200 with `index, follow` and published a
`ProfilePage` whose `mainEntity` is a `Person` with a stable `@id`. The
largest, `Channa 0977 33 61 62`, is credited with **621 of 1,916 published
books**.

Full report: **`docs/DATA-QUALITY-2026-09.md`**.

### 2. Resource quality evaluation — **not built; the requirement was already met**

The brief asked for a resource quality evaluation layer across metadata, text,
OCR, file, contributor, verification, search readiness and AI readiness. Every
one of those already exists and is already surfaced:

| Dimension | Existing owner |
|---|---|
| metadata | `lib/admin/metadata-quality-report.ts` → `/admin/data-quality` |
| text extraction / OCR health | `resource_index_state` + `public_resource_index_health` (0133, 0134) |
| Khmer text health | `assessKhmerText()` in `lib/ai/page-quality.ts` |
| file | `file_health` table + `scripts/check-file-health.ts` |
| contributor | **new** — `lib/resources/contributor-trust.ts` |
| verification | `books.verified_at` / `verified_by` (0062) |
| search / AI readiness | `lib/ai/readiness.ts`, which counts rows rather than trusting cached numbers |

Building a ninth evaluator over the top of those would have produced a second
source of truth for eight facts that already have one — the failure mode
`docs/CANONICAL-RESOURCES.md` and `lib/resource-stats-consistency.test.ts`
exist to prevent. The one genuinely missing dimension was contributor
identity, and that is what was added. `[DEFERRED]` composing the eight into a
single per-resource verdict, if a surface is ever found that needs one.

### 3. Search benchmark validity — **done**

`[PRODUCTION]` `subject` scored R@5 42% against production. The top four
results for `គណិតវិទ្យា` are four mathematics textbooks; the label was written
when the collection held 270 books and it now holds 1,916. A label now carries
a derived **scope**, a metric a label cannot bear prints as `—` rather than a
zero, and topical queries are judged by a label-free property of the results.

Full report: **`docs/SEARCH-QUALITY-2026-09.md`** §2.

---

## P1 — product quality

### 4. Zero-cost search quality — **done, pending production verification**

`[PRODUCTION]` `"blockchain cryptocurrency mining"` returned four education
titles and `"formula one aerodynamics"` returned twenty-six, because the
relevance model matched Latin terms as bare substrings. `[LOCAL]` replay over
the rows production actually returned: 6.1% of displayed rows lose their only
match, and **0 of the 90 labelled records** are among them.

Full report: **`docs/SEARCH-QUALITY-2026-09.md`** §1.

### 5. No-result UX — **verified adequate; nothing changed**

The brief asked for a no-result state offering a shorter title, the author's
name, the ISBN, all resource types, the assistant, and browsing by subject.
`SearchPageClient.tsx` already renders a titled empty state, recovery advice,
related-subject chips falling back to popular searches, three popular
resources and a browse link; `lib/ask/open.ts` already pre-fills the assistant
without sending, because a question spends quota.

The real defect here was never the empty state — it was that queries which
should have reached it did not, because the engine answered them with junk.
Fixing §4 is what routes them there. No UI was changed, deliberately.

### 6. Public trust indicators — **not built**

`[DEFERRED]`, and not for lack of time. `lib/search/availability.ts` already
publishes a six-value availability vocabulary on every result, and book detail
pages already carry the verified badge (0062). The brief's additional signals
— "text searchable", "AI semantic coverage unavailable" — are honest but
expose an operational gap to readers as though it were a property of the book:
`[PRODUCTION]` 80% of the extracted collection has no vectors because the
embedding backfill is budget-constrained, so "AI answers may be limited for
this title" would be true of four books in five and would say more about this
project's billing than about the library. Revisit after the backfill.

### 7. Production-scale SEO verification — **run; one instrument defect found and fixed**

`[PRODUCTION]` The entity graph passes 10 of 10 shape fixtures. The sitemap
advertises 2,313 URLs, and `scripts/audit-sitemap-links.ts` reported **141 of
them broken**.

They are not broken. Every one spot-checked afterwards answered HTTP 200 on the
first serial request. The auditor was crawling at concurrency 6 against an
origin that resets connections under parallel load, and filing its own
transport failures under "BROKEN sitemap URLs" — then exiting 1 on them.

The file already carried a comment explaining exactly why that is wrong
("reporting those as dead links is how a link auditor stops being read"), and
the repository already has one fault vocabulary for precisely this
(`lib/verify/http.ts`: a transport failure is `unknown`, never a pass and never
a defect; an incomplete run exits 0 and says so). This script was simply not in
`lib/verify/http.test.ts`'s scan pattern, so it drifted. It is now, and the
script speaks the vocabulary.

`[PRODUCTION]` The re-run under the corrected instrument, at concurrency 2:

```
sitemap: 2313 URLs from https://library.ptec.edu.kh (concurrency 2)
2313 passed (2313 URLs)
```

**All 2,313 of them.** No 404, no 410, no 5xx, no redirect where the canonical
URL belongs, and nothing the origin failed to answer. The sitemap is honest;
the 141 were the auditor.

That is also the strongest available evidence that the instrument change was
the right one: the same crawl, of the same URLs, minutes apart, reported 141
defects at concurrency 6 and none at concurrency 2. A number that moves with
the observer was never measuring the library.

### 8. Khmer text quality — **not advanced this phase**

`[DEFERRED]`. The deterministic reassembly (`scripts/repair-khmer-reassemble.ts`),
the readability gate (`assessKhmerText`) and the Tesseract pipeline all landed
in earlier phases and a 218-book OCR batch is already running on the box. The
one open Khmer question — the `orphanShare` signal, where every threshold that
catches the second corruption flavour condemns 56–64% of the Khmer corpus —
needs a Khmer reader, not a code change. That is recorded in `CLAUDE.md` and is
unchanged.

The Khmer work this phase **did** do is in search: the word-boundary rule is
per-script precisely so that Khmer substring matching survives it intact, and
`lib/search/term-match.test.ts` pins that in both directions.

---

## P2 — AI architecture readiness

### 9–11. Deterministic AI improvements — **not attempted**

`[DEFERRED]`. The deterministic layer (`lib/ai/intent.ts`, `plan.ts`,
`page-target.ts`, `learning-path-match.ts`, `spellcheck.ts`) was audited in AI
Brain 2.1 and 3.0 and has offline benchmarks that run without a paid key
(`npm run ai:benchmark`, `npm run retrieval:benchmark`). Nothing in this
phase's evidence pointed at it. Opening it without a finding would be change
for its own sake, which §3 of the brief explicitly warns against.

---

## DEFERRED — budget constrained

### 12. Semantic embedding backfill

`[DEFERRED — BUDGET]` `[PRODUCTION]` 1,695 books have extracted page text;
**336** have embedded chunks. The gap is ~1,360 books and closing it spends
metered Gemini quota. Not attempted, not estimated, not worked around.

What this phase did instead is make the **lexical** path carry more of the
weight honestly: `negative` topical precision is now measurable, broad topical
retrieval is now judged by a metric that does not require vectors, and the
author vocabulary the assistant reads no longer contains ten names that are
not people.

### 13. Paid live AI benchmark expansion

`[DEFERRED — BUDGET]` `npm run ai:answer-benchmark --live-suite` spends quota.
Not run.

---

## Production checks performed this phase

All read-only, all over public HTTP, all `$0`.

| Check | Command | Result |
|---|---|---|
| Entity graph, per shape | `scripts/verify-production-entities.ts` | `[PRODUCTION]` 10/10 passed before the new fixtures; 10/12 after, and the 2 failures are the defect this phase fixes |
| Search retrieval, 100 queries | `scripts/search-benchmark.ts` | `[PRODUCTION]` R@1 97% / R@5 99% / MRR 0.98 over 69 labels; `negative` topical precision 3% |
| Author roster | `/authors` + `sitemap.xml` | `[PRODUCTION]` 318 names listed, 279 author URLs advertised, 10 names identify nobody |
| Sitemap honesty, all 2,313 URLs | `scripts/audit-sitemap-links.ts` | `[PRODUCTION]` **2313 passed (2313 URLs)**, reproduced on two independent full crawls — no 404, no 410, no redirect, no 5xx, nothing unanswered. The first run's 141 "broken" URLs were the auditor's own load (see P1 §7) |

## What remains UNKNOWN

* `[UNKNOWN]` Live Lighthouse scores were not measured in this phase. No
  performance code was changed, and no performance claim is made.
* `[UNKNOWN]` The e2e suite (Playwright) was not run against a local server in
  this phase; the unit suite was, in full.
* `[UNKNOWN]` Whether any of the ten unidentified contributor rows has a
  recoverable true author.
* `[UNKNOWN]` The cause of the intermittent multi-second p95 on
  `/api/search/native`, observed again during the benchmark run.

## What the next `$0` step should be

**Not** "buy API and run embeddings."

Deploy what is here and re-run the two production instruments — the entity
smoke test and the search benchmark. Both are already written to state the
defect precisely and to clear themselves when it is gone; neither has ever been
read against a deployment containing these changes. A fix that is only verified
offline is a fix nobody has seen work.
