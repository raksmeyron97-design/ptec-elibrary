# SEO 3.1 — Contributor Migration Plan

**Status: NOT EXECUTED.** This document exists so the historical migration is
taken as a decision, with evidence, rather than as a side effect of a code
change. Nothing described in §4–§6 has been run against any database.

Evidence: `docs/seo/composite-authors-audit.md` (+ `.json`) ·
[SEO-3.1-ENTITY-AUDIT.md](SEO-3.1-ENTITY-AUDIT.md)

---

## 1. Current model

```
books.author_id ──► authors(id, name, slug)        ← SINGULAR FK. One per book.
                       │
                       └─► /authors/<slug>          ← indexed, 158 live URLs

research_reports.author_names   free text, no entity rows
catalog_books.author            free text, no entity rows
publication_authorships ──► publication_authors     already a real FK
```

`authors.name` holds the **whole byline**, because the FK can hold only one
row. So a three-author book stores one row named
`"A, B, C (Editors)"`, with a slug derived from it.

## 2. Target model

Already exists (0105); nothing new is required.

```
resource_contributors(resource_type, resource_id, contributor_id, role, sequence)
        │
        └─► contributors(id, contributor_type, display_name, name_km, orcid, …)
```

`contributor_type` ∈ {`person`, `organization`}; `role` ∈ {`author`, `editor`,
`translator`, `compiler`, …}; `sequence` preserves byline order.

## 3. Ingestion (DONE — this is what stops the defect regenerating)

Both book write paths — create and edit, and therefore bulk import, which calls
the same action — now record canonical credits through the one parser.
Additive: the legacy row and `books.author_id` are untouched.

**What this does and does not guarantee.** New books are recorded correctly in
the model that can hold the truth. It does **not** stop a composite `authors`
row being created, and it cannot: `books.author_id` is singular, so a
multi-author book must point at exactly one row. Full compliance requires the
read-path cutover in §6 — stated here rather than implied, because "prevent
regeneration" is only half-true until then.

## 4. Historical rows — what is safely migratable

From the 156 production contributor expressions:

| Category | Rows | Migratable? |
|---|--:|---|
| `SAFE_SINGLE` | 85 | Nothing to do — already one entity. |
| `SAFE_MULTIPLE` | 42 | Splittable **deterministically**, but see §5 — each has no single 301 target. |
| `ORGANIZATION` | 27 | Never split. Retype only. |
| `INSTITUTION` | 2 | Must reference `#organization`. Already correct in rendered output. |
| `AMBIGUOUS` | 0 | — |

**Human-review bucket: currently empty.** That is a fact about this collection,
not a property of the classifier — `AMBIGUOUS` exists and will catch
`"Smith, John"`-shaped rows if one is ever catalogued.

**A second, smaller job:** 16 rows carry a cataloguer role marker inside
`authors.name` (`"… (Editors)"`). Normalising those changes the name, therefore
the slug, therefore the URL — so it belongs to the same decision, not to a
tidy-up.

## 5. The URL problem, stated plainly

For a composite row the old URL has **no single successor**:

```
/authors/alan-crawford-wendy-saul-samuel-r-mathews-james-makinster
        │
        ├─► /authors/alan-crawford
        ├─► /authors/wendy-saul
        ├─► /authors/samuel-r-mathews
        └─► /authors/james-makinster        ← which one gets the 301?
```

A 301 must name exactly one target. Picking one arbitrarily tells search
engines that the other three people *are* that person. **This is a product
decision.** Four defensible options:

| Option | What happens to the old URL | Cost |
|---|---|---|
| **A. Keep the composite page** | stays 200, unchanged | The entity stays untrue in the legacy table; rendered JSON-LD is already correct. |
| **B. Turn it into a "multiple contributors" page** | stays 200, lists the people, links to each | Needs a real page type; honest; no redirect required. |
| **C. Split and keep the old page as a historical record** | stays 200, canonical to itself | Two page classes to maintain. |
| **D. Redirect only when unambiguous** | 301 only for rows with exactly one target | Safe, but applies to **0** of the 42 by definition. |

**Recommendation: B**, and the evidence supports it — the route already serves
organisations, institutions and people, so `/authors/<slug>` is a *contributor*
page, not a person profile. B makes that explicit without moving a single URL.
It is recorded as a recommendation, not implemented (SEO 3.1 §18 forbids
renaming the public route without a strong product reason, and there is none).

## 6. Read-path cutover (prerequisite for retiring the legacy model)

Order matters and each step is independently reversible:

1. **Backfill** `contributors` / `resource_contributors` for existing books
   through the same parser (`lib/admin/canonical-backfill.ts` already exists
   for this shape; `canonical_backfill_health`, 0109, reports coverage).
2. **Read** contributors from the canonical model on resource pages, behind a
   server-only flag defaulting to the legacy path
   (`lib/admin/analytics-flags.ts` is the pattern).
3. **Compare** rendered output under both paths before flipping the default.
4. **Then**, and only then, decide §5.

Do **not** reorder. Cutting the read over before the backfill renders a library
of authorless books.

## 7. Rollback

- **Ingestion (§3):** delete rows from `resource_contributors` for the affected
  resources. Nothing else reads them today, so removal is invisible to the site.
- **Backfill (§6.1):** same — the canonical tables are additive, and every row
  carries `source` and `legacy_author_id` so backfilled rows are identifiable.
- **Read cutover (§6.2):** flip the flag.
- **A split or a slug rename (§4–5):** **not** trivially reversible once URLs
  move and are re-crawled. This is the reason it is last and gated on a
  decision.

## 8. Production safety

Nothing in this phase writes to a production database. `scripts/audit-contributors.ts`
opens no write path. Migration 0143 (the tenth subject slug) is the only SQL in
this line of work, it is idempotent and collision-safe, and it reaches
production only through `infra/supabase/scripts/migrate.sh` during deploy.
