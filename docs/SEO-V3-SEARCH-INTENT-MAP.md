# SEO V3 — Search Intent Map

**Date:** 2026-08-31

**No search-volume, traffic, ranking or CTR figures appear in this document.**
No Search Console property is connected to this application (audit D-12), so
there is no data to report and §68 forbids inventing any. What follows is an
*intent inventory* — which queries a page of each type should answer, and
whether a page that answers it exists today.

Companion: [SEO-V3-AUDIT.md](SEO-V3-AUDIT.md) ·
[SEO-V2-CONTENT-STRATEGY.md](SEO-V2-CONTENT-STRATEGY.md)

---

## 1. How to read the status column

| Status | Meaning |
|---|---|
| **Served** | A page exists, is indexable, and answers the intent with real content. |
| **Served, thin** | The page exists and is honest, but has little to show because the collection is nearly empty. |
| **Gated** | The route exists but is `noindex` until it has resources — by design, not by omission. |
| **Not served** | No page answers this intent. |

The collection today: **3 books, 0 theses, 0 publications, 0 learning paths, 1
post, 5 non-empty subjects.** Most "thin" entries below become "served" purely
by publishing content — no engineering.

---

## 2. Navigational — the brand

Someone who already knows PTEC and wants its library.

| Intent | Target page | Status |
|---|---|---|
| PTEC library · PTEC e-library · បណ្ណាល័យ វ.គ.ភ | `/` | **Served** — title *"Free Digital Library for Teachers in Cambodia"*, `Library` + `WebSite` + `EducationalOrganization` graph |
| PTEC books | `/books` | **Served, thin** (3) |
| PTEC thesis · PTEC research report | `/theses` | **Served, thin** (0 — honest empty state) |
| PTEC publications · PTEC journal articles | `/publications` | **Served, thin** (0) |
| PTEC library opening hours | `/about/timings` | **Served** — `openingHours` in the `Library` node |
| PTEC library contact | `/contact` | **Served** |
| PTEC library rules / borrowing | `/about/rules` | **Served** |

**This tier is the priority.** Brand authority is the base of the ladder in
§75, it is fully within the site's control, and it does not depend on
publishing more content.

---

## 3. Institutional — PTEC the college

Queries about the institution rather than the library. **The official site
`www.ptec.edu.kh` owns these, and should.**

| Intent | Correct owner | Library's role |
|---|---|---|
| PTEC programs · PTEC faculties · PTEC departments | `www.ptec.edu.kh` | none — must not compete |
| PTEC lecturers | `www.ptec.edu.kh/lecturer-directory/` | none |
| PTEC academic papers | `www.ptec.edu.kh/academic-paper/*` | may host copies as `/publications/*` once published |
| Who runs the PTEC library | `/about` | **Served** |

The library asserts the relationship — `EducationalOrganization.url` →
`https://www.ptec.edu.kh`, `sameAs` covering the official properties,
`Library.parentOrganization` → that entity — without competing for the
institution's own queries. `www.ptec.edu.kh` already links to
`library.ptec.edu.kh/books` from its homepage.

**Deliberately not served:** faculty, department and programme landing pages.
With 3 books they would be doorway pages (§67) and, for "faculty", would state
something PTEC's own site contradicts (audit D-7).

---

## 4. Topic / informational

Someone researching a subject, not looking for PTEC.

| Intent | Target | Status |
|---|---|---|
| educational psychology · teaching methodology · classroom management | `/subjects/<slug>` | **Gated** — the route is real and bilingual, but a subject with no resources renders `noindex, follow` and is excluded from the sitemap |
| research methodology · how to write an education thesis | `/posts/<slug>` guide | **Not served** — the publishing system is complete; the team authors the content (decided 2026-08-31) |
| how to use the PTEC digital library | `/about/collection` | **Served, partial** |
| a named learning topic, step by step | `/paths/<slug>` | **Gated** (0 published) |

**Honest limit:** subject pages state counts and group resources by type. They
do **not** carry an editorial description of what a subject covers, because
`public.categories` has only `(id, name, slug, created_at)` — no description
column and no Khmer name. Generating a blurb would be inventing content about a
topic the database says nothing about. §14 asks for "meaningful semantic
content" here; the schema has to change first, and that is a migration, not an
SEO task.

---

## 5. Resource intent

Someone who wants a file.

| Intent | Target | Status |
|---|---|---|
| free teaching books Cambodia · education books PDF | `/books`, `/books/<slug>` | **Served, thin** |
| Khmer science textbook | `/books/<slug>` | **Served** — the 3 published books are Khmer science textbooks with full metadata (ISBN, pages, publisher, keywords, `datePublished`) |
| education thesis PDF | `/theses/<slug>` | **Gated** (0) |
| physical copy availability | `/catalogs/<slug>` | **Served** |

Every PDF sits behind an HTML landing page carrying the bibliographic record,
the description and the `ReadAction` — the HTML page is the SEO entity, the PDF
is the asset (§31). Verified live.

---

## 6. Khmer intent

Khmer is a first-class surface, not a translation layer: `/km` serves a Khmer
`<title>`, `meta description`, `<h1>` and body, with reciprocal
`hreflang` (`en` / `km` / `x-default`) — verified live on production.

| Khmer intent | Target | Status |
|---|---|---|
| បណ្ណាល័យឌីជីថល (digital library) | `/km` | **Served** |
| សៀវភៅសិក្សា (textbooks) | `/km/books` | **Served, thin** |
| និក្ខេបបទ (theses) | `/km/theses` | **Gated** (0) |
| វិទ្យាសាស្ត្រ · រូបវិទ្យា · ជីវវិទ្យា · គីមីវិទ្យា (science subjects) | `/km/subjects/<slug>` | **Served** — these are real, populated subject slugs |
| ការស្រាវជ្រាវអប់រំ (educational research) | `/km/posts/<slug>` | **Served** (1 post) |

**Fixed in V3:** the public `/theses` filter chips were hardcoded English on a
bilingual page — a Khmer reader saw Khmer facets under English chip labels.
Now translated, including the deliberately hedged *"មហាវិទ្យាល័យ / ជំនាញ"*.

**Remaining Khmer gap:** subject *names* come from `categories.name`, which has
no Khmer column, so an English-named subject stays English on `/km`. Schema
change, not a copy change.

---

## 7. Long-tail

§18 asks for specific rather than broad targets. The specific queries this
library can honestly answer today are the ones its three books answer:
project-based science teaching, molecular interactions for physics, water
quality for chemistry and environmental science, health education.

That is the shape of the strategy: **the long tail is created by publishing
resources, then letting the existing subject/author hubs and internal links
surface them.** No page is created to chase a phrase, and no phrase is inserted
into a page it does not describe (§66, §67).

---

## 8. Coverage summary

| Tier | Served | Thin | Gated | Not served |
|---|---|---|---|---|
| Navigational (brand) | 5 | 2 | 0 | 0 |
| Institutional | 1 | 0 | 0 | 0 (3 correctly ceded to www.ptec.edu.kh) |
| Topic | 1 | 0 | 2 | 1 (editorial) |
| Resource | 2 | 1 | 1 | 0 |
| Khmer | 3 | 1 | 1 | 0 |

**The dominant constraint is content, not coverage.** Of the gaps above, one is
editorial, two are schema, and the rest close when items are published.

---

## 9. How to fill this in with real data

When a Search Console property is connected (audit D-12):

1. group query rows by landing-page prefix (`/books/`, `/theses/`,
   `/subjects/`, `/paths/`, `/posts/`) — the tiers above;
2. split branded (`ptec`, `វ.គ.ភ`) from non-branded;
3. split by `country=KHM` and by page language;
4. record impressions/clicks/CTR/position **as measured**.

Until then this document states intents and page status only.
