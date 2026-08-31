# SEO V3 — Architecture

**Date:** 2026-08-31
**Scope:** the institutional entity layer, and the rules that keep it
consistent.

This document covers **what SEO V3 changed**. The layers below it are unchanged
and still described by their own documents — read those first if you are new to
this codebase:

- [SEO-ARCHITECTURE.md](SEO-ARCHITECTURE.md) — indexing gate, canonicals,
  hreflang, sitemap, robots, metadata builders
- [SEO-V2-FINAL-REPORT.md](SEO-V2-FINAL-REPORT.md) — topic + entity hubs,
  validators, empty-page exclusion
- [SEO-V3-AUDIT.md](SEO-V3-AUDIT.md) — the findings this implements
- [PTEC-ENTITY-MAPPING.md](PTEC-ENTITY-MAPPING.md) — what PTEC actually
  publishes, and which correspondences are safe

---

## 1. The one idea

**One institution, declared once, referenced everywhere.**

Before V3, a single rendered page could contain two `EducationalOrganization`
nodes describing PTEC — one correct and `@id`-anchored, one anonymous with the
wrong `url`. Both were emitted by this codebase, on every resource page, in
production. V3 makes that shape unrepresentable.

---

## 2. The entity graph

```
                    lib/seo/entity-ids.ts
                 ORGANIZATION_ID · LIBRARY_ID · WEBSITE_ID
                            │
            ┌───────────────┴────────────────┐
            │                                │
   RootShell.buildSiteGraph()        lib/seo/org-nodes.ts
   DECLARES the full nodes           REFERENCES them
   (once per page, every layout)     (organizationNode / libraryNode)
            │                                │
            ▼                                ▼
   ┌──────────────────────┐        book-seo · thesis-seo
   │ #organization        │        publication-seo · posts-seo
   │  EducationalOrg      │◀───────learning-path-seo
   │  url: ptec.edu.kh    │        subjects/* · authors/*
   │  sameAs · logo       │
   │  address · hours     │
   └──────────┬───────────┘
              │ parentOrganization
   ┌──────────▼───────────┐
   │ #library  Library    │◀──── provider: on every hosted resource
   │  url: library.…      │
   └──────────────────────┘
   ┌──────────────────────┐
   │ #website  WebSite    │──── publisher → #organization
   │  SearchAction        │
   └──────────────────────┘
```

### Who may declare what

| Node | Declared by | Referenced by |
|---|---|---|
| `EducationalOrganization` | `RootShell` only | `organizationNode()` |
| `Library` | `RootShell` only | `libraryNode()` |
| `WebSite` | `RootShell` only | — |
| `Book` / `ScholarlyArticle` / `Course` / `Article` | its `lib/seo/*-seo.ts` builder | — |
| `BreadcrumbList` | `breadcrumbSchema()` | — |

**Enforced by `lib/seo/entity-graph.test.ts`** — a source scan (comments
stripped) asserting that no file outside `RootShell` and `org-nodes` emits an
`EducationalOrganization` or a bare `Library` node. It caught a **fourth**
hand-rolled organization node in `posts/[slug]/page.tsx` that manual grepping
had missed.

### Why references carry `@type`/`name`/`url` and not just `@id`

The site graph and a resource node are separate `<script>` blocks. Google
merges JSON-LD across a page; stricter consumers treat each block as its own
document. Repeating the identifying fields keeps the reference self-describing
there, while the shared `@id` guarantees that a consumer which *does* merge
sees one entity. The repeated values come from the same resolved `OrgIdentity`
the site graph uses, so they cannot contradict it.

`parentOrganization` is the exception — a bare `{"@id"}`, because repeating the
institution inside the library node is precisely what produced the defect.

### `OrgIdentity` gained `institutionUrl`

```ts
url: SITE_URL,                            // the LIBRARY   library.ptec.edu.kh
institutionUrl: cfg.links.website,        // the INSTITUTION  www.ptec.edu.kh
```

The absence of this field was the root cause: `org-nodes.ts` had no way to
reach the institution's own URL, so it used the library's. Both flow from
published system settings — changing `links.website` in
`/admin/system-settings` now updates the organization node everywhere.

---

## 3. Breadcrumbs

`breadcrumbSchema(crumbs, { locale, pageUrl })` — the options argument is new.

Call sites pass **locale-less** paths (`"/theses"`, never `"/km/theses"` and
never `` `${localePrefix}/theses` ``). The builder applies three rules:

| Rule | Fixes |
|---|---|
| prefix `/km` for Khmer, nothing for English | D-3 — Khmer pages emitted English breadcrumb URLs |
| resolve `REDIRECTING_PATHS` (`/home` → `/`) | D-4 — the book page advertised a 308 as position 1 |
| strip the query string | D-5 — crumbs pointed at `noindex` filtered listings |

`pageUrl` sets `@id: <url>#breadcrumb`, replacing an anonymous node (D-10).

**Enforced by `lib/seo/breadcrumbs.test.ts`**, which scans every call site with
a bracket-balancing extractor (a regex cannot do it — a conditional spread
inside the array closes an inner `]` first and silently truncates the match).

### The book breadcrumb now uses a real hub

```
Home  ›  Books  ›  <Subject>  ›  <Title>
                       └── /subjects/<slug>, via V2's resolveSubjectLinks()
```

`resolveSubjectLinks()` returns a link **only** when the subject has public
resources, so the crumb can never point at an empty hub; when nothing resolves,
the crumb is omitted rather than pointed at a filtered listing. The visible
`<nav>` uses the same target, so the trail and the structured data agree —
they previously disagreed (the nav linked `/`, the JSON-LD linked `/home`).

---

## 4. Institutional vocabulary

`lib/seo/institution.ts` records PTEC's own published structure — 3 faculties,
7 departments — as a **reference, not a data source**. Nothing renders from it.

It exists so the "faculty" ambiguity is written down next to a test that fails
if a public surface starts asserting the wrong thing:

> `www.ptec.edu.kh` → *faculty* = one of 3 academic units.
> `research_faculties` (0055) → *faculty* = one of 5 tracks inside a degree
> programme.

The public thesis facet is therefore labelled **"Faculty / Major"** /
**"មហាវិទ្យាល័យ / ជំនាញ"**, never a bare "Faculty".

`lib/seo/institution.test.ts` pins the vocabulary, asserts both message
catalogues carry the hedged label, and asserts the public listing does not
hardcode English filter labels.

---

## 5. What V3 deliberately did **not** build

Each of these is a decision with a reason, not an omission. Reopening one
without new data repeats the analysis in [SEO-V3-AUDIT.md](SEO-V3-AUDIT.md) §3.

| Not built | Reason |
|---|---|
| Faculty / department / programme landing pages | 3 published books. They would be thin (§27) and doorway (§67) pages. `departments` is `(id, name, slug)` — there is nothing to put on the page. |
| Automatic lecturer ↔ author matching | Only *names* exist on both sides; PTEC publishes no ORCID, email or stable id. §13 forbids merging real people on an ambiguous signal. |
| Generated subject descriptions | `categories` has no description and no Khmer name. A generated blurb would invent facts (§68). |
| Evergreen guide pages | The publishing system is complete; authoring is the team's, decided 2026-08-31. |
| Search Console data layer | No property connected — there is no data, and §68 forbids inventing it. |
| A second SEO score | §42 — actionable metrics over a single number. The existing per-record `lib/seo/health.ts` already decomposes. |

---

## 6. Invariant tests added

Following this codebase's existing convention (`cache-safety`,
`resource-stats-consistency`, `settings-consistency`, …), the rules are
enforced by tests that **read source files**, because the rule is about what
code may contain, not about what a function returns.

| Test | Rule |
|---|---|
| `lib/seo/entity-graph.test.ts` | one declaration of the institution site-wide; `organizationNode` carries the institution's own url; `parentOrganization` is a bare reference; RootShell's anchors come from `entity-ids.ts` |
| `lib/seo/breadcrumbs.test.ts` | locale correctness, no redirecting paths, no query strings, `@id` anchoring — plus a call-site scan for all four |
| `lib/seo/institution.test.ts` | PTEC's real faculty/department names; no bare "Faculty" label; no hardcoded English filter labels; Khmer parity for the new keys |

Add them to the invariant table in `CLAUDE.md` when this branch merges.

---

## 7. Files changed

```
new   lib/seo/entity-ids.ts            @id anchors, single source
new   lib/seo/institution.ts           PTEC's published vocabulary (reference)
new   lib/seo/entity-graph.test.ts
new   lib/seo/breadcrumbs.test.ts
new   lib/seo/institution.test.ts

edit  lib/seo/org-nodes.ts             declarations → @id references
edit  lib/seo/schema.ts                locale/redirect/query rules + @id
edit  lib/seo/posts-seo.ts             hand-rolled Organization → reference
edit  lib/system-settings/org-identity.ts   + institutionUrl
edit  components/layout/RootShell.tsx  anchors from entity-ids.ts
edit  messages/{en,km}.json            + theses.appliedFilters (8 keys each)

edit  app/[locale]/(public)/books/[slug]/page.tsx        subject crumb, locale
edit  app/[locale]/(public)/posts/[slug]/page.tsx        4th Organization node
edit  app/[locale]/(public)/theses/page.tsx              localized filter chips
edit  … 11 further breadcrumb call sites                 locale + pageUrl
```
