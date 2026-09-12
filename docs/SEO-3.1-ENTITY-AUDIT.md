# SEO 3.1 — Entity & Ingestion Audit

**Date:** 2026-09-12
**Baseline:** `main` @ `4d17c38` (SEO 3.0, PR #178)
**Method:** repository inspection + production verification over **HTTP**.

Companions: [SEO-3.1-ENTITY-ARCHITECTURE.md](SEO-3.1-ENTITY-ARCHITECTURE.md) ·
[SEO-3.1-CONTRIBUTOR-MIGRATION.md](SEO-3.1-CONTRIBUTOR-MIGRATION.md) ·
[SEO-3.0-AUDIT.md](SEO-3.0-AUDIT.md) ·
`docs/seo/composite-authors-audit.md`

---

## 0. The finding

SEO 3.0 stopped the library *publishing* untrue contributor entities. It did
not stop the library *producing* them, and this audit establishes why:

> **The canonical contributor model already exists, is already correct, and is
> written by nothing.**

Migration 0105 created `contributors` (typed `person` | `organization`, with
`name_km`, `orcid`, `affiliation`) and `resource_contributors` (polymorphic,
with `role` — `author` / `editor` / `translator` / `compiler` — and `sequence`).
`lib/resources/contributors.ts` reads it. Its own header says the quiet part:

> "This is a READ helper only. Writes still go through the existing per-type
> admin actions until those are migrated onto the canonical model."

They never were. Measured in this repository:

| | |
|---|---|
| App code **writing** `resource_contributors` | **none** — only the 0105 backfill |
| App code **reading** it (`getResourceContributors`) | **zero consumers** outside `lib/resources/` |
| Write paths calling `parseAuthorNames()` | **zero** — it is used only at READ time |

So the model is stale by construction: every book created since the backfill is
absent from it. Meanwhile `books.author_id` is a **singular** foreign key, so
the legacy model *physically cannot* record that a book has three authors. The
byline string was therefore the only place the truth existed — in a shape
nothing could read, which is exactly why every renderer re-parsed it and 30%
got it wrong.

---

## 1. Ingestion audit (§7)

| Path | Input | Creates entity rows? | Uses the parser? | Status |
|---|---|---|---|---|
| Book create — `saveBookRecord`, `books/actions.ts:448` | `author` free text | **yes** — `authors` upsert of the **whole byline** | **no** | **fixed** (3.1) |
| Book edit — `books/actions.ts:772` | `author` free text | **yes** — same upsert | **no** | **fixed** (3.1) |
| **Bulk import** — `BulkUploadForm` | — | via `saveBookRecord` | — | **inherits the fix** |
| Theses | `research_reports.author_names` free text | no entity rows | no | unchanged, see below |
| Physical catalog | `catalog_books.author` free text | no entity rows | no | unchanged, see below |
| Publications | `publication_authors` + `publication_authorships` | yes — but authors are entered **individually** through a real FK | n/a — already structured | already correct |

**Books are the whole defect, and they have exactly one choke point.** Bulk
import was the highest-risk suspect (§35) and turns out to call the same server
action, so it needed no separate fix and cannot drift from one.

Theses and the physical catalog keep a free-text byline and create no entity
rows at all, so they cannot mint a false `Person` *row* — their strings are
normalized at render time by the shared classifier. They are candidates for the
same canonical write, deferred deliberately: neither has a `contributors`
backfill behind it, so writing them now would populate the canonical model with
a partial history that nothing yet reads.

---

## 2. Production entity census (§37, §19)

156 contributor expressions, taken over HTTP from the `/authors` hub's own
`ItemList` JSON-LD — **not** from a database, because `.env.local` on this
machine points at a LOCAL stack (§43). Classified by
`scripts/audit-contributors.ts`, which is read-only. The evidence lives under
`docs/seo/` rather than `reports/`, following this repository's own rule —
`/reports/` is gitignored as machine-generated output, with the note
"evidence is copied into docs/".

| Category | Rows | Share |
|---|--:|--:|
| `SAFE_SINGLE` — one person | 85 | 54.5% |
| `SAFE_MULTIPLE` — several people, separable | **42** | **26.9%** |
| `ORGANIZATION` — corporate body | **27** | **17.3%** |
| `INSTITUTION` — the library's own identity | **2** | 1.3% |
| `AMBIGUOUS` — cannot be separated safely | **0** | 0.0% |
| `EMPTY` | 0 | 0.0% |

Role marker stored inside the name: **16**.

### Three corrections to the SEO 3.0 figures

SEO 3.0 estimated these with heuristics over URL slugs. The deterministic
classifier disagrees, and it is the one to believe:

1. **Corporate bodies: 7 → 27.** 3.0 counted only English keywords over
   Latin-script slugs and said so ("a floor, not a count"). The Khmer
   vocabulary finds the rest.
2. **The institution appears twice, not once.** Both the English *and* the
   Khmer institutional names exist as separate `authors` rows — the
   institution is duplicated inside the author table itself.
3. **Composite bylines: 47 → 42.** 3.0 counted slugs with ≥5 hyphen segments,
   which over-counts: several of those are long organisation names, not people.

### A vocabulary gap this census exposed

Auditing the 85 `SAFE_SINGLE` rows by eye found **7 real Khmer institutions
typed as people** — a national council, two high schools, a government, a royal
school of administration, a Buddhist institute and a research department. Each
head-word was added to the Khmer vocabulary, and re-running the census moved
**exactly those 7 rows and no others** (verified by diffing both runs), so
precision was preserved. Each is now a regression test.

---

## 3. What remains UNKNOWN

Stated rather than guessed (§43):

- **How many `books` rows point at a composite `authors` row.** The census
  counts author *entities*, not the books referencing them. That needs a
  production database read, which this environment cannot do.
- **Whether any production book names the institution as `publisher`.** A
  publisher that IS the institution would mint a second institution node, the
  same defect class in a different field. Sampled 12 book pages: no `publisher`
  set on any, and OAI-PMH returns `noRecordsMatch`. So this is a theoretical
  risk, not an evidenced defect — and it is not fixed, because there is no
  evidence to fix.
- **Whether any contributor has an ORCID.** No production surface exposes it.

---

## 4. Route and slug audit

- **Every public `[slug]` route is now gated.** The existing gate test iterated
  over the gates that *exist* and checked their reserved children; it never
  asked whether every route *has* one. That is precisely how `/subjects`
  shipped ungated (SEO 3.0 F-6). A new invariant enumerates routes from the
  filesystem and fails on omission — verified to fail when the `subjects` gate
  is removed.
- **One machine-generated slug remains in production**, and migration 0143
  retires it. Confirmed by scanning all **513** live sitemap URLs for
  `book-<epoch>`: the only match is `/subjects/book-1781239299098` (and its
  `/km` twin). No book, author, post or catalog slug matches.

---

## 5. The testing defect (§41)

Six invariant tests searched the repository with `git grep` or `git ls-files`,
both of which answer about **tracked** files only. Every one of them was blind
to a file that had just been created.

This is not theoretical: it is how SEO 3.0's `lib/seo/contributor.ts` carried
the institution's name — the exact thing `lib/settings-consistency.test.ts`
forbids — through **four** clean local suites, `tsc`, `lint` and a clean
production build. CI caught it on the first run after the commit made the file
tracked.

All six now pass `--untracked` / `--others --exclude-standard` (both still
honour `.gitignore`), and a meta-invariant fails if a future scan omits them.
