# Khmer strings awaiting review — TODO(km-review)

The SEO programme reuses approved translation keys wherever one exists. Where
a Khmer string had to be COMPOSED (no key existed), it is listed here for a
Khmer reader to approve or replace. Nothing below is new vocabulary: each is
built from words the site already publishes, but the combination is new.

| Phase | Where | Khmer | English meaning | Built from |
|---|---|---|---|---|
| 1 | `/km/catalogs/<slug>` meta description when the record has none (`app/[locale]/(public)/catalogs/[slug]/page.tsx`) | `<title> ដោយ <author> — សៀវភៅក្នុងបណ្ណាល័យ វ.គ.ភ។` | "<title> by <author> — a book in the PTEC Library." | `ដោយ` (the book fallback description's byline), `សៀវភៅក្នុងបណ្ណាល័យ` (the /km/catalogs title), the library's Khmer name from settings |
| 1 | `/km/catalogs/<slug>` `<title>` byline | `<title> ដោយ <author>` | "<title> by <author>" | `ដោយ`, as above |
| 1 | `/km/about` meta description (`app/[locale]/(public)/about/page.tsx`) | `បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ — ប្រភពចំណេះដឹង និងការស្រាវជ្រាវ សម្រាប់ឧត្តមភាពគរុកោសល្យសតវត្សទី២១។` | "Library of Phnom Penh Teacher Education College — the source of knowledge and research for excellence in 21st-century teacher education." | the /about page's own H1 and tagline, joined |
| 2 | `/km/subjects/<slug>` `<title>` (`subjects.hubPageTitle`) | `<subject> — សៀវភៅអប់រំ និងធនធានបង្រៀន (<n> សៀវភៅឥតគិតថ្លៃ)` | "<subject> — education books and teaching resources (<n> free books)" | `សៀវភៅអប់រំ និងធនធានបង្រៀន` (the /books H1 `books.h1`), `ឥតគិតថ្លៃ` from the same H1, `សៀវភៅ` after the count |
| 2 | the same, for a subject with no books (`subjects.hubPageTitleNoBooks`) | `<subject> — សៀវភៅអប់រំ និងធនធានបង្រៀន` | "<subject> — education books and teaching resources" | as above |
| 2 | `/km/authors/<slug>` heading over a staff member's advised theses (`authors.advisedHeading`) | `និក្ខេបបទដែលបានណែនាំ` | "Theses advised" | `និក្ខេបបទ` (thesis) + `ណែនាំ` from `theses.advisorLabel` "សាស្ត្រាចារ្យណែនាំ" |

Approved keys reused as-is (no review needed): `about.eyebrow` (the /about
title), `thesisSummary.title` / `thesisSummary.description` (the theses
index), `reader.readOnline` (the reader title), `about.breadcrumb.home` /
`about.breadcrumb.about` (About breadcrumb JSON-LD), `libraryName.km` from
System Settings (the /km title suffix and `og:site_name`).

## Drafts in files (Phase 2)

- `content/drafts/subject-intros.json` — a Khmer introduction (`intro_km`)
  for each of the 35 subjects, built from the phrases above plus
  `home.heroMostDownloaded` ("សៀវភៅដែលទាញយកច្រើនបំផុត"), `subjects.subtopicsHeading`
  ("ប្រធានបទរង") and `nav.learningPaths` ("ផ្លូវសិក្សា"). Each entry carries
  `km_review: "TODO(km-review)"`; the importer refuses a Khmer intro until a
  reviewer clears it. Two category names are flagged for a spelling check in
  their `notes` (កញ្ជប់គណិតវិទ្យា, វិទ្យសាស្ត្រ); nothing renames them.
- `content/drafts/hub-intros.json` — Khmer introductions for the six
  collection hubs (/books, /theses, /journals, /posts, /authors, /catalogs),
  each assembled from the existing strings listed in its `built_from`. Where
  no approved Khmer phrase exists for an English sentence, the Khmer draft
  leaves it out rather than inventing one, so the Khmer drafts are shorter.
  No page reads this file; an approved pair is copied into
  `content/hub-intros.json`.
