# SEO 3.1 — Final Report

**Date:** 2026-09-12
**Branch:** `feat/seo-3-1-contributor-normalization` (from `main` @ `4d17c38`)

Companions: [SEO-3.1-ENTITY-AUDIT.md](SEO-3.1-ENTITY-AUDIT.md) ·
[SEO-3.1-ENTITY-ARCHITECTURE.md](SEO-3.1-ENTITY-ARCHITECTURE.md) ·
[SEO-3.1-CONTRIBUTOR-MIGRATION.md](SEO-3.1-CONTRIBUTOR-MIGRATION.md) ·
`docs/seo/composite-authors-audit.md`

---

## 1. Executive summary

SEO 3.0 stopped the library **publishing** untrue contributor entities. It did
not stop it **producing** them. This phase found why, and the answer was not a
missing feature:

> **The canonical contributor model already existed, was already correct, and
> was written by nothing.**

Migration 0105 created `contributors` (typed `person` | `organization`) and
`resource_contributors` (with `role` and `sequence`). `lib/resources/contributors.ts`
reads it, and its own header admits the gap — *"writes still go through the
existing per-type admin actions until those are migrated"*. They never were.
Measured: **zero** app code writes it, **zero** consumers read it, and the one
canonical parser (`parseAuthorNames`) was called by **no write path at all**.

Meanwhile `books.author_id` is a **singular** foreign key, so the legacy model
physically cannot record that a book has three authors. The byline string was
the only place the truth lived, in a shape nothing could read — which is
precisely why every renderer re-parsed it and 30% got it wrong.

3.1 moves the parser to the domain layer, makes the SEO layer a projection of
it, and wires it into the ingestion boundary so new books are recorded in the
model that can actually hold the truth. The historical migration is
**specified and deliberately not executed**.

---

## 2. Evidence

### Production (over HTTP — `.env.local` points at a LOCAL stack, §43)

156 contributor expressions, taken from the `/authors` hub's own `ItemList`
JSON-LD and classified by the read-only `scripts/audit-contributors.ts`:

| Category | Rows | Share |
|---|--:|--:|
| `SAFE_SINGLE` | 85 | 54.5% |
| `SAFE_MULTIPLE` (separable people) | 42 | 26.9% |
| `ORGANIZATION` | 27 | 17.3% |
| `INSTITUTION` | 2 | 1.3% |
| `AMBIGUOUS` | **0** | 0.0% |
| `EMPTY` | 0 | 0.0% |

Role marker stored inside the name: **16**. Sitemap: **513** URLs; exactly one
machine-generated slug remains anywhere in it (`/subjects/book-1781239299098`,
retired by migration 0143, not yet applied).

### Three corrections to the SEO 3.0 figures

3.0 estimated these from URL slugs; the deterministic classifier is the one to
believe:

| | 3.0 said | measured | why it differed |
|---|--:|--:|---|
| corporate bodies | 7 "floor" | **27** | 3.0 matched English keywords over Latin slugs only |
| institution as an author row | 1 | **2** | English **and** Khmer names are separate rows |
| composite bylines | 47 | **42** | 3.0 counted slugs with ≥5 hyphens; several are long org names |

### A vocabulary gap the census exposed

Reviewing the 85 `SAFE_SINGLE` rows by eye found **7 real Khmer institutions
typed as people** (a national council, two high schools, a government, a royal
school of administration, a Buddhist institute, a research department). Their
head-words were added; re-running the census moved **exactly those 7 and no
others**, verified by diffing both runs. Each is now a regression test, and the
precision guard lists real Khmer *personal* names that must never be caught.

---

## 3. Root causes, separated

| Layer | Defect |
|---|---|
| **Data model** | `books.author_id` is singular, so a multi-author byline has nowhere to go but one row. The model that *can* hold it (0105) was never written. |
| **Ingestion** | `.upsert({ name: author })` stores the whole byline. `parseAuthorNames()` existed and was called by no write path. |
| **SEO rendering** | Fixed in 3.0 — but as a repair layer over bad data, re-deriving the truth at render time. |
| **Routing** | The gate test checked the gates that existed, never that every route *had* one — how `/subjects` shipped ungated. |
| **Testing** | Six invariant scans used `git grep` / `git ls-files`, which see **tracked files only**, so a brand-new file escaped every architectural scan. |

---

## 4. Changes implemented

| File | What |
|---|---|
| `lib/resources/contributor-identity.ts` | **New.** The one normalization contract: `normalizeByline()` → `{ sourceText, role, contributors[], resolved }`. Pure, domain-layer. |
| `lib/seo/contributor.ts` | Rewritten as a **projection** of that contract — no longer a parser. Public API unchanged, so the eight call sites were untouched. |
| `lib/resources/contributor-write.ts` | **New.** Records canonical credits. Additive, non-throwing, clears stale credits, writes nothing for an unresolved byline. |
| `books/actions.ts` (create + edit) | Wired in via `after()`. Bulk import calls the same action, so it inherits the fix. |
| `lib/resource-slug-gate.test.ts` | **New invariant:** every public `[slug]` route must be gated or exempt *with a reason*. Verified to fail when the `subjects` gate is removed. |
| `lib/seo/subject-slug-redirects.test.ts` | **§28:** no real name may mint a `book-<epoch>` slug; the fallback survives only for input with nothing to slug. |
| 6 invariant tests | `--untracked` / `--others --exclude-standard`. |
| `lib/invariant-scan-coverage.test.ts` | **New meta-invariant:** a git-backed scan that omits those flags fails. Verified to fail on regression. |
| `scripts/audit-contributors.ts` | **New.** Read-only contributor census. |
| `docs/seo/*` | The production census, JSON + Markdown. |

**Role is no longer destroyed.** `(Editors)` becomes `role: "editor"` on the
credit — `resource_contributors.role` already had the column and the CHECK
value; the information simply had nowhere to go while the byline was one string.

---

## 5. What was deliberately NOT changed

| | Why |
|---|---|
| **The 42 composite `authors` rows** | One old URL maps to 2–5 new ones, so there is **no single 301 target**. A product decision, specified in the migration plan with four costed options (recommendation: represent `/authors/<slug>` as a *contributor* page, which moves no URL). |
| **The legacy `authors` write** | Untouched on purpose: it drives 158 indexed URLs. Normalising the 16 role-marker names would change every one of their slugs. |
| **Thesis / catalog canonical writes** | Neither has a backfill behind it; writing them now would populate the canonical model with a partial history nothing yet reads. |
| **`/learn/*`, facet SEO, Search Console, a second SEO score** | Unchanged from 3.0 — no evidence has appeared since. |
| **Institution-as-`publisher`** | A real defect *class*, but no evidence: 12 sampled books have no publisher and OAI-PMH returns `noRecordsMatch`. Not fixed, because there is nothing measured to fix. |
| **Any production database write** | None. The audit script opens no write path. |

---

## 6. Verification

```
TypeScript (tsc --noEmit)      PASS
Lint                           PASS — 0 errors (172 pre-existing warnings)
Unit tests                     4684 passed, 89 skipped, 0 failed
Production build (wiped .next) PASS
Production URLs checked        513 sitemap URLs scanned for legacy slugs
Contributor expressions        156 classified, 0 AMBIGUOUS, 0 EMPTY
Schema probe (LOCAL stack)     PASS — a 3-editor byline wrote 3 person
                               contributors, role=editor, sequence 0/1/2,
                               read back through the real FK, then cleaned up
Entity inconsistencies left    0 in rendered output; 44 in the legacy table
                               (42 composite + 2 institution rows), each
                               documented and deliberately deferred
```

Two guards were verified by **deliberately breaking them** — a guard that
cannot fail is not a guard:

- removing the `subjects` gate ⇒ the new route invariant fails;
- dropping `--untracked` from a scan ⇒ the meta-invariant fails.

---

## 7. Remaining risks

1. **The canonical model is populated only going forward.** Until the backfill
   in the migration plan runs, `resource_contributors` covers new and edited
   books only. Nothing reads it yet, so this is invisible rather than wrong —
   but it must not be read from before the backfill.
2. **Khmer organisation detection is a vocabulary, not a parser.** A Khmer
   institution using none of the 17 head-words is still typed `person`. The
   list is extended by adding a term; the census is how you find the next one.
3. **Duplicate `contributors` rows are possible.** No unique index on
   `display_name` (two real people can share a name), so two concurrent saves
   of one new name can both insert. Harmless, and visible to the audit script.
4. **`books.author_id` still forces one legacy row per book**, so a composite
   `authors` row can still be created. Full regeneration-proofing needs the
   read-path cutover, not more ingestion code.
5. **Not verified in production.** Nothing here is deployed, and no e2e run was
   made in this phase.

---

## 8. Recommended next phase — evidence-backed only

1. **Backfill the canonical model** for existing books through the same parser,
   and read coverage from `canonical_backfill_health` (0109). This is the
   prerequisite for everything else and writes no URLs.
2. **Decide the composite-author question** using
   `docs/seo/composite-authors-audit.md`. Recommendation: option B — a
   contributor page, moving no URL.
3. **Then** cut the resource pages' read path over behind a server-only flag,
   comparing rendered output under both paths before flipping the default.

Not recommended: splitting author rows, renaming author slugs, or adding a
`contributors.display_name` unique index. Each is a URL- or data-destroying
change with no measured benefit today.
