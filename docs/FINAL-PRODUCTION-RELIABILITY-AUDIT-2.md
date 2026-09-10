# PTEC e-Library — Final Production Reliability Audit 2.0

**Date:** 2026-09-10
**Baseline commit:** `676be57` (`main`) — *fix(pwa): close the offline ownership leak and stop accepting truncated downloads (#170)*
**Audit branch:** `audit/final-production-reliability-2`
**Environment audited:** production — `https://library.ptec.edu.kh`, storage `https://storage-ptec.online`, self-hosted Supabase `https://supabase.storage-ptec.online`
**Stack as built:** Next.js 16.3.4 · React 19.2.6 · TypeScript 5 · Vitest 4.1.8 · Playwright 1.60

---

## 1. Executive summary

**Verdict: PASS WITH WARNINGS.**

No production-blocking defect remains. Every reliability area that had been
validated before this audit — Reader 2, PWA offline, PDF integrity, storage,
authorization, upload handling — was re-tested against production or against a
real browser and **held**. The infrastructure of this system is in good shape:
474 of 474 sitemap URLs answer 200, 268 of 268 published PDFs are byte-complete
and range-serving, the database has zero orphaned rows, and no upload session is
stuck.

The audit's substantive findings are in the two places the brief pointed at, and
they are unrelated to each other:

1. **AI answer quality was a query-understanding failure, not a model failure.**
   This is now measured rather than asserted. A new instrument
   (`npm run ai:answer-benchmark`, 123 labelled questions) showed the assistant
   answering beautifully when a question is phrased the way its keyword tables
   expect, and failing completely otherwise — telling readers that subjects the
   library is *built around* are "outside the library's collection", and
   answering `Who wrote "X"?` with "I couldn't find an author named …" for books
   on the shelf. Six targeted fixes took **grounded answers from 59% to 88%** and
   **retrieval correctness from 54% to 89%**, with zero hallucinated citations
   before or after. No model was retrained, and §29's evidence bar for
   recommending training is **not** met — see §9.

2. **The security-monitoring pipeline is dark in production.** `security_events`
   and `security_incidents` hold **zero rows**. This is reproducible on demand
   (§10, F-9) and is the one finding that warrants action before anything else
   in this report, because it means the system that is supposed to notice brute
   force and admin attacks is recording nothing — and its own failure is
   invisible outside container stdout. It is **not** fixed here: the cause lives
   inside the container and fixing it blind would be guessing.

---

## 2. Scorecard

| Area | Status | Evidence |
|---|---|---|
| Authentication | **PASS** | Private surfaces 307 → login; `/api/books/*/file` 401 anonymous; sessions verified server-side, never from a parameter |
| Authorization | **PASS (partial)** | 42/42 RLS behavioural probes; every admin route/action behind the policy registry; **cross-account A↔B not exercised in production** (no accounts supplied) |
| Database integrity | **PASS** | 0 orphans across 8 derived tables; 0 progress rows without a profile; 0 values outside 0–100; 0 sessions stuck mid-transition |
| Storage | **PASS** | 617 objects reconciled against rows; 0 orphan rows; 23 orphan files (120.9 MB, bookkeeping) |
| PDF integrity | **PASS** | **268/268** published books: `%PDF-` header, `%%EOF` in tail, size within 1%, HTTP 206 + `Content-Range`, `Accept-Ranges` |
| Upload reliability | **PASS** | 79 published books >10 MiB (largest 81.0 MiB) all byte-consistent; 0 stuck sessions; state-machine + reconciler invariants green |
| Reader 2 | **PASS** | 11 passed / 5 skipped / 0 failed (e2e, real browser) |
| PWA offline | **PASS** | 11 passed / 1 skipped / 0 failed, including a true network-off reload |
| Search | **PASS** | `/api/search/native` returns the exact title first; 474/474 URLs 200 |
| AI retrieval | **PASS (improved)** | R@5 83% → 83%, **top-1 66% → 70%**, single-document top-1 **77% → 87%**, no-evidence 100%, citation 100% |
| AI answer quality | **PASS WITH WARNINGS (improved)** | grounded **59% → 88%**, retrieval **54% → 89%**, routing **78% → 98%**; 3 known gaps remain (F-6, F-7, F-8) |
| Performance | **PASS WITH WARNINGS** | Warm TTFB 0.25–0.61 s; **cold/revalidating renders 5.5–11.2 s** (F-10) |
| SEO | **PASS** | canonical + hreflang + OG + Highwire + JSON-LD correct; robots.txt correctly anchored; private surfaces `noindex, nofollow` |
| Security | **PASS** | Image-optimizer allowlist holds (allowlisted 200, everything else 400); split CSP; HSTS preload; cron 401 on anonymous *and* wrong secret |
| Cron | **PASS** | All 5 endpoints reject anonymous and wrong-bearer |
| Observability | **FAIL** | **F-9** — `security_events` = 0, `security_incidents` = 0; sink failure invisible outside container stdout |

---

## 3. What was actually run

```
TypeScript   npx tsc --noEmit                      0 errors      (before and after)
ESLint       npx eslint                            0 errors, 173 warnings (baseline 174; net −1)
Vitest       npx vitest run                        4287 passed | 50 skipped | 0 failed
                                                   (baseline 4251 passed — +36 new regression tests)
RLS probes   RLS_PROBE=1 vitest lib/rls.test.ts    42 passed | 3 skipped   (3 need a probe JWT)
E2E reader   playwright reader-ux, reader-interaction, abstract-reader
                                                   11 passed | 5 skipped | 0 failed
E2E PWA      playwright offline-reading            11 passed | 1 skipped | 0 failed
Build        rm -rf .next && npm run build         see §11
Retrieval    npm run retrieval:benchmark           98 questions, production corpus
Answers      npm run ai:answer-benchmark           123 questions, production corpus
```

Production probes: 474 sitemap URLs, 268 PDF objects × 3 requests each, 5 cron
endpoints × 2 auth shapes, 14 private surfaces, 4 image-optimizer SSRF shapes.

---

## 4. Findings

Severity uses the brief's scale. "Status" says what is true **on the audit
branch**, not on `main`.

---

### F-1 · HIGH · PRODUCTION BUG · AI answer quality
**A content question about a subject the library owns was answered "this is not from the library's collection".**

**Impact.** The most natural way a student asks a question — `What is action
research?` — reached the catch-all intent `general_knowledge`, which retrieved
*nothing* and whose system prompt instructed the model to *"state clearly that
this is not from the library's collection"*. Every one of those topics has pages
in six or more books on the shelf. The reader was told, confidently and in
well-formed prose, that a teacher-education library holds nothing on action
research.

**Evidence.** `scripts/ai-answer-benchmark.ts`, `definition` category, 12
questions whose terms were each verified present in ≥5 books:
`retrieval 0%`, `grounded 0%`, 11/12 routed to `general_knowledge`.

**Root cause.** `retrieveFor()` returned `EMPTY_RETRIEVAL` for
`general_knowledge`, and `MODE_RIDER.general_knowledge` asserted the question was
off-catalogue. Both were decided by a keyword table, before any evidence existed.

**Fix.** `lib/ai/router.ts` — the catch-all now retrieves across the collection
before concluding the library has nothing. `lib/ai/prompts.ts` — the rider is
chosen from the **evidence**, not the label: passages present → the normal cited
document-question rider; none → the existing disclaimer, unchanged. Cost is one
embedding and two queries on a path that was already paying for a model call; it
adds no model call anywhere.

**Test.** `lib/ai/token-control.test.ts` — *"the general-knowledge rider follows
the EVIDENCE, not the label"* (3 cases, including that every other intent's rider
is untouched).

**Result.** `definition`: retrieval 0% → **92%**, grounded 0% → **92%**.

---

### F-2 · HIGH · PRODUCTION BUG · AI answer quality
**`Who wrote "X"?` answered "I couldn't find an author named "X"" for books in the catalogue.**

**Impact.** The single most common bibliographic question failed for every
quoted title. Quoting a title is how a reader disambiguates one.

**Evidence.** 10/10 `factual_lookup` questions failed. The answer text showed the
doubled quotation marks: `I couldn't find an author named ""Practical Research
Methods""`.

**Root cause.** No extraction path unwrapped quotation marks, so the author index
was searched for the literal string including the `"` characters.

**Fix.** `lib/ai/intent.ts` — `unwrapQuoted()` / `quotedSpans()`, applied in
`extractQuery` and `extractAuthorQuery`, plus a determiner+noun strip
(`the book "X"` → `X`). Straight, curly and Khmer «…» quotes.

**Test.** `lib/ai/intent.test.ts` — *"a quoted title is a title, not part of the
query"* (4 cases).

**Result.** `factual_lookup` retrieval 0% → **90%**.

---

### F-3 · HIGH · PRODUCTION BUG · AI retrieval
**Cross-collection research questions retrieved nothing, because the question's own frame was searched for.**

**Impact.** `What does the library's literature say about validity?` — the exact
question shape the cross-document path was built to serve — returned **zero**
lexical rows over a corpus holding many pages on validity.

**Root cause.** `intent.query` is both embedded and split into lexical terms.
The frame contributed terms of its own: `["literature", "validity", "library"]`
— three terms, which makes `minLexicalScore` demand **two** matches on a page. A
page discussing validity that does not also use the word "literature" scored 1
and was dropped. The same question without "library's" (two terms, floor 1)
retrieved normally.

**Fix.** `lib/ai/intent.ts` — `LITERATURE_LEAD_STRIP` removes the frame, leaving
the topic. The *frame* is stripped rather than the word blacklisted, so
"teaching literature" stays a findable subject.

**Test.** `lib/ai/intent.test.ts` — *"a cross-collection research question
retrieves on its topic"*, including *"leaves literature as a TOPIC alone"*.

---

### F-4 · MEDIUM · PRODUCTION BUG · AI retrieval (Khmer)
**Mixed Khmer/English questions could be starved by any multi-term match rule.**

**Impact.** Khmer has no word boundaries, so `តើសៀវភៅនេះនិយាយអ្វីអំពី sampling?`
enters lexical matching as **one** term — the whole Khmer frame — which an
English page can never contain. Under the stricter match floor introduced by F-5,
the mixed-language category fell from **80% to 40%** recall. This was caught by
the benchmark during the audit, before it shipped.

**Fix.** `lib/ai/intent.ts` — `KHMER_DEICTIC_STRIP` removes the Khmer frame the
same way F-3 removes the English one, leaving the Latin topic. A Khmer-only
question that would reduce to a bare interrogative (`អ្វី` = "what") keeps its
original text, so the document-sampling path is untouched.

**Test.** `lib/ai/intent.test.ts` — *"strips the Khmer deictic frame so the Latin
topic survives"* and *"does not reduce a Khmer question to a bare interrogative"*.

**Result.** Khmer 80% and mixed 80% recall, unchanged from baseline, with the
stricter floor in place.

---

### F-5 · MEDIUM · PRODUCTION BUG · AI retrieval
**A page sharing one ordinary word with the question counted as evidence.**

**Impact.** Over eight subjects verified to appear on **zero** pages of the
collection, `cryptocurrency mining rigs` was answered from a page about
readability formulas and `submarine hull design` from a chapter-summary page —
each admitted on two ordinary words, while the word that made the question that
question appeared nowhere. This is the raw material a confident wrong answer is
written from.

**Root cause.** `minLexicalScore` was a fixed `terms.length >= 3 ? 2 : 1`, which
says the same thing about a two-word question and a six-word one.

**Fix.** `lib/ai/evidence.ts` — the floor is a **majority** of the question's
terms; a two-term question needs both. The phrase bonus still lets a page
carrying the whole phrase win outright, and the semantic leg still covers
paraphrase.

**Test.** `lib/ai/evidence.test.ts` — *"minLexicalScore — a page must share the
QUESTION, not a word"* (4 cases, including that it never demands more matches
than the question has terms).

---

### F-6 · MEDIUM · PRODUCTION BUG · AI retrieval
**The widest question in the system had the smallest evidence budget — and the budget did not govern the production path anyway.**

**Impact.** `hybrid` — the cross-collection research question — got three
passages, one per record, 900 tokens: *less than a single document's own summary*
(5 / 1,400). Once F-3 stopped starving the candidate pool it roughly **doubled**
(12 → 24 rows) and was still squeezed through three slots by a one-per-record cap
that evicted correct pages.

Separately, `searchPassages()` defaulted its limit to `MAX_PASSAGES` (3), which
**silently overrode** `EVIDENCE_LIMITS.hybrid.evidence`. The one table that is
supposed to hold "the token bill of every mode" did not govern the path the
router takes — and `scripts/retrieval-benchmark.ts`, which calls
`retrieveEvidence` directly, was measuring a budget production never used.

**Fix.** `lib/ai/evidence.ts` — `hybrid` becomes `{ candidates: 18, evidence: 5,
perResource: 2, budgetTokens: 1_400 }`. `lib/ai/retrieval.ts` — `searchPassages`
defaults to the mode's own allowance.

**Test.** `lib/ai/evidence.test.ts` — *"the cross-collection mode is not the
thinnest one"*, plus two existing assertions **rewritten to state the property
they were protecting** rather than a literal number: no single record may take
half the evidence (true of both the old 1-of-3 and the new 2-of-5), and a mode
that carries an evidence budget raises the context ceiling by exactly that budget
plus 1,100.

**Result.** Cross-collection answers now draw on **5.0 passages from 3.7 distinct
sources** (was 2.9 from 2.9); `answered` 95% → **100%**.

---

### F-7 · MEDIUM · PRODUCTION BUG · AI catalogue search
**"Do you have the book X" was answered from the most-downloaded books sharing any word with X.**

**Impact.** The named book was absent from the results for **10 of 10**
exact-title questions, under the sentence "I found 5 books related to X".
`/api/search/native` returns the same titles first — so the public search page
was right and the assistant was wrong about the same collection.

**Root cause, two layers.**
1. `keywordBooks/Theses/Posts` fetched exactly `limit` rows ordered by
   `download_count` and never scored them: popularity *was* the ranking. This is
   the same defect `lib/search/ranking.ts` was written to fix for the public
   search, still present on the assistant's path.
2. `filterTokens()` emitted function words as `ilike` patterns — `%to%`, `%from%`
   match nearly every description — and capped by **position**, so
   `Key Ideas in Educational Research` spent slots on "Key" and "in" and never
   reached "Educational".

**Fix.** New pure module `lib/ai/work-ranking.ts` (`workScore` / `rankWorks`) —
title-match bands with popularity as a tie-break only; pools widened by
`CANDIDATE_FACTOR = 6` so the scorer has something to choose from.
`lib/ai/guardrails.ts` — `filterTokens` drops function words and orders by
specificity, keeping the whole phrase first and falling back to the raw words for
an all-function-word query.

**Test.** `lib/ai/work-ranking.test.ts` (10 cases) and
`lib/ai/grounding.test.ts` — 5 new `filterTokens` cases including the Khmer
single-term case.

**Result.** `exact_book` retrieval 0% → **40%**. **Still the weakest category —
see §7 Remaining technical debt.**

---

### F-8 · MEDIUM · PRODUCTION BUG · AI answer quality
**"Explain X as the library's books describe it" was answered with a row of covers.**

**Impact.** All 10 such questions routed to `book_search` (because "books" is a
catalogue keyword) and got the template *"I found 6 books related to …"* — no
page evidence, no synthesis.

**Root cause.** `LITERATURE_WORDS` paired a source noun with only the verbs
"say/show". Every other way of asking — describe, discuss, cover, explain,
define — fell through to the catalogue table one step below.

**Fix.** `lib/ai/intent.ts` — the verb side widened to the verbs `CONTENT_VERBS`
already lists for the same question asked while standing on a document.

**Test.** `lib/ai/intent.test.ts` — *"still routes it to the document path"*.

**Result.** `explanation` routing 0% → **100%**, grounded 0% → **90%**.

---

### F-9 · HIGH · SECURITY RISK / DOCUMENTATION GAP · Observability — **NOT FIXED**
**The security-monitoring pipeline has recorded nothing in production.**

**Impact.** `security_events` = **0 rows**, `security_incidents` = **0 rows**.
Detection, incident dedupe and Telegram alerting all read from `security_events`.
With no rows, `/api/cron/security-scan` runs every five minutes and finds
nothing, `/admin/security` shows an empty console, and no phone ever buzzes. The
organisation believes it is monitored and is not. The sink's documented failure
modes all degrade to *"the console line is still the record"* — so the failure
itself is invisible to every surface except container stdout.

**Evidence (reproducible).** Three requests to `/api/cron/cleanup` with
`Authorization: Bearer audit-probe-invalid-secret` at **11:38:55 UTC**, all
answered 401. `app/api/cron/cleanup/route.ts:46` calls
`logSecurityEvent({ type: "cron_auth_failed" })` on exactly that path. The sink's
flush interval is 2 s. Re-read 30 s later: still **0 rows**. An earlier identical
probe ~2 hours before produced the same result.

**Ruled out.** The table exists and is readable; **every one of the 17 columns
`lib/security/sink.ts` writes is selectable on the hosted schema**, so this is
not the hosted-schema drift that affects other tables. Contrast: `app_events`
holds 487 rows (`ai_request` 45, `storage_operation` 230, `reader_event` 212) and
`admin_audit_log` holds 381 — so the app's *other* durable writers work.

**Remaining candidates**, none decidable from outside the container:
`instrumentation.ts` not running in the standalone server; the dynamic import in
`register()` throwing (it logs `[instrumentation] security event sink not
installed` and continues); or the batch insert failing and being abandoned after
`MAX_ATTEMPTS`.

**Why it is not fixed here.** The cause is inside the container and the brief is
explicit: do not guess. **First diagnostic:** `docker logs` on the app container,
grep for `[instrumentation] security event sink not installed` and for the sink's
own drop/abandon warnings.

**Recommended fix, once the cause is known.** Make sink health *observable*, so
this can never again be invisible: expose "sink installed / last flush / dropped
count" on the already-authenticated `/admin/security` console. Deliberately
**not** on the public `/api/health` — advertising that monitoring is off is
itself a disclosure.

---

### F-10 · MEDIUM · PERFORMANCE ISSUE · Cold and revalidating renders — **NOT FIXED**

**Impact.** Warm production is fast — TTFB 0.25–0.61 s, full load 0.47–1.47 s.
The first visitor after an ISR window expires waits far longer:

| Route | cold / revalidating | warm | warm TTFB |
|---|---|---|---|
| `/theses` | **11.25 s** | 0.96 s | 0.30 s |
| `/publications` | **8.30 s** | 1.17 s | 0.61 s |
| `/` | 6.44 s | 2.22 s | 0.25 s |
| `/authors` | 7.49 s | 0.47 s | 0.59 s |
| `/posts` | 5.57 s | — | — |
| `/books` | 5.52 s | 0.54 s | 0.29 s |

The homepage is `s-maxage=60`, so a regeneration is due every minute and costs
2–6 s. Not blocking — `stale-while-revalidate` means most visitors get the stale
copy — but it is the largest remaining user-visible latency and it is not
measured by anything today.

**Recommendation.** Raise `s-maxage` on the listing pages, or move the expensive
part of `/theses` and `/publications` behind a cache tag revalidated by the
content mutation helpers rather than by a clock. Measure before and after.

---

### F-11 · MEDIUM · DATA INTEGRITY RISK · Two truncated PDFs — **CONTAINED**

Two book files are shorter than the size recorded for them:

| Book | recorded | stored | ratio |
|---|---|---|---|
| Data Analysis with Microsoft Excel (3rd Edition) | 10,931,200 B | 10,483,690 B | 95.9% |
| Publication Manual of the APA (7th Edition) | 31,656,960 B | 10,485,051 B | 33.1% |

**Both stop within 3 KB of exactly 10 MiB** — two unrelated files hitting the
same round boundary is a systematic write ceiling, not corruption.

**It is contained, and it was handled.** Both books are **unpublished**, so no
reader can reach them, and `admin_audit_log` carries a `book.unpublish` row
against exactly those two ids — an operator found them and took them down. The
ceiling is also **not currently in effect**: 79 published books exceed 10 MiB,
the largest is **81.0 MiB**, and all 268 published files pass the byte-for-byte
size check. The two bad files are residue from before the chunked-upload session
protocol (migration 0132).

**Action:** re-upload both from `/admin/edit/<id>`. Re-indexing cannot repair a
file whose bytes are missing.

---

### F-12 · LOW · TECHNICAL DEBT · Storage bookkeeping

23 orphan objects in 14 folders, **120.9 MB** reclaimable — files whose upload
succeeded and whose row insert did not, plus three obvious test artifacts at the
bucket root (`test_50mb-…pdf`, `test_limit-…pdf`, `book-…pdf`). **0 orphan rows**
— no catalogue entry points at missing bytes. `scripts/audit-book-storage.ts
--delete` removes the files and never touches a row.

Also observed: the storage listing returned **HTTP 429 nine times** during a
single sweep even with `ZIMA_API_KEY` set, each costing ~50 s of backoff. Worth
confirming the key is actually raising the rate limit it is supposed to raise.

---

### F-13 · LOW · TECHNICAL DEBT · `reasoning` and `fast` are the same model

`MODEL_IDS` resolves both tiers to `gemini-3.5-flash`, so `resolveTier`
returning `"reasoning"` — for a two-document comparison, or a multi-passage
question — buys a 512-token thinking budget and *not* a larger model, while the
code comment says `"reasoning"` is "the one shape where a bigger model measurably
changes the answer". Verified against the live model list: `gemini-3.5-flash` is
valid, and larger models (`gemini-3.1-pro-preview`, `gemini-3.8-flash`) are
available to the configured key. This is a **cheap, untested quality lever** —
not a defect, and it should be moved only with a `--live` answer-benchmark run
on either side of the change.

---

### F-14 · INFO · TEST GAP · Benchmark fixture labels

Four of the 14 misses in `scripts/retrieval-benchmark/questions.json` are label
artifacts, not defects, and the report reads better once they are known:

- `mixed-007` and `mixed-008` ask what a book says about *sampling* /
  *interviews*; those two books contain **zero** pages with those words. The
  questions are unanswerable as labelled.
- `khmer-001` / `khmer-006` (`សៀវភៅនេះនិយាយអំពីអ្វី?` = "what is this book
  about") route to `book_detail`, which answers from the catalogue record by
  design and retrieves no passages. Correct behaviour, labelled as a retrieval
  question.

---

## 5. AI failure classification (§13)

Every failing answer traced to **one** stage, and it was not the model:

| Class | Stage | Findings | Share of the failures found |
|---|---|---|---|
| **A** | Query understanding | F-1, F-2, F-3, F-4, F-8 | **dominant** |
| **B** | Retrieval | F-5, F-6 | secondary |
| **C** | Ranking | F-7 | secondary |
| D | Chunking / context | — | none found |
| **E** | Prompt | F-1 (rider contradicted its own evidence) | one |
| **F** | Model reasoning / synthesis | — | **none observed** |
| G | Citation | — | none — citation accuracy 100% throughout |
| H | Hallucination | — | **0 hallucinated citations**, before and after |
| I | No-answer handling | partial — 63%, see §7 | open |

In every failing case the model was either **never reached** (a template
answered) or reached **with an empty or wrong context**. There is no measured
instance of the model being handed correct, sufficient, well-ordered evidence and
producing a bad answer.

---

## 6. Measured results

### 6.1 Retrieval — `npm run retrieval:benchmark` (98 labelled questions, production corpus)

| | baseline `676be57` | shipped |
|---|---|---|
| ALL Recall@5 | 83% | 83% |
| **ALL top-1** | 66% | **70%** |
| **single_document top-1** | 77% | **87%** |
| multi_document Recall@5 | 55% | 55% |
| **multi_document evidence / answer** | 2.9 | **5.0** |
| **multi_document source spread** | 2.9 | **3.7** |
| **multi_document answered** | 95% | **100%** |
| khmer / mixed recall | 80% / 80% | 80% / 80% |
| scope isolation | 100% | 100% |
| no-evidence handled correctly | 100% | 100% |
| citation accuracy | 100% | 100% |
| misses | 14 | 14 |
| ALL p50 latency | 1,430 ms | ~900 ms |

No metric regressed. The benchmark was confirmed **deterministic** — two runs at
a fixed configuration produced byte-identical metrics — so these deltas are
attributable to the changes and not to run-to-run noise.

### 6.2 Answer quality — `npm run ai:answer-benchmark` (123 labelled questions)

| | before | after |
|---|---|---|
| Routing accuracy | 78% | **98%** |
| Retrieval correctness | 54% | **89%** |
| Context relevance | 62% | **70%** |
| **Groundedness** | 59% | **88%** |
| No-answer correctness | 63% | 63% |
| Unwanted template answers | 13 | **3** |
| **Hallucinated citations** | **0** | **0** |
| Evidence per answer | 1.6 | **2.8** |
| Avg input tokens | 303 | 482 |

Per category, the two that were completely broken:

| category | retrieval before → after | grounded before → after |
|---|---|---|
| `definition` ("What is X?") | 0% → **92%** | 0% → **92%** |
| `explanation` ("Explain X as the books describe it") | 0% → **90%** | 0% → **90%** |
| `factual_lookup` (`Who wrote "X"?`) | 0% → **90%** | — |
| `comparison` | 63% → **100%** | — |

**Token cost.** Average input rose 303 → 482 tokens (+59%), concentrated on
questions that previously retrieved nothing and are now answered from evidence.
Output token caps are unchanged, no model call was added to any path, and the one
mode whose ceiling moved (`hybrid`, 900 → 1,400 evidence tokens) is bounded by
the same table as every other mode.

---

## 7. Remaining technical debt / known gaps

1. **`exact_book` retrieval is 40%** (F-7). Ranking now beats popularity, but the
   assistant's catalogue leg still does not reliably surface an exactly-named
   title, while `/api/search/native` does. The right fix is to route the
   assistant's catalogue search through the public search's own ranking model
   rather than a second one — a larger change than this audit should carry.
2. **No-answer correctness is 63%**, unchanged from baseline. Three of eight
   subjects the collection provably does not hold are still answered from a page
   that shares a word. The remaining lever is term *specificity* (an IDF-style
   weight), which needs corpus statistics this audit did not build.
3. **`library_faq` routing is 67%** — 2 of 6 misroute. `"Across the collection,
   what is said about ethics?"` matches the FAQ table's `"the collection"` entry
   and is answered with the library's collection size.
4. **`What is action research?` routes to `thesis_search`**, because
   `"action research"` is a collection keyword. Defensible either way; it is the
   one remaining `definition` routing miss.
5. **`components/ui/chat/FloatingChat.tsx` is still imported by nothing**, so
   `/api/chat` still has no first-party caller (pre-existing, documented).

---

## 8. Production evidence appendix

```
GET https://library.ptec.edu.kh/api/health
{"status":"ok","checks":{"db":"ok","auth":"ok","storage":"ok"},"ts":"2026-09-10T09:33:33.261Z"}

Sitemap crawl (474 URLs, sequential):        474 × 200,  0 non-200
  /books 269 · /authors 158 · /subjects 24 · /catalogs 7 · /about 7 · /theses 3 · /posts 2

Anonymous probes
  /dashboard          307 → /auth/login?callbackUrl=%2Fdashboard
  /admin              307 → /admin/login
  /admin/{books,users,security,logs}   307
  /profile            307
  /api/books/<slug>/file               401
  /api/me/continue-reading             200  {"books":[]}   private, no-store
  /api/cron/{cleanup,index-reconcile,publish-scheduled,security-scan,upload-reconcile}
                      401 anonymous AND 401 with a wrong bearer

Image optimizer (/_next/image)
  allowlisted real cover                200  content-type: image/jpeg
  https://example.com/a.png             400
  http://169.254.169.254/latest/meta-data/   400
  https://evil.storage-ptec.online.attacker.com/a.png   400

PDF integrity, all 268 published books
  HEALTHY 268/268 · PROBLEMS 0 · broken range support 0 · unexpected content-type 0

Database (self-hosted Supabase, read-only)
  books 270 (268 published) · book_pages 249 books · book_chunks 249 books
  resource_index_state  indexed 250 · no_text_layer 19 · failed 2
  upload_sessions 141   COMPLETED 103 · ORPHANED 30 · FAILED 8 · mid-transition 0
  reading_progress 63 (16 users, 0 orphaned, 0 out of range) · reader_bookmarks 1
  admin_audit_log 381 · app_events 487 · download_logs 79 · search_queries 99 · ai_usage 12
  security_events 0 · security_incidents 0          ← F-9
  orphan audit: 8 derived tables, 0 orphans

Resource readiness
  metadata 100% · file 100% · text 92.5% · chunks 92.5% · embeddings 92.5%
  ai_ready 247/268 (92.2%) — 19 permanently image-only scans, 2 actionable
```

---

## 9. §29 — the AI training decision

**Do not train, fine-tune or replace the model.** The evidence bar the brief sets
is not met, and the measurements say why:

- Retrieval was **not** correct — F-3, F-5, F-6 (now 54% → 89%).
- Ranking was **not** correct — F-7.
- Context was **not** correct — half the failing questions had an empty one.
- The prompt was **not** correct — F-1 instructed the model to disclaim evidence
  it was being handed.
- Citations **were** correct throughout: 100% accuracy, **0 hallucinated
  citations** in 123 questions before and after.

Every failure traced to stages A, B, C or E. Not one traced to F. The model has
never been given a fair test on this corpus — and now, for the first time, there
is an instrument that could give it one.

---

## 10. Limitations — what was **not** verified

Stated plainly, because none of these should be read as passing.

1. **Authenticated cross-account (IDOR) testing in production did not happen.**
   Two production logins were requested and approved but never supplied.
   Authorization evidence is: anonymous probes against production, 42 RLS
   behavioural probes against a local stack running the identical migration
   chain, and the `lib/admin/*` + `lib/db/silent-mutation` invariant tests. The
   A→B / B→A matrix in the brief's Phase 2 is **untested**.
2. **Reader 2 and PWA regressions ran against a local stack, not production.**
   Both suites drive a real browser and real Cache Storage against the seeded
   database; neither exercised the deployed build.
3. **OS-level airplane mode, browser-process restart and installed-PWA
   validation were again not performed** — carried forward from the previous
   audit as a known limitation. The Playwright suite proves network independence
   by aborting the file endpoint and by a real offline reload, which is stronger
   than a mock but is not an installed app on a phone.
4. **The `--live` answer benchmark was not run.** All 123 answer-quality numbers
   come from the deterministic mock model, which measures routing, retrieval,
   context, grounding, citation and no-answer handling exactly, and measures
   **answer prose not at all**.
5. **F-9's root cause is undetermined** — it needs container logs.
6. **Destructive upload testing (interrupted / duplicate / failed finalize)
   was not performed against production.** Phase 5 evidence is code review plus
   the production state those paths left behind, not induced failure.
7. **Lighthouse / Core Web Vitals were not re-run**; performance numbers are
   curl-measured TTFB and total time, not field or lab web-vitals.

---

## 11. Recommended next phase

**PTEC is ready to move into AI Brain / Answer Quality 2.0** — with one gate in
front of it.

**Gate (do this first): resolve F-9.** A library whose security monitoring is
dark should not start a new feature phase. It is one `docker logs` away from a
diagnosis.

**The evidence that supports the readiness call:**

- The reliability floor is real and measured — 268/268 PDFs intact, 0 orphans,
  0 stuck uploads, 474/474 URLs live, Reader 2 and PWA green.
- Answer quality is now **instrumented**: `npm run ai:answer-benchmark` runs 123
  labelled questions through the real pipeline offline, with no billing and no
  drift, so a change can be defended with numbers instead of impressions.
- The largest quality problems were routing and retrieval, they are fixed, and
  the fixes are pinned by 36 new regression tests.
- Citation accuracy is 100% and hallucination is 0 — the grounding contract that
  Answer Quality 2.0 has to build on is sound.

**What Answer Quality 2.0 should take on, in the order the evidence ranks it:**

1. **Term specificity** — an IDF weight over the corpus. It is the single
   remaining lever behind both the 63% no-answer rate and the 40% exact-book
   rate, and both are recall-of-the-right-thing problems, not model problems.
2. **One ranking model** — retire `lib/ai/work-ranking.ts` into
   `lib/search/ranking.ts` so the assistant and the search page cannot disagree
   about the same collection. F-7 exists because they do.
3. **Run `--live`** and, for the first time, measure the *prose*: answer
   correctness against the 123-question set, with the F-13 tier question
   (`reasoning` and `fast` are currently the same model) settled by measurement.
4. **Only then** consider a model change. Not before.
