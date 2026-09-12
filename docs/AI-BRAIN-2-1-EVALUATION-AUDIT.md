# AI Brain 2.1 — Evaluation Audit (Phase A)

**Branch** `feat/ai-brain-quality-2-1` · **Baseline commit** `acb914c` ·
**Recorded** 2026-09-12 · Measured against production
(`supabase.storage-ptec.online`, 268 published books, 249 with extracted
pages).

This is the audit the phase is required to produce *before* changing any
scoring: what a benchmark label currently means, how each metric is computed,
and which metrics are bound to the label rather than to the pipeline. Nothing
in this document proposes a fix; the fixes and their measured effect are in
`docs/AI-BRAIN-2-1-FINAL-REPORT.md`.

---

## 1. The frozen 2.0 baseline

Reproduced on this branch before a line was changed, all three suites clean
(no degraded run):

```
answer benchmark v1 (123 q, mock model, live corpus)
  routing 100% · retrieval 98% · context 75% · grounded 100% · no-answer 100%
  hallucinated 0 · unwanted templates 0 · failures 2
  tok-in 598 · p50 1046 ms · p95 2079 ms

answer benchmark v2 (37 edge cases)
  routing 100% · retrieval 97% · context 82% · grounded 94% · no-answer 100%
  failures 1 (v2-typo-003, "What is validty?")

retrieval benchmark (98 labelled questions)
  R@5 84% · R@10 84% · top-1 73% · scope isolation 100% · on-label 30%
  single_document  R@5 97% · top-1 93%
  multi_document   R@5 60% · top-1 20%
  khmer / mixed    R@5 80% / 80%
  no-evidence 100% · citation accuracy 100% · 13 misses

unit tests: 4,546 (7 failures, all React render timeouts at load average 352;
re-run individually at normal load, all pass — see §7)
```

These match `docs/AI-BRAIN-2-FINAL-REPORT.md` §3 and §6 exactly, so the
instrument is reproducible and the branch starts from a known point.

---

## 2. What a label means today

`scripts/ai-answer-benchmark/questions.json` (v1, 123 questions, never edited)
and `questions-v2.json` (37 edge cases) carry the same fields:

| Field | Meaning | Present on |
|---|---|---|
| `expectIntent[]` | intents the router may choose | all |
| `sources[]` | record slugs the question is labelled against | 102 of 123 (v1) |
| `scope` | the reader is inside one record ("Ask this book") | 32 (v1) |
| `expectGrounded` | the answer must carry a verified citation | 69 (v1) |
| `expectNoAnswer` | the collection cannot answer it | 8 (v1) |
| `templateOk` | a canned catalogue answer is correct | 32 (v1) |

There is **one** label shape, and every metric is computed against it the same
way regardless of what kind of question it is. That is the root cause of
everything in §4.

The source-count histogram for v1 is the tell:

```
1 source  → 52 questions     2 sources → 8      5 → 1      6 sources → 41
```

Forty-one questions carry exactly six slugs. Six was the cap the label
generator used when it scanned page text for a topic; those forty-one labels
are **recall lists**, not sets.

---

## 3. How each metric is computed

From `scripts/ai-answer-benchmark.ts`, as of `acb914c`:

| Metric | Computation | Bound to |
|---|---|---|
| routing | `expectIntent.includes(telemetry.intent)` | label (an enum — safe) |
| retrieval | `sources.some(s => seen.has(s))` where `seen` = cited ∪ evidence slugs | **label** |
| context | `|seen ∩ sources| ÷ |seen|` | **label** |
| grounded | `sources.length > 0` on the response | pipeline |
| hallucination | `telemetry.hallucinatedCitations` | pipeline |
| no-answer | `isRefusal(answer) && sources.length === 0` | pipeline |
| template rate | `telemetry.deterministic` | pipeline |

And the failure attribution (`lib/ai/answer-failure.ts`) already knew the
label could not always bear the weight — `expectedSourcesExhaustive` is true
only for a scoped question, and the CONTEXT stage is skipped otherwise. So the
*diagnosis* was already scope-aware while the *number in the table* was not.

The retrieval benchmark (`scripts/retrieval-benchmark.ts`) labels at page
level: `expect: [{ slug, pages[] }]`, and a question is a hit when the first
evidence passage's slug is expected **and** one labelled page falls inside its
merged page run. 533 expectations, 493 with pages, 15.8 pages each on average.

---

## 4. Five defects in the evaluation itself

### 4.1 `sources.some(...)` cannot express a multi-document question

"Compare A and B" is scored correct when the answer is drawn wholly from A.
Eight v1 questions and two v2 questions are genuine comparisons; all were
passing this way.

### 4.2 A recall list is used as a precision denominator

Context = share of retrieved passages drawn from the labelled set. For a
scoped question the label is exhaustive and that is the right measure. For the
41 topic questions it is not: the label names six books while 10–47 in the
collection carry the topic, so an answer drawing on a better, unlabelled book
scores **17%** context precision. The 2.0 report already says so and had to
leave the metric at 75% against a 90% target with the explanation "largely a
label artefact".

### 4.3 The *category* was being trusted to say what kind of question it is

Both fixtures have a `multi_document` category. Its questions are

> "Across the library's books, how is ethics handled?"

which names no work anywhere, and is labelled against six. The retrieval
fixture carries the same mislabel over 20 questions labelled against **12–34
documents each, 15.8 pages apiece**. Counting sources cannot fix this either:
`v2-synth-002` ("What does the literature say about phonics?") is labelled
against four and names nothing, while `v2-cmp-002` is labelled against two and
names both.

The only reliable discriminator is **whether the question text names the
work**, which is a pure function of two strings.

### 4.4 "Wrong document" and "wrong page" were one number

The retrieval benchmark reports one `rank`, null on a miss. Splitting the 8
`multi_document` misses by hand gives:

```
right document, wrong page   8
wrong document               0
```

That distinction was not available anywhere in the instrument, and it is the
difference between "retrieval cannot find this topic" and "retrieval found the
book and picked the wrong page in it".

### 4.5 A `metadata` answer was scored as if passages were its evidence

`exact_book` scores **20%** context in v1. The correct behaviour for "do you
have the book X?" is a card for X plus four related titles; the label names
one slug and the metric divides by five. There is nothing to fix in the
pipeline and nothing the number can be used for.

---

## 5. What §4.4 turned out to be hiding

The `multi_document` retrieval score (R@5 55–60%, top-1 20%) has been written
off as a label artefact in **two** previous audits. Separating "did retrieval
fail?" from "did the label fail?" gives a third answer neither had considered.

All 8 misses are the right document at the wrong page. The pages retrieved
instead, read out of `book_pages`:

| Retrieved | Text |
|---|---|
| Research Methods in Education 8e p.10 | `ix c o n t e n t s 11.13 Managing the planning of research 194 …` |
| Research Methods in Education 8e p.12 | `xi c o n t e n t s 24.4 Types of questionnaire items 475 …` |
| Research Methods in Education 8e p.20 | `xix 1.1 The functions of science 11 1.2 The hypothesis 13 …` (list of figures) |
| Social Research Methods 4e p.15 | `Detailed contents xiv Sampling error 188 …` |
| Qualitative Inquiry 4e p.7 | `Detailed Contents About the Authors Acknowledgments …` |

**A table of contents names every topic in its book**, so it matches more
query terms than any real page and wins the lexical leg outright — while
containing no claim a reader could be told and no sentence an answer could
cite. This is a ranking defect, and it was invisible for three audits because
the only instrument pointed at it was a page-level label everybody had already
agreed to distrust.

Measured across the whole 98-question retrieval benchmark, before any change:

```
furniture in retrieved evidence      53 / 252 = 21.0%
  …in the topic ("multi_document")   47 /  87 = 54%
  …in single_document                 0 /  56 = 0%
  …in summary                         0 /  39 = 0%
```

### 5.1 And the labels themselves contain front matter

Sampling 400 labelled `(slug, page)` pairs from the retrieval fixture and
classifying each page's text:

```
prose 353 · front_matter 30 · index 11 · sparse 6     →  47 / 400 = 11.8%
```

Every one of the 47 was read by hand and every one is genuinely a contents
page, a back-of-book index, a list of illustrations, a title page, or — in one
case — a 35-word cross-reference that *points at* three definitions and
contains none of them. The fixture's labels were built by scanning page text
for a phrase, and a contents page contains every phrase in its book.

This matters for how the numbers must be read: filtering front matter
necessarily *lowers* recall against these labels, because some labelled pages
are front matter.

---

## 6. What the 2.0 no-answer case actually was

`v2-typo-003`, "What is validty?", is the only question v2 left failing, and
the audit confirms it is structural rather than incidental:

- the lexical leg requires every term of a short topic to appear on a page
  (`requiredTerms`); no page in the collection contains `validty`;
- the semantic leg embeds the misspelling, whose vector sits below the 0.70
  chunk floor;
- the library's only typo tolerance is `search_library_fuzzy`, a trigram RPC
  over **titles** — and `validity` is not a title, it is a word printed on
  pages of 72 different books.

So both legs return nothing and the assistant refuses, correctly under its own
rules, to a reader whose question forty books can answer. The benchmark scored
this as **no-answer correctness 100%**, because the refusal metric counts
refusals and does not ask whether one was owed. A *false* no-answer rate is
a different measurement and did not exist.

---

## 7. The unit-test baseline, and a caution

`npx vitest run` reported 7 failures across 5 files on the first run of this
branch, at a machine load average of **352**. All seven are React component
render assertions (`PDFViewer`, `SignupContent`, `ThesisAbstractReader`,
`EngagementAnalytics`, `SecurityLogsClient`) — the signature of a known trap
in this repository: vitest produces phantom failures under load. Re-run
individually at normal load they pass. No `lib/ai` test failed in either run.

Check `uptime` before believing a local test failure here.

---

## 8. Conclusions taken into Phase B

1. A label must carry an **evidence scope**, and each scope decides which
   metrics it is entitled to answer.
2. Whether a question is multi-document is decided by **reading the question**,
   never by its category or its source count.
3. Where the label cannot bear a metric, the metric must be **excluded**
   (`null`, out of the denominator), never reported as a low number.
4. Where the label cannot bear a metric, measure the context by properties
   **of the context** instead — signal coverage, duplication — which need no
   fixture and cannot go stale as the collection grows.
5. Wrong-document and wrong-page are different failures and must be counted
   separately.
6. The front-matter finding in §5 is a real retrieval defect and is in scope,
   because it was found by the separation this phase exists to perform.
7. Recall measured against a fixture that is 11.8% front matter will *fall*
   when front matter stops being retrieved. That is the labels losing credits
   they should not have had, and the honest instrument for the change is the
   label-free furniture share, not R@5.

---

## 9. Reproducing this audit

```bash
# All three baselines (point .env at the production corpus; read-only)
npm run ai:answer-benchmark -- --suite v1 --diagnose
npm run ai:answer-benchmark -- --suite v2 --diagnose
npm run retrieval:benchmark -- --diagnose

# The scope derivation, printed as a census
npm run ai:answer-benchmark -- --suite v1 | sed -n '/EVALUATION 2.1/,/finishReason/p'
```

The local Supabase stack holds six books and no page text, so a run against it
measures nothing. `lib/indexing/environment.ts` exists because of a related
mistake and is worth reading before pointing any of this at a database.
