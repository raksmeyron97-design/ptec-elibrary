# Public route inventory

**Phase 0.2 of the 2026-09-30 SEO programme.** One row per public page
template; each template serves English at the root and Khmer under `/km` from
the same file. Paths below are relative to `app/[locale]/(public)/` unless they
start with `app/`, `components/` or `lib/`.

Sources: the code at `622db9d` (file:line), and what production served on
2026-09-30. The per-URL measurement is
[`evidence/inventory-2026-09-30.md`](evidence/inventory-2026-09-30.md), produced by
`npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh --inventory`.

## What is true of every public page

| Concern | Value | Where |
|---|---|---|
| `<html lang>` | `en` at the root, `km` under `/km` (60/60 measured) | `components/layout/RootShell.tsx:178-179` |
| Title template | `"%s · PTEC Library"`, **the same in both locales** | `app/[locale]/layout.tsx:27-30` ← `lib/system-settings/defaults.ts:76` |
| Default robots | `index, follow` in production (environment gate AND the settings switch) | `lib/seo/indexing.ts:113-119` |
| Hreflang in `<head>` | `en`, `km`, `x-default` (= en) on every page that calls `localeAlternates()`, and every public page does; 51/51 indexable URLs measured are reciprocal | `lib/seo/alternates.ts:21-27` |
| Hreflang in the sitemap | `en`, `km` only, **no `x-default`** | `app/sitemap.ts:24-31` |
| Site JSON-LD | `EducationalOrganization` + `Library` + `WebSite` with `SearchAction`, in `<body>` | `RootShell.tsx:90-163`, emitted `:228` |
| Layout Open Graph | `type=website`, `og:locale=en_US` (hard-coded), replaced wholesale by pages that call `buildOpenGraph()` | `app/root-metadata.ts:35-40` |
| Streaming | every route has a `loading.tsx`; a page that awaits data streams its body, **H1 included**, inside `<div hidden id="S:n">` (52/52 indexable URLs in the final baseline; one earlier, pre-regeneration sample of `/about/rules` had it inline) | Next Suspense + `loading.tsx` |
| Site footer | six `<h2>` (brand + five column titles) on every page | `components/layout/Footer.tsx:91, 259` |
| Site header | brand "PTEC Library" is a `<span>` inside a link; no headings | `components/layout/Navbar.tsx:168-169` |

## A. Source of each head element

Rendering: **ISR** = `revalidate` (+ `generateStaticParams` on a dynamic
segment, the Next 16 opt-in); **dynamic** = rendered per request (reads
`searchParams`, cookies, or `force-dynamic`); **static** = built once.

| Template | File | Rendering | `<title>` source | Meta description source |
|---|---|---|---|---|
| Home `/` | `(home)/page.tsx` | ISR 60 s | `t("home.seoTitle")` `:102` | `t("home.seoDescription")` `:103` |
| Books `/books` | `books/page.tsx` | dynamic (searchParams); data `unstable_cache` in `lib/books-data.ts` | `buildListingMetadata` + `t("books.seoTitle")`, "— Page N" `:76-91` | `t("seoDescription",{count})` `:81-84` |
| Book `/books/[slug]` | `books/[slug]/page.tsx` | **dynamic per request** (no `generateStaticParams`; session reads in Suspense sections `:618,682,797,828`); data `unstable_cache` 3600 s | `buildBookMetadata`: `seo_title ‖ title` (+ "(PDF)" behind a flag, off) `lib/seo/book-seo.ts:176-201` | `seo_description` (not truncated) ‖ `bookMetaDescription`: own text ≥70 ch, else + generated sentence; **cut at 157 code units + "..."** `book-seo.ts:107-153` |
| Reader `/books/[slug]/read` | `books/[slug]/read/page.tsx` | dynamic | `"{title} — Read online"` (English on `/km`) `:88` | layout default |
| Subjects hub `/subjects` | `subjects/page.tsx` | ISR 3600 s | `t("subjects.hubSeoTitle")` `:50` | `hubSeoDescription` `:51` |
| Subject `/subjects/[slug]` | `subjects/[slug]/page.tsx` | ISR 3600 s + `generateStaticParams` `:34-41` | `"{subject}"` = `categories.name` (Khmer in both locales) `:79` | counts only, `truncate` 154 + "…" `:53-56, 80-83` |
| Authors hub `/authors` | `authors/page.tsx` | ISR 3600 s | `t("authors.hubSeoTitle")` `:32` | `hubSeoDescription` `:33` |
| Author `/authors/[slug]` | `authors/[slug]/page.tsx` | ISR 3600 s + `generateStaticParams` `:31-38` | `"{name} — {Author}"` `:57` | `truncate(bio)` 154 + "…" (English bio on `/km`) ‖ `t("metaDescription")` `:42-61` |
| Theses `/theses` | `theses/page.tsx` | `force-dynamic` `:36` | `buildListingMetadata` + `t("theses.seoTitle")` `:81` | `seoDescriptionEvergreen` `:82` |
| Theses index `/theses/summary` | `theses/summary/page.tsx` | dynamic (searchParams) | **hard-coded English** "Student Theses Summary Index" (English on `/km`) `:84` | hard-coded English `:85-86` |
| Thesis `/theses/[slug]` | `theses/[slug]/page.tsx` | ISR 3600 s + `generateStaticParams` `:36-46` | `buildThesisMetadata`: `seo_title ‖ title` (not localized) `lib/seo/thesis-seo.ts:178-187` | `seo_description` ‖ `thesisMetaDescription`, 157 + "..." `thesis-seo.ts:131-161` |
| Journals `/journals` | `journals/page.tsx` | `force-dynamic` `:37` | `buildListingMetadata` + `t("publications.seoTitle")` `:82` | `seoDescriptionEvergreen` `:83` |
| Journal `/journals/[slug]` | `journals/[slug]/page.tsx` | ISR 3600 s + `generateStaticParams` | `title_km` on km ‖ `title` `lib/seo/journal-seo.ts:168` | 157 + "..." `journal-seo.ts:82-84, 157-166` |
| Issue list `/journals/[slug]/issues` | `…/issues/page.tsx` | ISR 3600 s + `generateStaticParams` | `t("issuesTitle",{journal})` `journal-seo.ts:209` | 157 + "..." `:227` |
| Issue `/journals/[slug]/issues/[issue]` | `…/issues/[issue]/page.tsx` | ISR 3600 s + `generateStaticParams` | "{journal} — {issue}" `journal-seo.ts:293` | 157 + "..." `:294-299` |
| Article `/journals/articles/[slug]` | `journals/articles/[slug]/page.tsx` | **dynamic per request** (`revalidate` but no `generateStaticParams`; cookie client `app/actions/publications.ts:262`) | `seo_title` ‖ `truncateTitleTag(title_km on km ‖ title)`, **60 chars + "…"** `lib/seo/publication-seo.ts:125-135, 203` | `seo_description` ‖ 157 + "..." `:151-158` |
| Posts `/posts` | `posts/page.tsx` | dynamic | `buildListingMetadata` + `t("posts.title")` `:72` | `t("metaDescription")` `:73` |
| Post `/posts/[slug]` | `posts/[slug]/page.tsx` | dynamic per request (cookies `:192`) | `post.title` `:165` | excerpt 157 + "..." `:135-139` ‖ `t("detailMetaFallback")` |
| Paths `/paths` | `paths/page.tsx` | dynamic (searchParams; its `revalidate` has no effect) | `buildPathsListingMetadata` + `t("seoTitle")` `lib/seo/learning-path-seo.ts:141-174` | `t("seoDescription")` |
| Path `/paths/[slug]` | `paths/[slug]/page.tsx` | `force-dynamic` `:28` | localized title `learning-path-seo.ts:58-60` | localized description, **no length cap** (measured 259 / 329 ch) `:62-73` |
| Physical library `/catalogs` | `catalogs/page.tsx` | dynamic (searchParams) | "Physical Library" `:73-93` | `t("catalogs.metaDescription")` |
| Catalogue record `/catalogs/[slug]` | `catalogs/[slug]/page.tsx` | ISR 300 s + `generateStaticParams` `:41-48` | `seo_title ‖ "{title} by {author}"` (English "by", raw inverted name, ISBD " : ") `:131` | description 157 + "..." ‖ English fallback `:132-138` |
| About `/about` | `about/page.tsx` | static | **hard-coded Khmer** "អំពីបណ្ណាល័យ — PTEC e-Library" on both locales, + the template's brand again `:24` | hard-coded English `:25-26` |
| About sub-pages `/about/{collection,committee,our-journey,rules,team,timings}` | `about/*/page.tsx` | ISR 300–3600 s | `t(…metaTitle)` | `t(…metaDescription)` |
| Team member `/about/team/[slug]` | `about/team/[slug]/page.tsx` | ISR 600 s + `generateStaticParams` (real list) | member name `:136` | `truncate(bio,160)` 159 + "…" `lib/team/public.ts:185-189` |
| Contact `/contact` | `contact/page.tsx` + `contact/layout.tsx` (metadata) | static | `t("contact.metaTitle")` `layout.tsx:38` | from published settings `layout.tsx:26` |
| Policy `/policy`, Privacy `/privacy` | `policy/page.tsx`, `privacy/page.tsx` | static | `t("policy.meta.title")`, `t("privacy.meta.title")` | `…meta.description` |
| Search `/search` | `search/page.tsx` | dynamic (`headers()`, searchParams) | "Search" `:23` | `t("search.metaDescription")` |
| Offline shell `/~offline` | `app/~offline/page.tsx` | static, `s-maxage=86400` | layout default: bare "PTEC Library" | layout default |

## B. What production serves (2026-09-30)

"H1" names the component and whether the H1 is visible before JavaScript runs.
"JSON-LD" lists the per-template types on top of the site graph, and the number
of `ld+json` blocks on the page. "Sitemap" is whether `app/sitemap.ts` emits the
template.

| Template | Canonical | Robots | H1 (visible without JS?) | JSON-LD (blocks) | og:type | Sitemap |
|---|---|---|---|---|---|---|
| Home | self | index | `(home)/page.tsx:276-290` (hidden) | `FAQPage` (2) | website | yes |
| Books | self; `?page=N` self; filters → `/books`; `?page=1` → `/books` | index; `noindex, follow` on q/dept/format/language/sort/size and out-of-range `?page` (`books/page.tsx:56-63, 90`) | `books/page.tsx:184` (hidden) | `CollectionPage` + `ItemList`, clean listing only (2) | website | hub only (pages excluded by design) |
| Book | self | index; not-found → noindex + 404 | `books/[slug]/page.tsx:438-440` (hidden) | `Book` + `BreadcrumbList`, plus `citation_*` (3) | **article** | yes (1,956) |
| Reader | → book page | noindex | **none** (PDF viewer is client-only) | none (1) | website | no |
| Subjects hub | self | index (no empty-state gate) | `components/ui/collection/CollectionHeader.tsx:31` "Browse by subject" (hidden) | `BreadcrumbList` + `CollectionPage` + `ItemList` (3) | website | yes |
| Subject | self | depth gate: noindex if < 5 resources or < 3 with full text; suppressed at ≤ 1 (`lib/subjects/indexability.ts`) | inline `:242-244`, Khmer name on English page too (hidden) | `BreadcrumbList` + `CollectionPage` + `ItemList` (3); **12 books per type, no `?page=`** (`lib/subjects/index.ts:126`) | website | indexable subjects (31 URLs) |
| Authors hub | self | index | `CollectionHeader.tsx:31` "People & organizations…" (hidden) | `BreadcrumbList` + `CollectionPage` + `ItemList` (3); links 408 authors | website | yes |
| Author | self | noindex only for composite, unidentified or 0-work bylines (`authors/[slug]/page.tsx:96-126`); **1 work = index** | `components/ui/authors/AuthorHero.tsx:67` (hidden) | `ProfilePage` + `Person`/`Organization` + `BreadcrumbList` (3) | profile | `workCount > 0 && identified` (362 URLs) |
| Theses | self / `?page=N` | noindex on filters / out of range; no empty gate | `components/ui/theses/HeroSearch.tsx:68` (hidden) | `CollectionPage` + `ItemList` (2) | website | yes |
| Theses index | self / `?page=N` | noindex on filters / out of range | inline `:392`, localized (hidden) | `BreadcrumbList` + `CollectionPage` + `ItemList`, English URLs on `/km` (3) | website | yes |
| Thesis | self | index | `components/ui/theses/record/ThesisTitleBlock.tsx:50` (hidden) | `ScholarlyArticle` + `BreadcrumbList` (3); `inLanguage: "en"` for a Khmer work; 8 `citation_author` incl. cohort label and advisors | article | yes |
| Journals | self / `?page=N` | noindex on filters / out of range / empty | `components/ui/publications/PublicationsHero.tsx:106` (hidden) | `CollectionPage` + `ItemList` (2) | website | yes |
| Journal | self | noindex if not indexable or no articles | inline `:159` (hidden) | `Periodical` + `BreadcrumbList` (3) | website | if indexable with ≥ 1 article |
| Issue list | self | noindex if not indexable or no issues | inline `:119` (hidden) | `CollectionPage` + `ItemList` + `BreadcrumbList` (3) | website | yes |
| Issue | self | noindex if not indexable | inline `:132` (hidden) | `PublicationIssue` → `PublicationVolume` → `Periodical` + `BreadcrumbList` (3) | website | yes |
| Article | self | index | `components/ui/publications/article/ArticleHeader.tsx:139`, always the English title, also on `/km` (hidden) | `ScholarlyArticle` (full `isPartOf` chain) + `BreadcrumbList` (+ `FAQPage`) (3–4) | article | yes |
| Posts | self / `?page=N` | noindex on filters / out of range (`size` not treated as a filter) | inline `posts/page.tsx:196` (hidden) | `BreadcrumbList` + `CollectionPage` + `ItemList` (3) | website | yes |
| Post | self | index | inline `:466` (hidden) | `NewsArticle` or `Event` + `BreadcrumbList`; `url` always English (3) | article | yes |
| Paths | always `/paths` | noindex only when empty; **filtered views are `index`** (measured `/paths?level=grade-1&sort=title`) | inline `:139-141` (hidden) | `CollectionPage` + `ItemList` of `Course` + `BreadcrumbList` (3) | website | yes |
| Path | self | index | inline `:188-190` (hidden) | `Course` + `Syllabus` + `BreadcrumbList` (3) | article | yes |
| Physical library | self / `?page=N` | noindex on filters / out of range | `catalogs/page.tsx:411` (hidden) | none (1) | website | hub only |
| Catalogue record | self | **noindex, follow** unless it has its own description (≥ 40 ch, not derived) or a digital twin (`lib/catalogs/indexability.ts:102-152`) | `catalogs/[slug]/page.tsx:465-467` (hidden) | `Book` (English `url`, no `@id`) + `BreadcrumbList` (3) | book | only if indexable (0 today) |
| About | self | index | `about/page.tsx:104-109`, Khmer on both locales (hidden) | none (1) | website | yes |
| About sub-pages | self | index | `components/about/AboutPageShell.tsx:184`, bilingual text (hidden) | `BreadcrumbList` with English names on `/km` (+ `AboutPage`, `ItemList`, `Person` on team/committee) (2–4) | website | yes |
| Team member | self | index; unknown → noindex + 404 | inline `:377-392`, both names (hidden) | `Person` + `BreadcrumbList`, no `@id` (3) | profile | yes (12) |
| Contact | self | index | `contact/ContactClient.tsx:269-271` (hidden) | none (1) | website | yes |
| Policy / Privacy | self | index | `components/policy/PolicyHero.tsx:103-107` (hidden) | `BreadcrumbList` (+ `FAQPage` on policy) (2–3) | website | yes |
| Search | `/search` | noindex, follow | `search/page.tsx:108-113` (hidden) | none (1) | website (`og:locale en_US` on `/km`) | no |
| Offline shell | **none** | **index, follow** | "You're offline" (hidden) | none (1) | website | no |

Not indexed by design (layout `NOINDEX_ROBOTS` + middleware `X-Robots-Tag:
noindex, nofollow` + robots.txt): `/dashboard`, `/dashboard/settings`,
`/lists/[id]`, `/profile`, `/offline-books`, `/offline-reader`, and everything
under `/api`, `/auth` and `/admin`.

## C. Non-page routes

| Route | File | Notes |
|---|---|---|
| `/sitemap.xml` | `app/sitemap.ts` | one `<urlset>`, 2,395 URLs, 1.43 MB; `lastmod` precedence varies by type (books `updated_at → published_at → created_at` `:283-289`; theses `published_at → created_at`, `updated_at` not selected `:299-305`; authors `created_at`; subjects none); `<loc>` raw Unicode |
| `/robots.txt` | `app/robots.ts` + `lib/seo/indexing.ts:128-137, 199-207` | `$`-anchored private rules in both locales; AI-crawler group (`app/robots.ts:23-51`) names `/policy` and `/contact` but not `/privacy` (no effect: nothing disallows it) |
| `/llms.txt` | `app/llms.txt/route.ts` | last changed 2026-09-20 (`0314ab1`), before the catalogue gate (#231); see F12 |
| `/googlee89036a09f36e87d.html` | `public/` | Search Console HTML-file verification |
