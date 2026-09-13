# SEO 3.3 — Production Content & Topic Authority Audit

**Date:** 2026-09-13 · **Base:** `main` @ `99d8311`
**Evidence:** production database (`supabase.storage-ptec.online`), read-only service role, and live HTTP. Every number below was measured. Nothing is estimated; where a figure is unknown it says so.

---

## 0. Read this first — the brief's premise does not match production

The kickoff describes *"the live published catalog (298 books, theses, publications)"* as three populations. Measured:

| Resource type | Rows | Published |
| --- | ---: | ---: |
| Books | 298 | **296** |
| Theses (`research_reports`) | 1 | **1** |
| Publications | **0** | 0 |
| Physical catalog | 6 | 6 active |
| Learning paths | 9 | **9** |
| Posts | 1 | 1 |

**This is a 296-book collection.** There is no thesis corpus and no publication corpus to build topical authority from — one thesis is not a population. Every recommendation below is sized for that reality.

Three further facts decide the whole phase:

1. **`resource_subjects` holds 0 rows.** The canonical subject graph — `subjects` + `resource_subjects` (migration 0107) — is an empty shell, exactly as `contributors` was before SEO 3.2's backfill. The `subjects` table has 12 rows, **none** with a `parent_id`, **none** with a Khmer name. There is no concept hierarchy in the database today.
2. **The topic hub surface already exists.** `/subjects/<slug>` is live, indexable, slug-gated (SEO 3.0) and carries 301s for retired slugs. The question is not whether to build a topic surface — it is whether to deepen the one we have.
3. **923 distinct tags, 693 used exactly once (75%).** This is the single largest thin-page hazard in the dataset, and it is precisely what a programmatic `/topics/<tag>` family would turn into ~693 one-item pages.

---

## 1. Production content inventory

### 1.1 Books by language — a data-quality defect first

| Value | Books |
| --- | ---: |
| `Khmer` | 157 |
| `English` | 102 |
| `kh` | 35 |
| `en` | 1 |
| `khmer` | 1 |

**Five values for two languages.** `books.language` is free text. Anything that facets, filters or emits `inLanguage` by this column is wrong for 37 of 296 books (12.5%) today. This must be normalised **before** any language-aware topic surface exists, not after.

### 1.2 Retrieval corpus

| Measure | Value |
| --- | ---: |
| Books with extracted full text (`indexed`) | **271 / 296 (91.6%)** |
| `no_text_layer` (scans — a permanent fact) | 25 |
| `failed` (our bug, retryable) | 2 |
| Indexed pages | **60,778** |
| Semantic chunks | 134,775 |
| Books with a catalogue-level embedding | **213 / 296 (72.0%)** |

The retrieval corpus is real and substantial. The catalogue-embedding gap (83 books) is the notable hole — see §7.

---

## 2. Subject / topic depth matrix

24 of the 25 categories hold at least one published book. Depth, measured:

| Category | Books | Indexed | Pages | Pages/book | Embedded | Tier |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| ស្រាវជ្រាវ (Research) | 65 | 59 | 19,922 | 306 | 63 | **DEEP** |
| គរុកោសល្យ (Pedagogy) | 52 | 51 | 11,812 | 227 | 32 | **DEEP** |
| ស្រាវជ្រាវប្រតិបត្តិ (Action research) | 18 | 18 | 3,212 | 178 | 18 | **DEEP** |
| កញ្ជប់គណិតវិទ្យា (Math kit) | 18 | 12 | 952 | 53 | **0** | VIABLE* |
| វិទ្យាសាស្ត្រ (Science) | 16 | 16 | 1,967 | 123 | 15 | **DEEP** |
| គណិតវិទ្យា (Mathematics) | 13 | 13 | 1,596 | 123 | 10 | **DEEP** |
| ភាសាអង់គ្លេសសិក្សា (English studies) | 13 | 9 | 2,257 | 174 | 9 | VIABLE |
| ស្រាវជ្រាវបែបគុណភាព (Qualitative research) | 13 | 13 | 6,109 | **470** | 13 | **DEEP** |
| ស្ថិតិ និងវិភាគទិន្នន័យ (Statistics) | 11 | 11 | 3,988 | 363 | 11 | **DEEP** |
| គីមីវិទ្យា (Chemistry) | 8 | 8 | 884 | 111 | 7 | VIABLE |
| ប្រវត្តិសាស្ត្រ (History) | 7 | 7 | 634 | 91 | 3 | VIABLE |
| កម្មវិធីសិក្សា (Curriculum) | 7 | 6 | 764 | 109 | 2 | VIABLE |
| បច្ចេកវិទ្យា (Technology) | 7 | 7 | 814 | 116 | 4 | VIABLE |
| ទស្សនវិជ្ជា (Philosophy) | 7 | 5 | 1,207 | 172 | 2 | VIABLE |
| អប់រំ (Education) | 6 | 6 | 650 | 108 | 2 | VIABLE |
| សុខភាព (Health) | 6 | 5 | 245 | 41 | 4 | THIN |
| រូបវិទ្យា (Physics) | 5 | 5 | 705 | 141 | 4 | THIN |
| អក្សរសិល្ប៍ (Literature) | 5 | 4 | 295 | 59 | 1 | THIN |
| ជីវវិទ្យា (Biology) | 5 | 5 | 633 | 127 | 5 | THIN |
| ភាសា (Language) | 4 | 3 | 372 | 93 | 1 | THIN |
| ចំណេះដឹងទូទៅ (General knowledge) | 3 | 2 | 379 | 126 | 2 | THIN |
| វប្បធម៌ (Culture) | 3 | 2 | 333 | 111 | 1 | THIN |
| ច្បាប់ (Law) | 3 | 3 | 1,025 | 342 | 3 | THIN |
| វិធីសាស្ត្របង្រៀនរូបវិទ្យា (Physics teaching methods) | **1** | 1 | 23 | 23 | 1 | **SUPPRESS** |
| កម្មវិធី PISA | **0** | — | — | — | — | **SUPPRESS** |

**The `Tier` column is a reading aid and decides nothing.** It weighs
pages-per-book and counts books only; the indexability gate counts every public
resource and reads full-text state from `resource_index_state` (§5.1), so four
categories labelled THIN here are `index` under the rule. Where the two
disagree, §5 is authoritative.

\* `កញ្ជប់គណិតវិទ្យា` has 18 books but **0 catalogue embeddings and only 53 pages/book** — it is a workbook series, not a reading collection. Viable as a *browse* surface, weak as an *answer* surface.

### 2.1 The concentration problem

**117 of 296 books (40%) sit in two categories.** `ស្រាវជ្រាវ` and `គរុកោសល្យ` are where the authority actually is — and they are also the two broadest, least specific labels in the vocabulary. The long tail is 13 categories at ≤7 books.

Departments are worse as a topic axis: `ស្រាវជ្រាវ` alone holds **115 of 296 (39%)**. That is a shelf, not a subject.

---

## 3. Topic clustering and concept hierarchy

### 3.1 What hierarchy actually exists

| Axis | Source | Rows | Hierarchical? |
| --- | --- | ---: | --- |
| Category | `books.category_id` → `categories` | 25 | **No** — flat |
| Department | `books.department_id` → `departments` | 16 | **No** — flat |
| Subject (canonical) | `subjects` | 12 | **No** — `parent_id` null on all 12 |
| Tags | `books.tags[]` | 923 | **No** — folksonomy |
| Learning path | `learning_paths` | 9 | **Yes** |

**`learning_paths` is the only real curriculum hierarchy in production**, and it is genuinely well-formed:

| Path | Subject | Grade | Difficulty |
| --- | --- | --- | --- |
| Early Grade Mathematics: Grade 1 | គណិតវិទ្យា | 1 | beginner |
| Early Grade Mathematics: Grade 2 | គណិតវិទ្យា | 2 | beginner |
| Early Grade Mathematics: Grade 3 | គណិតវិទ្យា | 3 | intermediate |
| Early Grade Mathematics: Complete Primary | គណិតវិទ្យា | 1–3 | intermediate |
| Early Grade Reading: Grade 1 Literacy & Phonics | ភាសាខ្មែរ | 1 | beginner |
| Early Grade Reading: Grade 2 Fluency | ភាសាខ្មែរ | 2 | beginner |
| Early Grade Reading: Grade 3 Comprehension | ភាសាខ្មែរ | 3 | intermediate |
| Early Grade Reading: Complete Khmer Literacy | ភាសាខ្មែរ | 1–3 | intermediate |
| Early Grade Learning: MoEYS Reading & Mathematics | អំណាន និងគណិតវិទ្យា | 1–3 | intermediate |

This is `Subject → Grade → Path → Resources`, already live, already indexable, and already carrying the Track × Grade facets shipped in #180.

### 3.2 The grade axis in books

**60 of 296 books (20%) carry a grade tag.** Distribution:

| Grade | Books | | Grade | Books |
| --- | ---: | --- | --- | ---: |
| ថ្នាក់ទី១ (1) | 11 | | ថ្នាក់ទី៩ (9) | 6 |
| ថ្នាក់ទី៣ (3) | 11 | | ថ្នាក់ទី១១ (11) | 4 |
| ថ្នាក់ទី២ (2) | 10 | | ថ្នាក់ទី១០ (10) | 2 |
| ថ្នាក់ទី៨ (8) | 6 | | ថ្នាក់ទី១២ (12) | 1 |
| ថ្នាក់ទី៧ (7) | 6 | | ថ្នាក់ទី៥, ទី៦ | 1 each |

Grades 1–3 carry 32 books and are matched by 8 learning paths. **Grades 5–12 carry 27 books across 8 grades — an average of 3.4 per grade.** A `Subject × Grade` page family across all grades would be thin everywhere except primary.

---

## 4. Internal link opportunities

Existing contextual links on a book page: subject crumb (one, and only when the category resolves to a subject with resources), related-by-category, and the author hub link. There is **no** link from a book to a learning path that contains it, and none from a subject to the paths that teach it.

Measured opportunities, in order of evidence:

| Opportunity | Basis | Scale |
| --- | --- | --- |
| Book → learning path that includes it | `learning_path_steps` (existing FK) | 9 paths, real membership |
| Learning path → its subject hub | `learning_paths.subject` matches a category name | 9 of 9 resolve |
| Subject → sibling subjects by co-occurrence | books sharing ≥2 tags across categories | **UNKNOWN — not yet measured** |
| Grade tag → learning path of that grade | grade tag ↔ path grade | 32 primary books |

The first two are data-backed, cost nothing, and are the highest-value internal linking available. The third needs measurement before it is promised.

---

## 5. Indexability criteria — applied

> **Correction, 2026-09-13.** This section's arithmetic was wrong in the first
> revision, and the error is worth stating plainly because the numbers were
> approved before they were checked. It read *"15 of 25 categories qualify; 9
> are THIN; 1 has a single book and 1 has none"* — which sums to **26 of 25
> categories**. The 15 was not produced by the rule below at all: it was
> `DEEP + VIABLE` from the §2 tier column, a hand-assigned judgement that
> weighed pages-per-book and counted **books only**, while the rule counts every
> public resource. Running the shipped `subjectVisibility()` over production
> gives **19 index / 4 noindex / 2 suppressed**. The rule is what shipped; the
> tier column is a reading aid and decides nothing.

A topic surface may be indexable only when **all** of:

1. **≥ 5 published resources.** Below this a hub is a list, not a page.
2. **≥ 3 resources with extracted full text.** A hub whose items cannot be
   searched inside or cited by AI is a directory entry.
3. **A distinct label** — not colliding with another taxonomy's page (§6.1).
4. **A stable slug** already routable and gated.
5. **Non-empty in both locales** or explicitly `noindex` in the locale where it
   is empty.

Only 1 and 2 vary per subject on this schema, so only they are evaluated per
request. The others are structural and already hold: categories are the sole
routable taxonomy, so the 12 collisions in §6.1 cannot yet produce two competing
URLs; every hub is slug-gated; and one row set renders both locales, so a
subject is never non-empty in one and empty in the other. **Adding a second
routable taxonomy is what makes 3 a live per-subject question** — and it must
then be re-decided in `lib/subjects/indexability.ts`, not at the new surface.

### 5.1 Measured outcome — 19 index / 4 noindex / 2 suppressed

Counting every public resource (books + theses + publications + physical
catalog) and full text from `resource_index_state`:

| Verdict | Categories | What it means |
| --- | ---: | --- |
| `index, follow` | **19** | in the sitemap, linked, indexable |
| `noindex, follow` | **4** | linked from `/subjects`, out of the sitemap |
| suppressed | **2** | also dropped from the hub's list and ItemList |

Held back: `ភាសា` (4 resources), `ចំណេះដឹងទូទៅ` (3), `ច្បាប់` (3), `វប្បធម៌` (3).
Suppressed: `កម្មវិធី PISA` (0) and `វិធីសាស្ត្របង្រៀនរូបវិទ្យា` (1).

The sitemap therefore carries **19** subject URLs where it carried 24, and
`/subjects` links **23** where it linked 24. Figures produced by running the
shipped `subjectVisibility()` over the production database, not by a separate
script reimplementing the rule — an earlier draft of this paragraph said 5/1
because a throwaway script had its own copy of the thresholds.

Four categories the §2 tier column called THIN clear the rule comfortably —
`សុខភាព` (6 resources / 5 with full text), `ជីវវិទ្យា` (5/5), `រូបវិទ្យា` (5/5),
`អក្សរសិល្ប៍` (5/4). They are thin in *pages per book*, which is a different
claim from thin in *resources*, and §5 measures the second. Raising criterion 1
to ≥ 7 would reproduce the 15 the first revision asserted; that is one constant
(`SUBJECT_MIN_RESOURCES`) and no other change.

### 5.2 What was actually live before this

`getIndexableSubjects()` was `counts.total > 0`. Verified on production
2026-09-13, before the fix:

```
/subjects/វិធីសាស្ត្របង្រៀនរូបវិទ្យា  (1 book)   index, follow   IN SITEMAP
/subjects/ចំណេះដឹងទូទៅ                (3 books)  index, follow   IN SITEMAP
/subjects/ស្រាវជ្រាវ                  (65 books) index, follow   IN SITEMAP
```

A one-book hub was advertised on exactly the terms of the 65-book collection.

### 5.3 `កម្មវិធី PISA` — no defect, and the fix would have caused one

An earlier draft of this audit called the empty PISA category "empty and
indexable". **It is neither.** Verified on production:

| Check | Result |
| --- | --- |
| `/subjects/កម្មវិធី-pisa` robots | `noindex, follow` |
| In `sitemap.xml`? | No — only the 3 PISA *books* are |
| Linked from `/subjects`? | No — 24 links, PISA absent |

The V2 `total > 0` gate already handled the zero case correctly; the audit
overstated it. Nothing about PISA needed fixing.

Filing the 3 PISA books into it would have been an active loss.
**`books.category_id` is a single foreign key**: filing a book under PISA
*removes* it from `ភាសា` / `វិទ្យាសាស្ត្រ` / `គណិតវិទ្យា`. The trade is a true
classification destroyed (the PISA-D reading book genuinely is a language book;
`ភាសា` would fall 4 → 3) for a hub that holds 3 books — still below criterion 1,
so still `noindex` either way. "This book is both PISA and language" is a
many-to-many statement, and `resource_subjects` is where it belongs.

## 6. Thin-topic and cannibalization guards

### 6.1 Name collisions — 12 measured, already present

| Label | Appears as |
| --- | --- |
| ស្រាវជ្រាវ | category **+** department **+** subject |
| គណិតវិទ្យា | category **+** department **+** subject |
| គរុកោសល្យ | category **+** department **+** subject |
| វិទ្យាសាស្ត្រ | category **+** department **+** subject |
| កម្មវិធីសិក្សា | category **+** department **+** subject |
| ជីវវិទ្យា | category + department |
| សុខភាព, កម្មវិធី PISA, ភាសាអង់គ្លេសសិក្សា, ស្រាវជ្រាវបែបគុណភាព, ស្ថិតិ និងវិភាគទិន្នន័យ, កញ្ជប់គណិតវិទ្យា | category + subject |

Five labels exist in **three** taxonomies simultaneously. Today only the category surface is routable, so nothing collides in practice. **The moment a second taxonomy gets a URL family, these 12 become 12 duplicate-intent page pairs.** This is the strongest single argument against adding a new topic URL family.

### 6.2 Thin topics

* **1 category with 1 book**, 1 with **0** — suppressed from the index, the
  sitemap and the hub's link list as of `lib/subjects/indexability.ts`. The
  zero-resource case was already handled by the V2 gate (§5.3).
* **693 tags used exactly once (75% of 923).** A tag-based page family is 693 thin pages. **Do not build one.**
* Grades 5–12: 3.4 books per grade. No per-grade page above primary.

---

## 7. AI and knowledge-graph convergence

The retrieval pipeline already consumes a topic signal: `match_record_chunks` (0135) filters inside the ANN candidate CTE, so scope is a retrieval *input*. A populated subject graph would let a reader ask a question *within a topic* rather than across the corpus.

Two measured gaps block that:

| Gap | Measured | Effect on AI |
| --- | --- | --- |
| `resource_subjects` empty | **0 rows** | No topic scope exists to retrieve within |
| Catalogue embeddings | **213 / 296 (72%)** | 83 books invisible to the semantic leg at catalogue level |
| `កញ្ជប់គណិតវិទ្យា` embeddings | **0 of 18** | The whole math-kit collection is lexical-only |

Per-topic answer depth varies by an order of magnitude — `ស្រាវជ្រាវបែបគុណភាព` averages 470 indexed pages per book, `សុខភាព` 41. **Topic authority and answer authority are the same measurement here**, which is the genuinely useful convergence: the tier in §2 predicts both.

---

## 8. Proposed SEO 3.3 architecture

### 8.1 What NOT to build, on this evidence

* **No `/topics/*` family** — 693 singleton tags.
* **No `/learn/*` family** — `/paths/*` already exists, is published, and covers the only real curriculum hierarchy.
* **No `/grades/*` family** — 3.4 books per grade above primary.
* **No second taxonomy URL family of any kind** — §6.1's 12 collisions become live duplicates the moment one exists.

### 8.2 What the evidence does support

**Phase A — data truth (no new URLs).**
1. Normalise `books.language` to a two-value enum. 37 books are mislabelled today.
2. Backfill `resource_subjects` from `books.category_id`, and give `subjects` its Khmer names and a `parent_id` where the vocabulary genuinely nests (e.g. ស្រាវជ្រាវប្រតិបត្តិ / ស្រាវជ្រាវបែបគុណភាព under ស្រាវជ្រាវ). This is the 3.2 contributor backfill pattern, applied to topics — **including its lesson: do not trust what the backfill writes; verify it.**
3. Close the 83-book catalogue-embedding gap, starting with `កញ្ជប់គណិតវិទ្យា` (0 of 18).

**Phase B — deepen the surface that exists.**
4. ~~Apply the §5 criteria to `/subjects/<slug>`~~ — **done**, and moved ahead of Phase A: it needed no schema change and the defect was live. Measured outcome **19 indexable / 4 `noindex, follow` / 2 suppressed** (§5.1), not the 15/9/2 this line first claimed. `lib/subjects/indexability.ts`.
5. Add the two data-backed internal links (book ↔ learning path, subject ↔ path).
6. Emit the subject hierarchy as `about`/`hasPart` on existing hub pages once `parent_id` is real.

**Phase C — measure before extending.** Re-run this audit. A topic family becomes defensible only if a subject's depth grows past the §5 bar.

### 8.3 Validation gates

Before any of this merges: an invariant test that no indexable topic surface falls below the §5 thresholds; a source scan that no second taxonomy gains a route while §6.1 collisions stand; and `scripts/verify-production-entities.ts` extended with subject-hub fixtures, verified post-deploy.

---

## 9. Reader demand — measured (added 2026-09-13)

`search_queries`, production, **131 searches over 16 days** (2026-08-29 → 09-13),
54 distinct terms, 33 result clicks. A small sample: directional, not
statistically strong. It is still the only real demand evidence available, and
it is not what a keyword tool would have guessed.

**Khmer is the majority query language: 81 of 131 (62%)**, English 50. Every
search used the `all` resource filter — nobody narrowed by type.

| Term | Searches | Books behind it | Verdict |
| --- | ---: | --- | --- |
| ស្រាវជ្រាវ (research) | 17 | 65 | **demand meets depth** |
| គណិតវិទ្យា + `mathematics` | 25 | 13 (+18 math-kit) | **demand meets depth** |
| `lesson planning` | 7 | គរុកោសល្យ, 52 | **demand meets depth** |
| ស្រាវជ្រាវប្រតិបត្តិ (action research) | 7 | 18 | **demand meets depth** |
| `pisa` + កម្មវិធី pisa | 7 | **3, in 3 different categories** | **mismatch — see 9.2** |
| វិធីសាស្ត្របង្រៀន (teaching methods) | 4 | a tag on 18 books, no category | tag-only |

**The top five demand terms map onto the five DEEP tiers in §2.** Demand and
depth agree here, which is a stronger result than either measurement alone: the
categories worth deepening are the ones readers already ask for.

### 9.1 Zero-result searches: 6 terms / 11 searches (8%)

Low, and mostly long full-sentence thesis titles pasted into the box. Two
looked like defects and **were checked against the live API rather than
assumed** — `english` now returns 4 results and `pisa` returns 4. **These are
historical records, not current bugs**; they predate the search-ranking work.
No action.

### 9.2 PISA — the one real demand/supply mismatch

7 searches. The `កម្មវិធី PISA` **category holds 0 published books**, while three
PISA books exist filed under three *other* categories:

```
ភាសា            ឯកសារជំនួយស្មារតីតេស្ត PISA-D អំណាន
វិទ្យាសាស្ត្រ   ឯកសារជំនួយស្មារតីតេស្ត PISA-D វិទ្យាសាស្ត្រ
គណិតវិទ្យា      ឯកសារជំនួយស្មារតីតេស្ត PISA-D គណិតវិទ្យា
```

An empty labelled shelf whose content sits elsewhere. Search finds them (verified
live: `pisa` returns 4 results), so **no reader is blocked**.

> **Correction, 2026-09-13.** This section originally proposed filing the three
> books under the PISA category, and closed "it should not stay empty and
> indexable". Both halves were wrong, and §5.3 has the evidence: the hub is
> already `noindex`, already out of the sitemap and already off `/subjects`,
> and `books.category_id` is a **single FK** — filing a book under PISA deletes
> its true category. Three books is below the §5 bar either way, so the move
> buys no indexability and costs a correct classification.

The real fix is `resource_subjects` (Phase A item 2), where a book can be both
PISA and language. Until then: no action, and do not retire the category — the
label is a real MoEYS programme and the graph will need it.

## 10. Subject co-occurrence — measured (added 2026-09-13)

103 category pairs share at least one tag. The strongest pairs are not noise —
they reproduce a curriculum structure:

| Shared tags | Pair | Reading |
| ---: | --- | --- |
| 18 | គណិតវិទ្យា ⇄ គរុកោសល្យ | maths **taught**; the pedagogy overlap |
| 14 | គរុកោសល្យ ⇄ ស្រាវជ្រាវ | education research |
| 12 | ស្ថិតិ ⇄ ស្រាវជ្រាវ | **method under research** |
| 12 | ស្រាវជ្រាវ ⇄ ស្រាវជ្រាវបែបគុណភាព | **child under parent** |
| 12 | គណិតវិទ្យា ⇄ វិទ្យាសាស្ត្រ | shared PISA-D / assessment tags |
| 11 | គីមីវិទ្យា ⇄ វិទ្យាសាស្ត្រ | **child under parent** |
| 10 | កញ្ជប់គណិតវិទ្យា ⇄ គណិតវិទ្យា | **child under parent** |
| 9 | ស្រាវជ្រាវ ⇄ ស្រាវជ្រាវប្រតិបត្តិ | **child under parent** |
| 8 | ជីវវិទ្យា ⇄ វិទ្យាសាស្ត្រ | **child under parent** |

### 10.1 The hierarchy this justifies

§8.2 proposed a `parent_id` structure as a hypothesis. The co-occurrence data
**supports it empirically**, and the tree is small and defensible:

```
ស្រាវជ្រាវ (65)
├── ស្រាវជ្រាវបែបគុណភាព (13)      12 shared tags
├── ស្រាវជ្រាវប្រតិបត្តិ (18)       9 shared tags
└── ស្ថិតិ និងវិភាគទិន្នន័យ (11)  12 shared tags

វិទ្យាសាស្ត្រ (16)
├── គីមីវិទ្យា (8)                11 shared tags
├── ជីវវិទ្យា (5)                  8 shared tags
└── រូបវិទ្យា (5)                 shared មធ្យមសិក្សា / ថ្នាក់ទី៨ cluster

គណិតវិទ្យា (13)
└── កញ្ជប់គណិតវិទ្យា (18)        10 shared tags
```

Two properties worth noting. The `គណិតវិទ្យា ⇄ គរុកោសល្យ` link is the strongest
pair in the data (18) but is **not** a parent/child relation — it is a genuine
cross-link, and it is exactly the "maths teaching" intent `lesson planning`
(7 searches) expresses. And `កញ្ជប់គណិតវិទ្យា` has **more** books than its
proposed parent, which is a naming problem, not a structural one.

### 10.2 What this changes in the plan

Phase A's subject backfill now has an evidence-backed shape rather than a
guessed one: 3 parents, 7 children, 1 strong cross-link. Everything else stays
flat. Sibling links on a hub should be drawn from measured co-occurrence, not
from name similarity.

## 11. What is NOT known

* ~~Subject co-occurrence~~ — **measured, §10.**
* ~~Real search demand~~ — **measured from on-site search, §9.** Note the limits:
  131 searches over 16 days is directional, not statistically strong, and it is
  on-site search only. There is still **no Search Console data**, so nothing
  here describes what readers search for *before* they arrive.
* Whether readers use `/subjects/*` at all — **still UNKNOWN.** `search_result_clicks`
  (33 rows) records clicks on search results, not hub navigation. Answering it
  needs page-level analytics this audit did not consult.
* Whether any of this moves rankings — unknowable without Search Console.

The remaining two should not be guessed either.
