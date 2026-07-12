# Metadata Exports — Schema & Contract

_Created 2026-07-11 (roadmap Task 4). Code: `lib/exports/scholarly.ts`
(pure formatters, unit-tested), `lib/exports/works.ts` (fetch + gating),
`app/api/export/`. Companion: `oai-pmh-registration.md` (OAI-PMH endpoint)._

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/export/{type}` | Bulk feed. `type` ∈ `books`, `theses`, `publications` |
| `GET /api/export/{type}/{slug}` | Single record |
| `GET /api/oai?verb=…` | OAI-PMH v2.0 (`oai_dc`), for registered aggregators |

Query parameters (feed): `format` (below, default `csl-json`), `page` (≥1),
`pageSize` (1–100, default 50). Ordering is deterministic (slug ascending),
so pagination is stable across requests.

## Formats

| `format` | Content-Type | Notes |
|---|---|---|
| `csl-json` | `application/vnd.citationstyles.csl+json` | Citation Style Language items. Author names are `literal` — Khmer names have no family/given split. |
| `dc-json` | `application/json` | Dublin Core elements as `dc:`-prefixed keys; repeatable elements are arrays. |
| `dc-xml` | `application/xml` | Dublin Core in the `oai_dc` container schema (same shape the OAI endpoint serves; parse-validated in `lib/exports/scholarly.test.ts`). |
| `bibtex` | `application/x-bibtex` | Same engine as the on-page “Cite this” (LaTeX-escaped, parse-tested in `lib/citations.test.ts`). Single records download as `{slug}.bib`. |
| `ris` | `application/x-research-info-systems` | Single records download as `{slug}.ris`. |

**Deliberately not offered**: a "DataCite" format. DataCite metadata requires
registered DOIs and mandatory fields most of this collection lacks; claiming
compliance without validating against the DataCite schema would be false.
Revisit if PTEC ever registers DOIs.

## Field mapping

Available fields per record (omitted when the source row lacks them):
title, creators, contributors (thesis advisors), institution, department,
program, publication date/year, resource type, language, abstract, keywords,
landing-page URL (always; the authoritative identifier), file URL (the
logged, access-controlled download proxy — never a raw storage URL), format,
DOI, ISBN, rights/license, journal/volume/issue/pages (publications),
modified timestamp.

## Gating — the authoritative-feed contract

- **Included**: records that are `published` **and verified**
  (`verified_at IS NOT NULL`, stamped by a librarian in the review workflow —
  see migration 0086 and `/admin/review`).
- **Publications**: `is_published` only — the publication workspace has its
  own mandatory review flow (`publication_reviews`); the table has no
  `verified_at` column.
- **Never included**: drafts, imported/unreviewed rows, archived records,
  anything unpublished. A record that is published but unverified is served
  on its landing page (with an “unverified” notice) but returns **404** from
  `/api/export/...` and never appears in feeds.
- **OAI-PMH additionally** requires a public license
  (`OAI_ALLOWED_LICENSES` / free-text check for publications) because
  harvesting implies redistribution; the `/api/export` feeds carry metadata
  only — the same facts the public landing pages serve — with the license
  exported as `dc:rights` for the consumer to evaluate.

## Operational properties

- **Version**: every response carries `X-Export-Schema-Version` (currently
  `1.0`) and JSON feeds embed `schemaVersion`. Breaking field changes bump
  the major version; additive fields do not.
- **Caching**: `s-maxage=3600, stale-while-revalidate=86400` (CDN-absorbed;
  the collection changes at most a few times a day).
- **Rate limit**: `export` policy, 30 req/min/IP by default
  (`RL_EXPORT_PER_MIN`), same DB-backed limiter as everything else.
- **Encoding**: UTF-8 throughout; Khmer round-trips are asserted in unit
  tests (CSL literals, DC XML text nodes, RIS values).

## Validation

- `lib/exports/scholarly.test.ts` — DC XML well-formedness (DOMParser),
  escaping of `<`, `>`, `&` in titles, Khmer round-trips, CSL shape, feed
  envelope paging.
- `lib/oai/xml.test.ts` + the 2026-07-09 XSD validation record — OAI side.
- Manual spot-check: `curl -s 'http://localhost:3000/api/export/theses?format=dc-xml' | xmllint --noout -` (when libxml is available).

## Consumer quick-start

```bash
# Zotero/Pandoc-ready CSL-JSON, page by page
curl 'https://library.ptec.edu.kh/api/export/theses?format=csl-json&page=1'

# One record as BibTeX (downloads as {slug}.bib)
curl -O 'https://library.ptec.edu.kh/api/export/books/teaching-methods?format=bibtex'

# Dublin Core XML feed
curl 'https://library.ptec.edu.kh/api/export/publications?format=dc-xml'
```

On-page equivalents: every book/thesis/publication page has a “Cite this”
dialog with copy + file download in APA/MLA/Chicago/IEEE/BibTeX/RIS.
