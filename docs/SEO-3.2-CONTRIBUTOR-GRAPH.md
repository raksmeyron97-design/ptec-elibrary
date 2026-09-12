# The Contributor Graph — architecture

How a name on a title page becomes an entity every public surface agrees about.

```
  cataloguer's byline            (free text, off a title page)
        │
        ▼
  normalizeByline()              lib/resources/contributor-identity.ts  (pure)
        │                        role EXTRACTED · institution checked whole ·
        │                        organisation checked whole · safe split
        ▼
  recordResourceContributors()   lib/resources/contributor-write.ts
        │                        contributors + resource_contributors (0105)
        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  CANONICAL GRAPH      contributors · resource_contributors      │
  │                       identity · type · role · sequence         │
  └─────────────────────────────────────────────────────────────────┘
        │
        ▼
  resolveContributors()          lib/resources/contributor-view.ts     (pure)
        │                        THE READ POLICY — canonical | legacy |
        │                        none | unavailable
        ▼
  ResourceContributorView[]      id · kind · name · nameKm · role ·
        │                        sequence · source · typeConflict
        │
        ├──────────────┬──────────────┬─────────────┬────────────────┐
        ▼              ▼              ▼             ▼                ▼
   JSON-LD        visible byline   citations    author link       search
   contributor-                    citationNames()               (deferred,
   NodesFromViews()                                               see audit C-6)
        │
        ▼
   Person · Organization · @id → #organization
```

---

## 1. Why canonical is preferred

A byline is one string. The canonical model is four facts: **who** (an id),
**what** (a type), **in what capacity** (a role) and **in what order** (a
sequence). Only the first can be recovered from the string, and only
approximately. Every consumer that re-derived the rest from the string got a
different answer, which is the defect SEO 3.0 measured at 30% of the collection.

So where the graph has credits, they win — wholesale.

## 2. The read policy

`resolveContributors()` (pure, `lib/resources/contributor-view.ts`) is the one
place this is decided:

| Input | `source` | Contributors |
| --- | --- | --- |
| canonical rows exist | `canonical` | the graph's, ordered by `sequence` |
| canonical read **failed** | `unavailable` | the legacy byline, explicitly marked |
| no canonical rows, byline resolves | `legacy` | the byline's |
| neither | `none` | `[]` |

**The two datasets are never blended.** Blending is how "John Smith" appears
twice — once from the graph, once from the string the graph was built from —
and no dedupe rule can be trusted to catch every spelling of that. Canonical
wins wholesale or it does not participate.

**A failed read is not an empty one.** `unavailable` exists because a page that
renders no byline after a query timeout has silently deleted an SEO
relationship, and nothing downstream can tell that from a work whose author is
genuinely unknown. `loadCanonicalRows()` throws on a query error so the failure
is neither cached nor mistaken for zero rows; a genuinely missing table
(PostgREST `42P01`, the pre-0105 case) is an ordinary empty result.

## 3. Ambiguity

Omission is a valid answer, and it is the answer three times over:

* A byline naming several entities that cannot be separated safely resolves to
  **nothing**, and the JSON-LD property is omitted. `"Smith, John"` is one
  inverted name or two people, and no evidence here distinguishes them.
* A contributor URL that resolves to **several** entities asserts **no**
  identity (`soleContributorNode()`). One URL cannot be three people, and
  typing it by its first name is how three editors became one.
* Where the graph's records for an entity **disagree** with each other,
  `canonicalKindOf()` returns `null` and the name decides — a disagreement is
  for the audit to surface, not for a renderer to resolve by picking a row.

A citation is the one place ambiguity is preserved rather than dropped:
`citationNames()` emits the byline whole when it cannot separate it, because a
less granular reference is useful to a human and `Unknown author` is not.

## 4. How kind is decided for a canonical row

`kindOfCanonicalRow()`, in order — and the order is the function:

1. **The site's own institution wins outright.** An exact identity match
   against published System Settings is stronger evidence than any stored
   column, and 0105's backfill typed every `authors` row `person` — PTEC's own
   row included. `institution` is not a stored `contributor_type`; it is
   distinguished at read time precisely so it can resolve to the site graph's
   existing `@id` instead of minting a second node.
2. **`contributor_type = 'organization'` is believed unconditionally.**
   Downgrading an organisation to a `Person` is the exact untrue claim this
   work removes.
3. **`person` is believed when the classifier wrote it** (`source = 'manual'`).
   When it came from the 0105 backfill, `person` was a column DEFAULT rather
   than a decision, so the name is classified — with `classifyName()`, which
   types one already-separated name and cannot split anything.

Any disagreement sets `typeConflict`. It is reported, never silently resolved.

## 5. Roles

`resource_contributors.role` carries what the byline stated: `author`,
`editor`, `translator`, `compiler`, `advisor`, `supervisor`, `reviewer`,
`illustrator`, `publisher`, `institution` (the 0105 CHECK). Roles are not
promoted: an editor is not relabelled an author for schema.org, and a role
schema.org cannot express is omitted rather than forced.

`authorRoleContributors()` is the one exception, and it is a bibliographic
convention rather than a claim: a work with **no** author-role credit — an
edited volume where every credit is `editor` — cites its editors in the author
position, because an edited volume with no names is a worse citation than one
whose editors stand there. Every style guide does the same.

## 6. Order

`sequence` is the public order, everywhere: byline, JSON-LD, citation, author
list. Never alphabetical. `viewsFromCanonical()` sorts on it and nothing else;
`publication_authorships.author_order` is 1-based and is converted, with a null
order falling back to the query's position rather than to 0 — which would
silently claim first authorship.

## 7. Identity, and what is never merged

`contributorKey()`: a canonical id is identity; without one, identity is the
folded name **within a kind**. Nothing fuzzy. A shared surname, a shared
initial, a shared transliteration are not evidence that two credits are one
person, and merging on them publishes a claim no data supports.

## 8. The institution

One entity, one node, declared once by `RootShell` at `#organization`. A
contributor that IS the institution projects to a bare `@id` reference —
`{"@id": "…/#organization"}` — with no `@type` and no name of its own. Pinned
by `lib/resources/contributor-consumers.test.ts` §19 and, from the other
direction, by `lib/seo/entity-graph.test.ts`.

## 9. Legacy fallback — when it is allowed

Only when the graph has no credits for the resource, or could not be read. It
is never mixed in alongside canonical credits, and it is never silent: `source`
says which answered. The legacy legs of `/authors/[slug]` (the `author_id` FK
and the two `ILIKE` searches) remain **in addition to** the graph edge, because
the graph is still filling and removing them would drop works from pages that
list them today. Retiring them is an evidence-led step, gated on coverage
measured by `scripts/audit-contributor-graph.ts`.

## 10. Why the historical composites are deferred

43 of 157 production contributor rows name several people. Every one has a
live, indexed `/authors/<slug>` URL and at least one work. Splitting one row
into three creates three URLs and retires one, and **a URL denoting three
people has no single 301 target** — choosing one of the three asserts that the
work is theirs. The report is
`docs/SEO-3.2-HISTORICAL-CONTRIBUTOR-MIGRATION.md`; the migration is not run.

## 11. Performance

No per-contributor and no per-resource queries. One cached read per resource
detail page (`unstable_cache`, 300 s, tagged `books`/`theses`/`publications`);
listing JSON-LD is deliberately **not** wired to the graph, because resolving
credits per row is one query per result. `/authors/[slug]` adds two batched
queries (contributor identity, then edges) plus at most one `IN (…)` fetch per
resource type. `getOrgIdentity()` is `cache()`d, so the identity every kind
decision needs costs one round trip per request.

## 12. Files

| File | Role |
| --- | --- |
| `lib/resources/contributor-identity.ts` | the normalization contract + `citationNames()` — pure |
| `lib/resources/contributor-view.ts` | the read model and the read policy — pure |
| `lib/resources/public-contributors.ts` | the cached public read (server-only) |
| `lib/resources/contributors.ts` | the anon/admin read |
| `lib/resources/contributor-write.ts` | ingestion (SEO 3.1) |
| `lib/publications/contributors.ts` | `publication_authorships` → views |
| `lib/authors/canonical-works.ts` | author → works through the edge |
| `lib/seo/contributor.ts` | JSON-LD projection — classifies nothing |
| `scripts/audit-contributor-graph.ts` | coverage, integrity, conflicts (read-only) |
| `scripts/audit-contributors.ts` | historical expression classification (read-only) |
