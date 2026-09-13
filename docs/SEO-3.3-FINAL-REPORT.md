# SEO 3.3 — Final Report: Topical Authority & Knowledge Graph

**Date:** 2026-09-13 · **Base:** `main` @ `d248a37` (+ Phase C instruments on `feat/verifier-fault-vocabulary`)
**Stack:** Next.js 16.3.4 (App Router, ISR), Postgres 17.6 (self-hosted Supabase, `pgvector`), ZimaOS pull-based deploy behind Cloudflare Tunnel.
**Evidence:** the production database (read-only service role) and live HTTP against `https://library.ptec.edu.kh`. Every number below was measured; where one was previously stated wrongly, the correction is kept beside it rather than overwritten.

This closes the phase opened by `docs/SEO-3.3-TOPIC-AUTHORITY-AUDIT.md`. Read that first for the premise; this document is the before/after.

---

## 0. What the phase set out to do, and the one rule it kept

The brief asked for topical-authority pages. The audit measured production first and found that most of the obvious shapes would be harmful — 693 single-use tags, 12 cross-taxonomy name collisions, a 296-book collection described as three populations. So the phase built **no new URL family**. Every gain below lives on `/subjects/[slug]`, `/paths/[slug]` and `/books/[slug]`, which already existed.

The rule that governed every step: **measure first, code second, and verify on production over HTTP before calling anything done.** Where that discipline changed a plan, the change is recorded in §5.

---

## 1. Phase A — data truth: before → after

| Measure | Before | After | Evidence |
| --- | ---: | ---: | --- |
| `books.language` values | 5 spellings incl. `kh` | **2** (`Khmer`, `English`) | migration 0145; 35 books that emitted no `inLanguage` now do |
| Subject hubs `index, follow` | **24** (every hub with ≥1 book) | **19** | `lib/subjects/indexability.ts`, §5 gate |
| Subject hubs `noindex, follow` | 0 | **4** | ភាសា, ចំណេះដឹងទូទៅ, ច្បាប់, វប្បធម៌ |
| Subject hubs suppressed (0–1 resources) | 1 (PISA, empty) | **2** | + វិធីសាស្ត្របង្រៀនរូបវិទ្យា (one 23-page book, was indexed and in the sitemap) |
| Subject URLs in `sitemap.xml` | 24 | **19** | one function decides sitemap and page robots |
| `subjects` rows | 12 of 25 categories | **25** | migration 0146 |
| `subjects` rows with a retired `book-<epoch>` slug | 10 | **0** | 0142/0143 had fixed `categories` only |
| `subjects` rows with `name_km` | 0 | **25** | `name_en` had held the Khmer string |
| `subjects.parent_id` set | 0 | **7** | 3 parents, 7 children — every pair among the strongest measured tag co-occurrences |
| `resource_subjects` edges | **0** | **301** | 298 primary (one per book with a category) + 3 PISA secondary |
| Books with a category but no canonical subject edge | 298 | **0** | |
| Catalogue embeddings, published books | 213 / 296 (72.0%) | **296 / 296** | 0 failures across 90 writes |
| កញ្ជប់គណិតវិទ្យា catalogue embeddings | **0 / 18** | **18 / 18** | the whole math kit was lexical-only |
| Books with text that are chunk-embedded | 255 / 271 | **270 / 271** | +3,707 chunks; the 1 remaining is a watermark-only scan (§5.4) |

**The indexability outcome is 19 / 4 / 2, not the 15 / 9 / 2 the audit first asserted.** The 15 came from the audit's §2 tier column — a hand-assigned reading of pages-per-book, counting books only — while the §5 rule counts every public resource, and the column's own arithmetic summed to 26 of 25 categories. The rule is what shipped; the threshold stays at 5 because ជីវវិទ្យា (5 books / 5 with full text), រូបវិទ្យា (5/5) and សុខភាព (6/5) are genuinely useful hubs and raising the bar to reproduce a wrong number would have penalised them.

**PISA kept its true categories.** `books.category_id` is a single FK, so "filing" the three PISA-D books under PISA would have deleted their ភាសា / វិទ្យាសាស្ត្រ / គណិតវិទ្យា classification to populate a hub that stays `noindex` at three books anyway. They carry a second `is_primary = false` edge instead, credited from the title (3 title matches, 0 tag-only), which is the reason the many-to-many table exists.

---

## 2. Phase B — internal linking: before → after

| Link | Before | After | Coverage |
| --- | --- | --- | --- |
| Book → learning paths that teach it | none | `<aside id="book-learning-paths">` | **29 of 296 books** (9.8%); 25 of them in >1 path |
| Subject hub → learning paths | none | curriculum rail | **2 of 25 hubs** (គណិតវិទ្យា 5 paths, ភាសា 4) |
| Learning path → its subject hub | none | reciprocal link | 9 of 9 paths resolve, under the library's existing substring rule (4 of 9 under exact equality — the audit's "9 of 9" was true only with the rule unstated) |
| Parent ↔ child subject hubs | none | breadcrumb + `hasPart`/`isPartOf` + subtopic rail | 3 parents, 7 children |

Two decisions the coverage numbers depend on:

* **Learning paths do not count toward the §5 gate.** A path is a curated wrapper around books already counted; letting ភាសា clear the bar on four wrappers would have re-inflated the thin hubs Phase A removed. 19 / 4 / 2 is unchanged by Phase B.
* **The combined package (`អំណាន និងគណិតវិទ្យា`) reaches only the maths hub**, because its subject string names reading, not language. That is a data fix for a librarian, not a code special-case, and it is left as such.

`learning_path_steps.resource_id` is an FK by convention — polymorphic, no foreign key — so every hop is checked; an unpublished path never reaches a public book page; a book used twice in one path is one membership; and the index is cached under the tag `revalidateLearningPath()` already fires, so a removed step leaves the book page on the next request with no second revalidation call to drift. Measured on production: 82 steps, all books, **0 dangling references**.

---

## 3. Live verification — the matrix, and what it took to trust it

Run individually against production after every deploy in this phase:

| Instrument | Checks | Result | Negative control |
| --- | ---: | --- | --- |
| `verify-production-entities.ts` | 10 | **10/10** | mock answering 200 with no JSON-LD → 10 FAIL |
| `verify-subject-indexability.ts` | 5 (+2 with `--slug`) | **5/5** | sitemap swapped for the hub list → contradiction check fires on all 4 thin hubs; 6 failures against pre-gate production |
| `verify-curriculum-links.ts` | 22 | **22/22** | wrong-content mock → 18 FAIL |
| `verify-topic-hierarchy.ts` | 40 | **40/40** | wrong-content mock → 38 FAIL; 26 failures against pre-deploy production |

**77 / 77.** But the first attempt to run them *as a suite* produced one `fail` and one aborted run, and nothing was wrong with the site: each script had its own try/catch and they disagreed about what a dropped connection meant — `fail` in one section of one file, `warn` twelve lines later. A post-deploy gate that goes red for weather trains its readers to ignore red.

Phase C therefore began by giving all four instruments one fault vocabulary (`lib/verify/http.ts`): a transport failure is `unknown` — never a pass, never a defect — retried twice (500 / 1000 ms) with a deadline on every fetch; a persisting 5xx is an *answer* and fails; a 4xx is never retried. An incomplete run exits 0 because the workflow does `exit "$rc"`, but its summary reads "7 passed, 3 could not be checked" — never "10 passed", and never `length − failed − warned`, which two of the scripts had been computing and which counts an unanswered check as a pass. Controlled both ways: an unroutable host yields `unknown` on all four; a wrong-content mock yields `fail` on all four. The suite then passed **77 / 77 back to back with every exit 0** — the case that had produced the false failures.

---

## 4. The crawl graph — click depth, orphans, and what Phase B bought

`scripts/audit-crawl-depth.ts`, breadth-first from `/`, same-origin anchors only, `robots.txt` honoured as Googlebot reads it, six concurrent fetches. Counts-only artifact: `artifacts/seo/crawl-depth-2026-09-13.json`. The first run is **not** the record — it had 17 unanswered pages including `/authors` and `/subjects` themselves (§5.6); the corrected run below had **1,650 fetches, 0 unanswered, 0 needed a retry**.

### 4.1 What the sitemap promises vs what the links deliver

| | Count |
| --- | ---: |
| URLs in `sitemap.xml` | 508 |
| Reachable by **clicking** from `/` | **507 (99.8%)** |
| Reachable including hreflang alternates | 507 |
| Orphans — no click path | 1 |
| Orphans — no path of any kind | **1** — `/authors/kenneth-n-berk-patrick-carey` (§5.5) |
| Broken internal links met | **0** |
| Indexable dead ends (no outbound anchor) | **0** |

The two locale trees are joined only by hreflang: no English page carries an `<a href="/km/…">` because the language switcher is client-side. That is fine for Googlebot and invisible to a reader, and the Khmer tree is fully self-contained once entered (79 `/km/` anchors on `/km/books`, zero English ones).

### 4.2 Click depth from `/`, English tree

| Family | n | min | median | max | ≥4 clicks |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/books` | 297 | 1 | **3** | 10 | **6 (2.0%)** |
| `/authors` | 157 | 1 | 2 | 2 | 0 |
| `/subjects` | 20 | 1 | 2 | 2 | 0 |
| `/paths` | 10 | 1 | 2 | 3 | 0 |
| `/catalogs` | 7 | 1 | 2 | 2 | 0 |
| `/theses` | 3 | 1 | 2 | 2 | 0 |
| everything else | 13 | 1 | 1 | 1 | 0 |

Books by click depth: **1 → 17 · 2 → 51 · 3 → 222 · 6 → 2 · 7 → 2 · 8 → 1 · 10 → 1.** 290 of 296 (98.0%) are within three clicks. The six that are not are reached only through listing pagination: `/books` links page 2 and page 17 from page 1 and then steps one page per click, so the middle of the range is the deepest — page 9 sits at click 9, and a book on it at click 10.

### 4.3 What Phase B bought — a counterfactual, labelled as one

There is no pre-Phase-B site to crawl. The instrument instead re-walks the measured graph with every edge *leaving* a `/subjects/*` or `/paths/*` page removed:

| | Actual | Without hub/path edges |
| --- | ---: | ---: |
| Books click-reachable | 296 / 296 | 296 / 296 |
| Median book depth | 3 | 3 |
| Books whose **shortest** path runs through a hub or path | **9 (3.0%)** | — |
| Clicks saved for those nine, median / max | **5 / 7** | — |

Stated plainly: **the dominant depth-reducer for books is the author page, and it predates this phase.** Every one of 157 author pages is within two clicks, so a book is at three through its author; `RelatedBooks` rails do the rest. Phase B's measurable depth effect is confined to nine books, all rescued by **subject hubs — none by learning paths** — and for those nine it is large: two STEPSAM3 teacher guides move from click 10 to click 3.

**Why those fifteen, and not others — verified against the database, not inferred.** All six deep books and all nine rescued books have the same author: **ក្រសួងអប់រំ យុវជន និងកីឡា (MoEYS)**, with **93 published books** — the only author in the library above 10. Its author page links **70** of them, because the works list is capped at `PER_TYPE_LIMIT = 60` (`lib/authors/profile.ts`), so **23 MoEYS books have no author path at all**. From there the subject hub decides: it lists at most `ITEMS_PER_TYPE = 12` books per hub (`lib/subjects/index.ts`), so a MoEYS book in a small category (គីមីវិទ្យា 8, ជីវវិទ្យា 5, សុខភាព 6, បច្ចេកវិទ្យា 7, វិទ្យាសាស្ត្រ 16) is on its hub and reached at click 3 — the nine — while a MoEYS book in គរុកោសល្យ (52 books) is past the cap, and falls all the way to listing pagination — the six. Two caps, one institutional author who wrote a third of the collection. The lever is §7.3.

What the depth audit does **not** measure is the phase's main deliverable — topical association: hub ↔ book, hub ↔ path, parent ↔ child, and the `CollectionPage`/`hasPart`/`isPartOf` graph that `verify-topic-hierarchy.ts` checks 40 ways. Depth was never going to move much on a site whose author pages already reach nearly every book; the claim this section supports is narrower and true: nothing Phase B added made any page deeper, nothing is orphaned by it, and the nine books it reaches were the ones nothing else did.

---

## 5. Findings and corrections

Kept in the open, because two of them were mine.

### 5.1 The audit's §5 arithmetic (corrected in #187)
"15 of 25 qualify; 9 THIN; 1 with one book; 1 with none" sums to 26 of 25. See §1.

### 5.2 The PISA recommendation would have destroyed data (corrected in #187)
The hub was already `noindex`, already out of the sitemap, already off `/subjects`. The single-FK move would have traded a true classification for nothing. See §1.

### 5.3 The 0107 subject backfill had drifted, unnoticed
`name_en` held Khmer on all 12 rows with `name_km` NULL; 9 slugs were retired strings; one name no longer matched its category. Nothing read the table, so nothing noticed — the 0105 contributor situation again. Repaired by 0146, verified against production (10/10) and against a fixture that exercised every branch, re-run to prove it writes 0 the second time.

### 5.4 A scanner watermark defeats `no_text_layer` detection
`គន្លឹះធរណីមាត្រ ថ្នាក់ទី ១១` is `status = indexed, pages = 32` — every page reads `"Scanned by CamScanner"` and nothing else. The chunker was right to refuse it. Blast radius measured: **1 record in 271**; logged as maintenance, not acted on.

### 5.5 A workless author page is indexable and in the sitemap — VERIFIED, NOT FIXED
`/authors/kenneth-n-berk-patrick-carey` answers 200 with `index, follow`, an `<h1>`, **zero book links and no Person/Organization node**. `/authors` correctly omits it (156 of 157 sitemap author pages are linked); the sitemap still advertises it. It is a soft-404 of exactly the shape the V2 subject fix removed, and the composite name ties it to the 3.2 backlog (§7.2).

The mechanism is three rules that never met: `fetchAuthorRows()` in `app/sitemap.ts` emits **every** row of `authors` and `publication_authors` with no works filter; `lib/authors/directory.ts` lists an entry only when `workCount >= 1` ("always ≥ 1 for a listed entry"); and `app/[locale]/(public)/authors/[slug]/page.tsx` sends `noindex` only for a slug that is *not found*, so a found author with zero works renders `index, follow`. The fix is one rule in one place — the sitemap and the page must both ask the directory's question — and it is deliberately not made in this measurement branch.

### 5.6 Instrument defects found and fixed during Phase C
* **`/auth` swallowed `/authors`** in the crawler's own skip list — the robots.txt trap from SEO V2, reproduced three lines under a comment citing it. Caught because the sitemap count came out 350 instead of 508; fixed to segment-boundary matching; pinned in `lib/verify/crawl-policy.test.ts`.
* **Click depth tracked incrementally was order-dependent.** A node first reached through an hreflang edge carried `null` and its children inherited it. Now computed once, post-hoc, over anchor edges.
* **The origin sheds ~1% of connections at concurrency 6** — 17 of 1,651 on the first run, five of them depth-1 hubs including `/authors` and `/subjects`, which silently emptied whole families and reported the weather as orphans. The crawler now re-queues unanswered pages for up to two gentler rounds and reports how many answered only on retry.
* **A deploy fingerprint proved the wrong deploy.** The `/_next/static` chunk hash changed for a docs-only commit; a verifier ran against that image and reported six failures that were the untouched baseline. Watches now gate on the `docker-publish` run for the specific SHA first.
* **A watch read an empty HTTP body as "populated".** `!= "0"` on a failed read. Rebuilt to require a numeric count and to say `read FAILED — NOT treating as applied`.

---

## 6. What is not known

* Whether Google has re-crawled the 19 indexable hubs and the 4 newly-`noindex` ones since the gate shipped. Search Console is the only source for that; §7.1.
* The pre-Phase-B crawl depth. There is no pre-Phase-B site; §4's counterfactual removes hub/path edges from the measured graph and is labelled as a counterfactual wherever printed.
* How many of the 43 composite author rows produce workless pages like §5.5. One is verified; the rest need the directory's rule applied to the sitemap and re-measured.

---

## 7. Roadmap

### 7.1 Google Search Console
Preconditions are met: `robots.txt` is well-formed (every rule `$`-anchored or slash-terminated), hreflang is reciprocal on every route, the sitemap emits one canonical entry per URL with both locales as alternates, and no sitemap URL answers `noindex`. Submit `https://library.ptec.edu.kh/sitemap.xml`; expect the 4 thin hubs and 2 suppressed to be reported as "excluded by noindex" — that is the gate working, not a defect. **Fix §5.5 first** so the submission does not advertise a soft-404.

### 7.2 The composite-author backlog (SEO 3.2 W-1)
43 of 157 `authors` rows and 46 of 162 `contributors` rows name several people. The public read model already handles them correctly (`soleContributorNode()`, `citationNames()`, re-normalised backfill rows), so no fabricated `Person` is published. What remains is that each composite row owns **one URL** that asserts no single identity; §5.5 is the first measured consequence. The path is the one the 3.2 audit set out: split at ingestion (already live for new records), then a deliberate, audited split of the historical rows with 301s — not a bulk migration.

### 7.3 The institutional-author cap (from §4.3)
One author, MoEYS, has 93 books; every other author has ≤ 10. The author page's `PER_TYPE_LIMIT = 60` was sized for people, and it leaves 23 MoEYS books with no author path — six of them at click 6–10, reachable only through paginated listing. The fix is not to raise the cap for everyone: it is to give an *organisation* author a complete, paginated works list (or a "view all" into `/books?author=…`, which is `noindex, follow` and still carries the crawl), and to let a subject hub with more than 12 books of one type link a paginated continuation rather than stop at 12. Both are one-file changes; both should be verified with `scripts/audit-crawl-depth.ts` — the expected result is the six deep books moving to click ≤ 3 and the counterfactual's "rescued" count rising, since more books would then have a hub path.

### 7.4 Thin-hub graduation
The gate is dynamic — a hub crossing 5 books flips to `index` and enters the sitemap on the next hourly revalidation with no deploy. What is missing is **notification**. Proposed: `verify-subject-indexability.ts --json` on the existing post-deploy workflow plus a weekly schedule, diffed against a committed baseline of the indexable set; a change in membership (not a count) posts to the existing Telegram alert, using the state-transition pattern `uptime.yml` already uses so a stable set stays quiet.
