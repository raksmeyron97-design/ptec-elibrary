# Resource statistics

How the PTEC e-Library counts things, and where each number comes from.

The rule is that **no page computes its own resource count**. Every public
figure comes from one service, which reads one database view. Before this
document existed, five surfaces ran their own count query and drifted apart —
the homepage claimed "110+ educational resources", the same banner also said
"110+ Digital resources", the raw text read `110+115`, and `/books` said 116.

---

## 1. Metric definitions

| Metric | Definition | Table(s) | Predicate |
| --- | --- | --- | --- |
| **Digital resources** | Published e-books + theses + publications | `books`, `research_reports`, `publications` | `is_published = true` |
| **E-books** | Published digital books | `books` | `is_published = true` |
| **Theses** | Published theses (historically "research reports") | `research_reports` | `is_published = true` |
| **Publications** | Published academic publications | `publications` | `is_published = true` |
| **Physical catalog items** | Active physical catalog records | `catalog_books` | `is_active = true` |
| **Learning paths** | Published guided routes | `learning_paths` | `is_published = true` |
| **Searchable resources** | Digital resources carrying a pgvector embedding | the three digital tables | `is_published = true AND embedding IS NOT NULL` |
| **Filtered result count** | Records matching the ACTIVE query + filters on a listing page | per listing | the listing query's own exact `count` |
| **Admin status counts** | Per-type counts by status, each explicitly labelled | all | per status |

### What is deliberately NOT in "digital resources"

- **Physical catalog records.** They are not digital. Folding them in is what
  made the old `get_home_stats()` RPC report "120+" against `/books`'s 116.
- **Learning paths.** A path is a curated route *through* resources that are
  already counted (`learning_path_steps` point at books / theses / catalog
  records). Counting paths as resources counts the same material twice. They
  get their own figure instead.
- **Posts / announcements / team members.** Not library resources.

If the product ever redefines learning paths as standalone resources, change
the `digital_resources` expression in
`supabase/migrations/0103_public_resource_statistics.sql` **and**
`DIGITAL_RESOURCE_KEYS` in `lib/collection-stats.ts` together. Nothing else
needs touching, and `lib/resource-stats-consistency.test.ts` fails if only one
of the two moves.

---

## 2. What "publicly visible" means

Exactly one predicate: **`is_published = true`** (`is_active = true` for the
physical catalog).

This is not a hand-maintained flag. A `BEFORE` trigger keeps it in lock-step
with `status` (migrations `0061`, `0075`, `0086`), so `is_published = true` is
precisely `status = 'published'`. That means drafts, `pending_review`,
`scheduled`-but-not-yet-flipped and `archived` rows are excluded **by
construction**, with no second predicate to drift.

There is no soft-delete column and no version table on these tables: an edit
mutates the canonical row in place. So deleted rows and historical versions
cannot inflate a figure either.

Different pages must never use different conditions. `status = 'published'` on
one page, `is_published = true` on another and `visibility != 'private'` on a
third is how totals stop matching.

---

## 3. Where the numbers come from

```
public.public_resource_statistics   ← the counting rule, in SQL (migration 0103)
        ↓ one row, one round-trip
lib/collection-stats.ts             ← getCollectionStats(), cached, validated
        ↓
homepage · /books · /theses · /publications · /paths · /catalogs
auth screens · /llms.txt · get_home_stats() RPC · admin Data Quality
```

- **`public.public_resource_statistics`** — a `security_invoker` view returning
  one row of scalars. Joinless: each figure is a plain `count(*)` over its own
  base table, so a resource with several authors, subjects, keywords, copies,
  reviews or downloads is structurally incapable of being counted twice.
  Readable by `anon`; it exposes numbers and nothing else.
- **`public.public_resource_search_health`** — per-type published vs embedded,
  for admin reconciliation. `REVOKE`d from `anon` / `authenticated`.
- **`getCollectionStats()`** (`lib/collection-stats.ts`) — the only sanctioned
  server-side reader. Validates every field (rejects non-integers, negatives, a
  total that disagrees with its parts) and returns `null` on failure.

### Failure behaviour

`getCollectionStats()` returns `null` rather than a fallback number. Consumers
**omit the figure** — they never render `0`, `NaN`, `undefined`, or a
hardcoded "100+". The one exception is the migration window: if the view is
missing (PostgREST `42P01` / `PGRST205`), the service counts the base tables
directly using the same predicates declared once in `RESOURCE_SOURCES`. That is
the same rule producing the same numbers, not a second definition.

---

## 4. Caching and invalidation

Cached under the **`collection-stats`** tag with a 5-minute TTL
(`unstable_cache`). The TTL is a backstop, not the mechanism.

Every mutation that can move a count calls `revalidateCollectionStats()` via
`lib/cache/revalidate.ts` — `revalidateBook`, `revalidateThesis`,
`revalidatePublication`, `revalidateCatalogBook`, `revalidateLearningPath`.
That busts the tag *and* the homepage in both locales.

> **Locale trap:** public routes live under `app/[locale]/(public)`, so their
> prerender keys are `/en/...` and `/km/...`. `revalidatePath("/books")` is a
> silent no-op. Always go through the helpers in `lib/cache/revalidate.ts`.

**PWA:** page navigations use `NetworkFirst` (5 s timeout), so an online
visitor always gets fresh counts. The statistics view is read server-side only
and is not in `PUBLIC_REST_RE`, so it can never enter the service worker's
Supabase cache.

---

## 5. Listing pages: global vs filtered

Two different numbers, and they must stay distinguishable:

- **Global total** — the canonical published total for that type, from
  `getCollectionStats()`. Matches the homepage figure for the same category.
- **Filtered total** — the exact DB count for the active query and filters.

`lib/listing-count.ts` (`chooseCountLabel`) picks the wording:

| Situation | Rendered |
| --- | --- |
| No filters | `112 resources` |
| Filters narrow the set | `24 of 112 e-books` |
| Filters match everything | `112 resources` (no pointless "112 of 112") |
| Global total unavailable | `24 resources` — never an invented denominator |
| Nothing matched | the page's "no results" copy |

Never `items.length`. The loaded page holds at most `pageSize` rows, so
counting the array makes the total change as the reader pages.

---

## 6. Admin statistics

`lib/admin/resource-stats.ts`, surfaced in **Admin → Data Quality**:

- `getAdminResourceStats()` — per-type counts **by status**, every bucket
  explicitly labelled. An admin "All records" figure must never be rendered as
  a public resource count: `books` currently holds 115 rows of which 112 are
  published, and quoting 115 publicly is exactly the original bug.
- `reconcilePublicResourceStats()` — recomputes the canonical figures, diffs
  them against what the cache is serving and against the search index, and
  reports duplicate-title candidates.

**"Recalculate and verify"** drops the stats cache and recounts from canonical
rows. It cannot set a counter, because there is no stored counter to set.
Stored aggregates were considered and rejected: at this scale the direct
indexed aggregate is fast enough, and a stored counter can drift when a
transaction fails.

Both are gated by `requireLibrarian()`, the same gate as the rest of the Data
Quality screen.

---

## 7. Search index reconciliation

There is **no separate search-document table**. The pgvector embedding is a
column on the resource row (`books.embedding`, etc.). That makes duplicate and
orphaned search documents structurally impossible — the only drift that can
exist is a **missing** embedding, which the Data Quality panel reports per
type.

A resource without an embedding is still reachable through the keyword
fallback; it is only absent from semantic retrieval. `searchableResources` is
therefore reported separately and is **never** shown publicly as the resource
total. Close a gap with:

```bash
npx tsx scripts/embed-library.ts
```

---

## 8. Indexes

None were added for the aggregate. `books` already carries four partial
`WHERE is_published = true` indexes from `0049` that support an index-only
count; the other counted tables hold single-digit to low-double-digit row
counts, where a partial index is write cost for a plan the planner would
ignore. Revisit when any single table passes roughly 50k rows — the query to
`EXPLAIN ANALYZE` at that point is
`SELECT * FROM public.public_resource_statistics`.

---

## 9. Tests

| File | Covers |
| --- | --- |
| `lib/collection-stats.test.ts` | the counting rule, bigint parsing, every failure mode, the degraded path, both formatters |
| `lib/listing-count.test.ts` | global vs filtered label selection |
| `lib/resource-stats-consistency.test.ts` | no surface re-implements a count; SQL and TS rules agree; view security; the display defects stay fixed; SW and cache-invalidation coverage |
| `e2e/resource-stats.spec.ts` | homepage total == sum of its categories; each category == its listing page; no run-together numbers; English and Khmer; desktop and mobile; paging does not move the total |

---

## 10. Adding a new counted resource type

1. Add the `count(*)` to `public.public_resource_statistics` in a new
   migration, and decide explicitly whether it belongs in `digital_resources`.
2. Add the field to `PublicCollectionStats`, to `RESOURCE_SOURCES`, and — only
   if it is a digital resource — to `DIGITAL_RESOURCE_KEYS`.
3. Add a `revalidate<Type>()` helper in `lib/cache/revalidate.ts` that calls
   `revalidateCollectionStats()`.
4. Add the metric to `NUMERIC_METRICS` in `lib/admin/resource-stats.ts` and to
   the `/api/health` reconciliation list.
5. Extend `lib/resource-stats-consistency.test.ts` and
   `e2e/resource-stats.spec.ts`.
