# SEO V2 — Content Strategy

Who this library is for, what they search for, and how the site's structure
answers those searches. Companion to
[SEO-V2-URL-POLICY.md](SEO-V2-URL-POLICY.md) (the technical rules) and
[SEO-V2-AUDIT.md](SEO-V2-AUDIT.md) (the findings that motivated this).

This document describes an **architecture and an editorial standard**, not a
content calendar. Publishing decisions belong to the library staff; this says
what the site does with what they publish.

---

## 1. Who this is for

| Audience | What they are doing | Where they land |
|---|---|---|
| **PTEC student teachers** | Finding a set text, a thesis to model, a topic to research | `/books`, `/theses`, `/subjects/*` |
| **PTEC lecturers & researchers** | Locating publications, checking what the library holds on a topic, citing | `/publications`, `/authors/*`, `/subjects/*` |
| **Cambodian teachers outside PTEC** | Free teaching material, classroom methods | `/subjects/*`, `/paths/*`, `/posts` |
| **Regional & international researchers** | Cambodian education research, institutional output | `/theses`, `/publications`, `/authors/*`, OAI-PMH |
| **Prospective students & the public** | What PTEC is, what the library offers | `/`, `/about/*` |

The collection is small today (audit §4: 3 books, 1 post, 0 published theses or
publications). **The strategy is therefore structural**: build the layers that
make a thousand resources discoverable, and let them degrade honestly to empty
states at three.

## 2. Search intents this site answers

Ordered by how well the current architecture serves them.

| Intent | Example query | Answered by | Status |
|---|---|---|---|
| Known-item | *"អន្តរកម្មសម្រាប់វិទ្យាសាស្ត្ររូបវិទ្យា"* | resource detail page | strong — exact-title ranking, full metadata, JSON-LD |
| Topic browse | *"educational psychology books Cambodia"* | `/subjects/*` | **new in V2** — was a bare filter grid |
| Person | *"[researcher name] PTEC"* | `/authors/*` | **new hub in V2** — profiles existed but were orphaned |
| Guided learning | *"how to write an education thesis"* | `/paths/*` | strong structure, needs content |
| Institutional | *"PTEC library"* | `/`, `/about/*` | strong |
| Format | *"free PDF teaching resources Khmer"* | `/books` + facets | good; filter URLs deliberately `noindex, follow` |
| Scholarly | DOI, journal name, thesis title | `/publications/*`, OAI-PMH | strong — `ScholarlyArticle`, Dublin Core, harvestable |

## 3. Topic clusters

Clusters are **derived from the collection, not invented**. `public.categories`
is the taxonomy of record; a cluster exists when the library actually holds
resources for it.

```
LEARNING PATH  (a route through the collection)
      │
      ▼
   SUBJECT     (/subjects/<slug> — the topic hub)
      │
      ├── E-books        → /books/<slug>
      ├── Theses         → /theses/<slug>
      ├── Publications   → /publications/<slug>
      └── Physical stock → /catalogs/<slug>
                │
                ▼
            AUTHOR       (/authors/<slug> — the person hub)
```

Candidate clusters for PTEC's mission — **only to be created as real subjects
once resources exist to fill them**:

educational research · teacher education · teaching methods · educational
psychology · classroom management · assessment · research methodology · child
development · learning theory · teacher training · action research · thesis
writing

**Do not pre-create empty subjects to "target" these terms.** That is the exact
failure V2 removed: ten empty subject pages, indexable and in the sitemap,
answering nothing (audit F-1). A subject page earns its URL by having resources.

## 4. Internal linking

The knowledge graph is expressed in HTML, not only in the database.

```
RESOURCE (book / thesis / publication)
   ├── → its SUBJECT          ResourceConnections
   ├── → its AUTHORS          ResourceConnections
   └── → related resources    RelatedBooks / RelatedTheses / RelatedPublications

SUBJECT (/subjects/<slug>)
   ├── → resources, grouped by type
   ├── → each type's full listing
   ├── → related subjects (publication co-tagging)
   └── → the subject hub

AUTHOR (/authors/<slug>)
   ├── → every work by that person
   └── → the author hub

FOOTER (every public page)
   └── → /subjects, /authors        ← what makes both hubs crawlable at all
```

Three standards:

1. **Every link must be defensible.** `lib/resources/connections.ts` resolves a
   name to a hub URL only when that hub has resources. An unresolvable byline
   renders as plain text, not a dead link.
2. **Related ≠ similar.** "Related subjects" are subjects a librarian tagged on
   the same publication — real co-occurrence. When there is no such evidence the
   page shows a differently-headed "More subjects" list. Two different claims,
   two different headings.
3. **Restraint.** Per-type caps and an 8-item related rail. A page linking to
   everything transfers meaning to nothing.

## 5. Khmer as a first-class language

Khmer is not a translation layer over an English site.

**Required for every public page:**

- `<title>`, `<meta description>`, `<h1>` and body copy natively in the page's language
- Khmer subject and author names shown as the library records them
- `og:locale` = `km_KH` with `en_US` as the alternate
- reciprocal `hreflang`, and Khmer content actually behind the `km` alternate

**The rule V2 enforces:** if a page cannot be localized, it must not claim a
Khmer alternate. `/km/subjects/*` served English titles, English descriptions
and English chrome while declaring `hreflang="km"` (audit F-6) — a false
alternate is worse than a missing one.

**Where Khmer needs care:** Khmer has no plural inflection, so ICU plurals
degrade to a single form (`{count} ធនធាន`). Khmer slugs are percent-encoded in
transit and must be decoded with `decodeSlugParam()` in the page body — Next
delivers non-ASCII segments encoded to the body and decoded to
`generateMetadata`.

## 6. Editorial standards

**Never fabricate.** Omit an unknown publisher, ISBN, page count or date; never
write `Unknown Author`, `N/A`, `General` or a guessed year. `lib/seo/*` already
enforces this in metadata and JSON-LD; the same rule governs prose.

**Say only what the data supports.** `public.categories` has four columns —
`id`, `name`, `slug`, `created_at`. There is no description field, so a subject
page states *counts* ("8 e-books · 2 theses"), never a generated paragraph about
what the topic covers. When the schema gains a description column, use it; until
then, silence beats invention.

**No SEO filler.** No keyword blocks, no generated FAQs, no doorway pages, no
near-duplicate topic pages, no fake ratings. Every indexable URL must be somewhere
a person would actually want to land.

**Counts must agree everywhere.** `lib/subjects/matching.ts` holds the pure
matching rules shared by the hub's in-memory counting and the detail page's
database filter, so a hub advertising 12 resources cannot open a page listing 9.
Public totals come from `getCollectionStats()` and nowhere else.

## 7. The `/posts` layer

`/posts` is the site's editorial surface and its clearest growth opportunity —
one post is published today.

High-value evergreen guides, each of which would link naturally into subjects,
theses and learning paths:

- How to conduct educational research
- How to write an education thesis
- Research methods for teacher-training students
- How to find educational research resources
- Teaching resources for Cambodian teachers

**Not implemented, and deliberately so.** Writing these is editorial work for
library staff, in both languages, with real authorship. Generating them would
produce exactly the low-value content this strategy prohibits. The *system* to
publish them — Markdown pipeline, per-post SEO overrides, `Article` JSON-LD,
scheduling, bilingual fields — already exists and is ready.

## 8. What to do next, in order

1. **Publish content.** The architecture scales to thousands of resources; it
   currently has a handful. This is the binding constraint, not the code.
2. **Repair the ten `book-<epoch>` category slugs** (audit F-10) — migration plus
   301s from the old URLs.
3. **Resolve the Cloudflare robots.txt conflict** (audit F-2).
4. **Fill author profiles** — biography, affiliation, ORCID. The `Person`
   structured data emits only what exists.
5. **Write the guides in §7**, in Khmer and English.
6. **Submit the sitemap to Search Console** and watch coverage, especially that
   subject URLs stop being reported as soft-404s.
