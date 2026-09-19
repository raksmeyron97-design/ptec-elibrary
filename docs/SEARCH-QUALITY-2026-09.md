# Search quality — September 2026

Two findings, one of them about the search engine and one about the instrument
that was supposed to be watching it. They are in that order because the second
is why the first went unnoticed.

Companion documents: `docs/search-ranking.md` (the relevance model),
`docs/RESEARCH-RETRIEVAL.md` (the AI's separate retrieval path).

---

## 1. Finding A — a word matched because it was inside another word

`[PRODUCTION]` `https://library.ptec.edu.kh`, 2026-09-19:

```
GET /api/search/native?q=blockchain cryptocurrency mining   → 4 results
     Examining Lesson Quality
     Student Statistics: Challenges in Collection and Validity
     Three Essays on Macroeconomic Management of Cambodia
     Quantitative Data Analysis in Education

GET /api/search/native?q=formula one aerodynamics           → 26 results
     របៀបបង្កើត_Google_classroom_តាម_ipad_or_iphone
     Lesson 9: Using a Smartphone Camera
     Mobile Phones and Internet Use in Cambodia 2016
```

The library holds nothing on blockchain, cryptocurrency, motorsport or
aerodynamics. It is not the database being generous:

```
"mining"  ⊂  "Exa|mining| Lesson Quality"
"one"     ⊂  "Smartph|one|", "Ph|one|s"
```

### Root cause

Two layers asked the same unanchored question, and only one of them should
have.

`orFilter()` in `app/api/search/native/route.ts` builds
`field.ilike.%token%` — an unanchored substring — and that is **correct**.
Khmer has no word boundaries and no segmenter is available here, so a Khmer
query must be able to match inside a run. It is what makes `ការចិញ្ចឹម`
("raising / farming") find `ការចិញ្ចឹមមាន់`.

`searchScore()` in `lib/search/ranking.ts` then used `String.includes()` on
normalized text for every term, in both scripts. In Latin text, where
boundaries exist, that scores an accident as relevance — and it did:
`Examining Lesson Quality` was not merely swept into the pool, it was awarded
`termTitle` and reported `matchedFields: ["title"]`.

### The change

`termMatches(haystack, term)` in `lib/search/normalize.ts` — per script, the
same asymmetry `typoTolerance()` in the same file already applies for the same
underlying reason:

* **Khmer term** → substring, unchanged.
* **Latin term** → the term must BEGIN a word. Prefix, not whole word, because
  truncation is how people search: `research` must still find `Researching`.
  What stops is matching the end or the middle of a word.

And in `rankCandidates()`, a row the model says nothing about is dropped. That
rule and its reasoning already existed in that function for ISBN queries —
rows the loose ISBN pattern swept in "scored nothing and are not results" —
and everything in the pool arrives the same way. Two exemptions:

* **the trigram seeds**, because the index made a positive claim about the row
  that the term scorer cannot see, which is the entire reason the fuzzy pass
  exists;
* **the count**, which is *reduced* by the drops rather than replaced by the
  page that survived — `ranked.length` would understate a broad query by the
  size of the fetch limit.

### Measurement

A production ranking change cannot be measured before it is deployed, because
`scripts/search-benchmark.ts` is a black-box HTTP client against the running
site. So the change was measured by **replaying the rows production actually
returned** for all 100 benchmark queries through both the old and the new rule
(`searchScore` is pure, so this is the real function):

| | |
|---|---:|
| Rows production displayed | 578 |
| Rows the new rule drops | **35 (6.1%)** |
| **Labelled records among them** | **0** |

`[LOCAL]` Approximate in one direction only: the replay uses the API's
truncated `excerpt` in place of the full description, so a match living in the
truncated tail is invisible and 35 is an **upper bound** on the drops.

Every dropped row reads as junk on inspection. All four `blockchain
cryptocurrency mining` rows are dropped; that query now returns nothing, which
routes it to the existing no-result recovery UI.

### What this does NOT fix

`formula one aerodynamics` still returns two rows, both of which contain the
**word** "one" (`The Book of GEET Book One Basic Science`). That is an honest
match. Removing it needs a stopword list, which is a larger judgement call with
its own recall risk, and is deliberately not attempted here.

Khmer negative queries are unchanged **on purpose**: `ការចិញ្ចឹមត្រីបាឡែន`
(whale farming) returns chicken, pig and frog farming because they share
`ការចិញ្ចឹម`. That is a real partial match and the only kind Khmer has.

---

## 2. Finding B — the benchmark's `subject` score was a label artefact

`[PRODUCTION]` Before any change, the suite reported:

```
category  n   R@1   R@5   R@10  MRR   zero
subject   12  33%   42%   42%   0.38  0%
mixed     10  60%   60%   60%   0.60  0%
ALL       90  84%   87%   87%   0.86  0%
```

`subject` at 42% reads like a ranking defect. It is not one.

```
GET /api/search/native?q=គណិតវិទ្យា    → 484 results, scored MISS

  1. គណិតវិទ្យា ថ្នាក់​ទី​៧ មេរៀន​ទី​៨៖ មាឌ និងផ្ទៃក្រឡាខាង
  2. គណិតវិទ្យា ថ្នាក់ទី៩
  3. គណិតវិទ្យាថ្នាក់ទី_១១
  4. គណិតវិទ្យា_ថ្នាក់ទី៨
```

Four mathematics textbooks answering a query for mathematics. None of them is
on a list of seventeen slugs written when the collection held **270** books;
production held **1,916** on 2026-09-19. The four `mixed` misses are the same
four topics.

This is the trap `CLAUDE.md` already records for the AI retrieval fixture —
"benchmark labels go stale, and `multi_document` R@5 is currently misleading" —
reaching the search suite, where nothing was watching for it.

### The change

A label now carries a **scope**, derived from the fixture and never chosen per
query:

| Scope | Rule | May answer |
|---|---|---|
| `exhaustive` | fewer than 5 expected records — an enumeration a cataloguer could complete | R@k, MRR |
| `partial` | 5 or more — a sample of a set the collection has outgrown | label-free metrics only |
| `negative` | names a subject the collection provably does not hold | label-free metrics only |

Three rules follow, all of them copied deliberately from
`lib/ai/evaluation.ts`:

1. **A metric a label cannot bear prints as `—` and leaves the denominator,
   never as a zero.** The two mean opposite things, and a table that renders
   them identically is how "42% of subject queries fail" would have been read.
2. **The census is in the table** (`lab` column), so the split cannot be
   quietly moved to flatter a number.
3. **Partial labels are judged by a property of the RESULTS** —
   `topicalPrecision`, the share of returned rows carrying a query term in
   their own text. It needs no fixture and cannot go stale. It is implemented
   *inside the benchmark* rather than imported from `lib/search/normalize.ts`,
   because the word-boundary rule is the thing under test and importing it
   would make a bug in it invisible to the instrument watching for one.

An ISBN query answers `topicalPrecision` with `—` as well: it is resolved by
identity, and its digits are not in any title.

### The `negative` category

Ten queries naming subjects the collection does not hold. It is the only
category here that measures precision, and it exists because **a suite where
every query has an answer cannot see a system that answers everything.**

## 3. Baseline

`[PRODUCTION]` `2026-09-19`, against the deployed code, under the new
instrument. Committed as
`scripts/search-benchmark/results/2026-09-19-production-before-precision-fix.json`.

```
category  n    lab  R@1   R@5   R@10  MRR   topical  zero
title_en  12   12   100%  100%  100%  1.00  86%      0%
title_km  12   12   100%  100%  100%  1.00  53%      0%
mixed     10    3   100%  100%  100%  1.00  92%      0%
author    12   10   90%   90%   90%   0.90  93%      0%
subject   12    0   —     —     —     —     94%      0%
typo      10   10   90%   100%  100%  0.95  81%      0%
isbn      10   10   100%  100%  100%  1.00  —        0%
pdf_text  12   12   100%  100%  100%  1.00  70%      0%
negative  10    0   —     —     —     —      3%     30%
ALL      100   69   97%   99%   99%   0.98  75%      3%
```

Read it this way:

* **R@1 97% / R@5 99% / MRR 0.98 over the 69 labels that can bear it.** This is
  what the suite was measuring all along. The old headline of 84%/87% was
  mostly the stale labels.
* **`subject` topical precision 94%.** The ranker was doing well on broad
  topical queries the whole time.
* **`negative` topical precision 3%.** 97% of the rows returned for subjects
  the library does not hold carry no query term at all. This is the number
  Finding A exists to move, and it cannot move until deployment.
* `title_km` at 53% and `pdf_text` at 70% are the blended landing view being
  measured across all six types, not a defect in either: the view returns four
  rows per type, and a weak row from another type is part of what the reader
  sees.

`[UNKNOWN]` p95 latency on this run ranged from 716 ms to 14.5 s across
categories, against 1.2 s on an earlier run the same hour. Network or origin
variance; not investigated, and no conclusion is drawn from it. A slow Khmer
query on this route has been observed before and its cause is still unknown.

## 4. Reproducing it

```bash
npx vitest run lib/search                                     # the rules, offline
npx tsx scripts/search-benchmark.ts --base https://library.ptec.edu.kh
npx tsx scripts/search-benchmark.ts --base https://library.ptec.edu.kh \
  --compare scripts/search-benchmark/results/2026-09-19-production-before-precision-fix.json
```

The run takes about four minutes: the route is rate limited to 30 requests per
minute per IP and the client waits 2.1 s between queries.

## 5. Status

| | |
|---|---|
| Implemented | `[LOCAL]` + `[CI]` |
| Measured | `[LOCAL]` replay over production responses: 6.1% of displayed rows dropped, 0 labelled records lost |
| Verified in production | **Not yet.** A black-box benchmark cannot measure undeployed code. |
| How it will be verified | Re-run the command in §4 after deploy. The gate is `negative` topical precision moving toward 100% and `negative` zero-result rate toward 100%, with the exhaustive R@k unchanged. |
| Deferred | A stopword list for very short Latin terms; alias-aware author search (the one genuine `author` miss, `សិត សេង`, is a book credited `Set Seng` whose Khmer name lives only on an academic profile row). |
