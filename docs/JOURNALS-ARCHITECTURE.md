# Journals — architecture

Migration `0148_journals.sql`. Audit: `docs/JOURNALS-PRE-MIGRATION-AUDIT.md`.
Measured outcome: `docs/JOURNALS-MIGRATION-REPORT.md`.

## 1. Why "Publications" left the library

"Publications" meant two different things on two sites. On the college website
(`https://www.ptec.edu.kh/publications/`) it is PTEC's own official output. In
the library it was a collection of scholarly **journal articles** — most of
them from third-party journals, none of them "PTEC's publications". A reader
who wanted the college's publications found a library listing; a reader who
wanted journal articles found a label that did not say so.

So the words now mean one thing each:

| Label | What it is | Where |
|---|---|---|
| **Journals** | the library's scholarly-article collection, organized Journal → Volume → Issue → Article | `/journals` (internal) |
| **Publications ↗** | the college's official publications | `https://www.ptec.edu.kh/publications/` (external, new tab) |

"Publications ↗" is an entry in the shared nav list
(`components/layout/digital-library-nav.ts`, `external: true`), so the desktop
mega-menu, the mobile accordion, the priority nav and the homepage collection
grid all render it the same way as the SVA Library link: grouped under the
"elsewhere" heading, external-link icon, `target="_blank" rel="noopener
noreferrer"`, an sr-only "Opens in a new tab". The footer lists it beside the
collections with the same treatment. It is never routed through `/publications`
on the library's origin. The `/journals` hub also carries a one-line note
pointing readers who came for the college's publications to that page.

## 2. What did NOT change

The `publications` **table** keeps its name, as does everything keyed to it:
the `publications` permission resource, `publications_with_stats`, the
`publication_*` tables, `getPublications()` / `getPublicationBySlug()`, the
`publications` / `publicationDetail` message namespaces, the
`TAGS.publications` cache tag, the `publication` record type in search/AI
and `record_type = 'publication'` in `book_pages`/`book_chunks`. Renaming them
would touch every query in the app for no reader-visible gain (§37 non-goals).
The admin workspace keeps its route (`/admin/publications`, now labelled
"Journal articles").

`/api/publications/[slug]/file` and `/cite` did not move either: they are not
information architecture, and the file route is the ONE place the rights gate
(`resolvePublicationDownloadAccess`) runs. `citation_pdf_url` still points at it.

## 3. Routes

| URL | Page | Gate (soft-404 → real 404) |
|---|---|---|
| `/journals` | article discovery: search, filters (journal, year, type, language, keyword, subject), journal shelf | — |
| `/journals/<journal>` | the journal: identifiers, description, aims & scope, current issue, latest articles, issues | `RESOURCE_GATES.journals` |
| `/journals/<journal>/issues` | all public issues, grouped by volume | same gate (widened pattern) |
| `/journals/<journal>/issues/<issue>` | one issue and its table of contents | `RESOURCE_GATES["journals/issues"]` → `journal_issues_public` |
| `/journals/articles/<slug>` | the article (the former `/publications/<slug>` page, moved not rebuilt) | `RESOURCE_GATES["journals/articles"]` → `publications` |

Every URL is built by `lib/journals/urls.ts` and nowhere else;
`lib/journals/urls.test.ts` scans `app/`, `components/` and `lib/` and fails on
a hand-written `/publications` URL.

**Why the article URL does not contain the journal.** An article's slug is
stable; its journal assignment is not — it is resolved from free text and is
exactly what an admin corrects when a mapping was wrong. A URL that embeds the
journal would move on every correction, and each move would chain behind the
legacy `/publications/<slug>` redirect. The hierarchy is still expressed where
it matters — the breadcrumb (Journals › Journal › Issue › Article) and the
JSON-LD `isPartOf` chain — and the legacy redirect stays one static hop with no
database lookup. `articles` is a reserved journal slug (DB `CHECK` + the gate
pattern).

## 4. Database

```
journals ─┬─< journal_volumes ─< journal_issues
          │                          │
          └──────────< publications >┘   (journal_id, volume_id, issue_id)
```

* `journals`: title (+ Khmer), slug, code, description/aims (+ Khmer),
  publisher (+ Khmer), `issn`/`e_issn`/`print_issn`, language, country,
  frequency, logo/cover, website, contact, `aliases text[]`,
  `is_published`, `is_indexable`. All optional except title and slug: nothing
  is invented.
* `journal_volumes`: `(journal_id, volume_number)` unique; `volume_number` is
  text like the legacy column, with a numeric sort key.
* `journal_issues`: per-journal unique slug (`vol-7-issue-2`), optional volume,
  date, title, description, special-issue flag.
* **Cross-journal assignment is a foreign-key violation, not a code check.**
  Composite FKs: issue `(volume_id, journal_id)` → volume `(id, journal_id)`;
  article `(volume_id, journal_id)`, `(issue_id, journal_id)` and
  `(issue_id, volume_id)` → the parent's matching pair; plus a `CHECK` that a
  volume or issue implies a journal. `ON DELETE RESTRICT` from articles: a
  journal with articles cannot be deleted.

### The compatibility rule (the whole design)

The legacy text columns `journal_name`, `volume`, `issue_no` are still what
every reader uses — SEO, Google Scholar tags, citations, OAI-PMH, AI evidence —
and what the admin workspace writes through `save_publication_atomic`, whose
column list is explicit. So the trigger `publications_sync_journal_refs`:

* **text → FK**: when the text changes, resolves the journal by
  `journal_match_key` (trim + whitespace-collapse + case-fold, nothing looser)
  against titles and admin-confirmed `aliases`; exactly one match or none
  (ambiguity is never tie-broken). Inside a resolved journal it finds or
  creates the volume and issue the text names. It **never creates a journal**.
* **FK → text**: when an FK is set directly, parents are derived from the most
  specific reference and the text is mirrored from the canonical rows. A
  resolved row's text is always the canonical spelling.
* A journal rename or volume/issue renumber propagates to its articles' text.

The RPC is untouched; readers are untouched; the canonical layer is kept exact
underneath them. `journal_remap_unmapped()` re-runs the same rule for rows that
become resolvable (after an admin creates a journal or adds an alias).

### Visibility

RLS: a journal is public when published; a volume/issue when published and in
a published journal. An **issue page** additionally needs ≥1 published article
— that rule lives in the view `journal_issues_public`, which both the edge gate
and the page read, so an empty issue is a real 404 ("no orphan issue"). A
journal page with no public article renders but answers `noindex, follow`.

## 5. Legacy redirects

In `next.config.ts` (runs before middleware), from
`legacyPublicationRedirectRules()`:

| From | To | |
|---|---|---|
| `/publications`, `/en/publications` | `/journals` | 301 |
| `/km/publications` | `/km/journals` | 301 |
| `/publications/:slug`, `/en/publications/:slug` | `/journals/articles/:slug` | 301 |
| `/km/publications/:slug` | `/km/journals/articles/:slug` | 301 |
| `/journals/articles`, `/en/…`, `/km/…` | `/journals`, `/km/journals` | 301 |

`/en/…` is listed explicitly so the middleware's `/en` strip cannot add a
second hop. Query strings are carried; `?journal=<name>` keeps filtering
because `/journals` accepts a journal name as well as a slug. An unknown slug
301s once and then 404s — the resource genuinely does not exist.

## 6. SEO

* Article: canonical/hreflang on `/journals/articles/<slug>`; every Google
  Scholar `citation_*` tag unchanged (they read the mirrored text); JSON-LD
  `ScholarlyArticle.isPartOf` = `PublicationIssue` → `PublicationVolume` →
  `Periodical` when mapped to a public journal, else exactly the pre-0148
  `Periodical` from the text. Breadcrumb gains real Journal and Issue crumbs.
* Journal: `Periodical` (`@id …/journals/<slug>#periodical`, locale-free so
  both locale pages name one entity); only check-digit-valid ISSNs; publisher
  only when the record names one.
* Issue: `PublicationIssue` chain with `hasPart` pointing at the articles'
  canonical `@id`s. Issues list: `CollectionPage`.
* One builder: `lib/seo/journal-seo.ts`; `lib/seo/publication-seo.ts` calls
  its `partOfChain()`, so article and journal pages cannot disagree on an id.
* Sitemap: article URLs always (independent of any journal read); journal,
  issues-list and issue URLs from `lib/journals/sitemap.ts` — published,
  indexable, ≥1 article; a failed journal read omits journal URLs for that
  run and never article URLs. `/publications` entries are gone.
  `robots.txt` allows `/journals/` and `/km/journals/`.

## 7. Search and AI

* `/journals` keeps the existing in-page faceting over the published set
  (institutional scale); the journal facet is by slug, with legacy name
  support. The journal page reads only the journal, its public issues and its
  newest six articles; an issue page reads one issue (capped at 500 articles).
* `/api/search/native`: article candidates also match `doi` and `issn`;
  every result URL is `articlePath()`. Ranking is untouched.
* AI: evidence and citation URLs use `articlePath()`; the citation reference
  (`publicationToCitationWork` → `apa`) already renders
  `Author. (Year). Title. Journal, Volume(Issue), pages. DOI` from the mirrored
  text, pinned by `lib/seo/journal-seo.test.ts`. Prompts are unchanged.

## 8. Admin

`/admin/journals` (list + mapping report), `/admin/journals/new`,
`/admin/journals/[id]` (journal form + volume years + issue details). Access
is the `publications` resource via the registry (`journals.manage/create/edit`
routes, `journals.create/edit/delete` actions). Issue *numbers* are not
editable in the admin — they come from the articles, and renumbering would move
every article in the issue. The article editor offers the journal titles and
aliases as suggestions on the journal-name field.

## 9. Rollback

1. Revert the application commit(s). `/publications` routes come back; the
   0148 objects are simply unused (the trigger keeps the text columns exactly
   as the old code expects, so nothing reads wrong in between).
2. Only if the schema must go too, run the commented rollback block at the
   bottom of `0148_journals.sql`, then recreate `publications_with_stats` as in
   `0125`. No legacy column was dropped or renamed, so there is no data to
   restore; the only rewrite 0148 performs on existing rows is replacing a
   mapped article's journal-name spelling with the journal's canonical title.
