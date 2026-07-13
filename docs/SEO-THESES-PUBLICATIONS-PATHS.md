# Theses / Publications / Learning-Paths SEO & Academic-Integrity Pass

Date: 2026-07-13. Extends the Book SEO architecture (`lib/seo/book-seo.ts`,
`lib/seo/citation.ts`, `0091` slug-redirects) to the other three academic
sections. Everything below is **implemented, tested, build-verified, and
runtime-verified against the live DB** unless explicitly marked as a manual /
follow-up step.

## Verified root causes (confirmed against the live DB + Crossref)

| # | Problem | Evidence |
|---|---------|----------|
| 1 | Khmer collections not localized | `/km/theses`, `/km/publications`, `/km/paths` served English `<title>`, meta description, H1, and CollectionPage schema whose `url`/item URLs pointed at the **English** routes |
| 2 | Publication placeholder identifiers | DB row `journal-of-chemical-education`: `doi=10.1234/eds`, author `orcid=001`, `license=CC BY 44`, `publication_date=2026-07-04`, `volume=19`, `pages 1–2`, single author |
| 3 | Broken thesis citations in JSON-LD | `research_reports.references` split on PDF line-wraps → colon-ended / mid-word / joined fragments emitted as schema.org `citation` |
| 4 | Missing collection structured data | `/publications` and `/paths` had **no** CollectionPage/ItemList |
| 5 | Generic thesis title | `thesis-0338d7db` title = `របាយការណ៍` ("Report") |
| 6 | Weak learning-path content | `foundation-of-mathematics`: "foundation of Mathematics" / "This course free for all student" |
| 7 | Personal email exposed | Author `email=raksmeyron97@gmail.com` rendered as `mailto:` **and** serialized into client-component props |

## Authoritative academic data (Crossref, verified 2026-07-13)

`https://api.crossref.org/works/10.1021/ed500143m` →

| Field | Live DB (wrong) | Verified |
|-------|-----------------|----------|
| DOI | `10.1234/eds` | `10.1021/ed500143m` |
| Authors | Shadi Abu-Baker | Abu-Baker; Ghaffari; Al-Saghir; Thamburaj; Higazi |
| Volume / Issue | 19 / 6 | **91** / 6 |
| Pages | 1–2 | **776–777** |
| Date | 2026-07-04 | **2014-04-03** |
| ISSN | — | 0021-9584 (print), 1938-1328 (online) |
| License | `CC BY 44` | **none** — © 2014 ACS, paywalled (NOT open access) |
| ORCID | `001` | none registered |
| `isbn 978-0-470-50552-6` | (article's) | is the **reviewed book's** ISBN, not the article's |

## What changed (code — safe, shipped)

New reusable, pure, unit-tested modules:
- `lib/seo/identifiers.ts` — DOI / ORCID (mod-11-2) / ISBN-10+13 / ISSN checksum + license normalizer. Rejects placeholders/bad checksums → callers omit the field.
- `lib/seo/references.ts` — `schemaCitations()` completeness filter (drops PDF-wrap fragments).
- `lib/seo/thesis-seo.ts` — localized metadata, `isGenericThesisTitle()`, `thesisJsonLd()`, `thesesCollectionJsonLd()`.
- `lib/seo/publication-seo.ts` — localized metadata, validated `publicationJsonLd()` (no fake identifiers, verified-license-only, `isAccessibleForFree` gated on rights), `publicationsCollectionJsonLd()`.
- `lib/seo/learning-path-seo.ts` — localized (Khmer never falls back to English), `pathCourseJsonLd()`, `pathsCollectionJsonLd()`.

Wired in:
- `lib/seo/citation.ts` — Google Scholar `citation_doi` validated, `citation_issn` replaces the conflated `citation_isbn`.
- Publication / thesis / path detail pages → localized `generateMetadata` + validated JSON-LD; the `ScholarlyArticleJsonLd` "Unknown Author" fabrication is gone.
- Theses / publications / paths **listing** pages → localized metadata (namespace SEO keys) + locale-aware CollectionPage/ItemList (clean listings only).
- Paths listing + detail → fully localized UI (H1, intro, empty state, module/step counts, resource-type labels, `instruction_km`, breadcrumbs).
- `AuthorBiosSection` / `AuthorAffiliationPanel` → ORCID validated; personal email removed from display; `getPublicationBySlug` redacts `email` from the public payload (admin keeps it).
- `app/actions/theses.ts` → `checkPublishReady` blocks publishing a generic title unless `official_title_verified`.
- `app/llms.txt` → publications + paths counts, EN/KM discovery paths, and a **Rights And Access** section (citation-only vs open-access).
- `messages/en.json` + `messages/km.json` → SEO + paths UI keys (parity verified).

### Runtime evidence (dev server, live DB)
- `/km/theses` `<title>` = `និក្ខេបបទ និងរបាយការណ៍ស្រាវជ្រាវរបស់និស្សិត`, `<html lang="km">`, CollectionPage `url`/items = `…/km/theses/…`.
- `/publications/journal-of-chemical-education` JSON-LD: `identifier` **undefined**, `sameAs` **undefined**, `license` **undefined**, `isAccessibleForFree: false`, `copyrightNotice` present. `citation_doi`/`citation_isbn` absent.
- Personal email in page HTML: **0 occurrences**.
- Thesis citations: 9 raw → **5 complete** (fragments dropped).

### Gate
`tsc` 0 errors · `vitest` 534 passed (was 522; +~70 new) · `next build --webpack` ✓ · no new ESLint errors in touched files.

## Migrations

- `supabase/migrations/0092_publication_academic_metadata.sql` — **ADDITIVE, idempotent, safe to auto-apply**: adds `publications.issn`, metadata-verification + rights provenance columns, and `research_reports.metadata_source` / `official_title_verified`.
- `supabase/manual/0092_publication_data_correction.sql` — **NOT in migrations/** so it does not auto-run. Corrects the ACS record to the Crossref-verified values, nulls the fake ORCID, adds the 4 missing co-authors, sets `license=NULL` (no open-access claim) + `fulltext_redistributable=false`. Backs up the row to `publications_backup_0092`; rollback block included. **Apply only after authorized review** (canonical identity + licensing).

## Applied to production (2026-07-13, per user approval)
- **ACS record corrected via PostgREST** (row backed up to `supabase/manual/0092_backup_20260713-185134.json`): DOI→`10.1021/ed500143m`, volume→91, pages→776–777, date→2014-04-03, `article_no` (fake `e1234`)→null, `license` (`CC BY 44`)→null, copyright kept, journal/publisher confirmed. Fake ORCID `001`→null. Four co-authors (Ghaffari, Al-Saghir, Thamburaj, Higazi) inserted → 5-author byline. Runtime-verified: JSON-LD + `citation_*` now carry the real DOI/authors/volume/pages/date; `isAccessibleForFree:false`; no license claim.
- **ACS full text is now citation-only**: `/api/publications/[slug]/file?download=1` returns **403** with a DOI link for non-redistributable ©content (verified). Inline behavior unchanged; **no file deleted**. Gate is in `app/api/publications/[slug]/file/route.ts` and honors `fulltext_redistributable=true` once set.
- **Still pending the 0092 schema deploy**: `issn`, `metadata_verified*`, `fulltext_redistributable`, `rights_source`, `metadata_source` — run the POST-DEPLOY block in `supabase/manual/0092_publication_data_correction.sql` after 0092's columns exist.

## Decisions still owned by a human
1. **Thesis official title** (`thesis-0338d7db`) — must be read from the source document; do not invent from the abstract. The generic-title block prevents *new* such publications from being published.
2. **Learning-path copy** (`foundation-of-mathematics`) — suggested "Foundations of Mathematics for Teacher Trainees" + a real description; needs curator confirmation before overwriting.

## Follow-ups (not done this pass)
- Extend the `0091` slug-redirect table to publications + paths (theses already 301 via middleware).
- Admin SEO/academic-integrity panels for the three sections (search/social preview, identifier validation, rights status) — the validators + `official_title_verified`/rights columns are ready to back them.
- Gate `/api/publications/[slug]/file` download on `fulltext_redistributable`.
- Curated topic/journal/author hubs (only with enough verified content — avoid doorway pages).
