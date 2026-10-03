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
| 2 | `/km/catalogs/<slug>`, label before the e-book link (`catalogs.detail.digitalTwinLabel`) | `មានក្នុងបណ្ណាល័យឌីជីថលផងដែរ` | "Also in the digital library" | `បណ្ណាល័យឌីជីថល` (`home.seoTitle`), `ផងដែរ` (used 8 times in km.json) |
| 2 | the same, link text (`catalogs.detail.digitalTwinCta`) | `អានសៀវភៅអេឡិចត្រូនិក` | "Read the e-book" | `អាន` + `សៀវភៅអេឡិចត្រូនិក` (`subjects.groupBook`) |
| 2 | `/km/authors` `<title>` (`authors.hubSeoTitle`, changed so the title and the H1 say the same thing — N5) | `អ្នកនិពន្ធ — បុគ្គល និងស្ថាប័ននៅពីក្រោយបណ្ដុំឯកសារ` | "Authors — People & organizations behind the collection" | `authors.breadcrumbAuthors` + `authors.hubSubtitle` (the H1), verbatim |
| 3 | 403 page of `/km/theses/<slug>/fulltext.pdf` (`thesisDetail.fulltextNotPublic`) | `អត្ថបទពេញនេះមិនទាន់ផ្សព្វផ្សាយជាសាធារណៈនៅឡើយទេ។` | "This full text is not published openly." | `អត្ថបទពេញ` (`thesisDetail.sectionFullText`), `ផ្សព្វផ្សាយ`, `សាធារណៈ` (site copy) |
| 3 | the same page, link to the record (`thesisDetail.fulltextSeeRecord`) | `កំណត់ត្រានេះពន្យល់ពីរបៀបអាន៖ {title}` | "The record explains how to read it: {title}" | `កំណត់ត្រា`, `អាន` (site copy) |
| 3 | `/km/theses/year/<yyyy>` title/H1 (`theses.browseYearTitle`) | `និក្ខេបបទ និងរបាយការណ៍ស្រាវជ្រាវ ឆ្នាំ {year}` | "Theses and research reports from {year}" | `theses.seoTitle` + `ឆ្នាំ` |
| 3 | its description (`theses.browseYearDescription`) | `និក្ខេបបទ និងរបាយការណ៍ស្រាវជ្រាវ {count} របស់គរុនិស្សិត វ.គ.ភ ឆ្នាំ {year}។` | "{n} theses and research reports by PTEC student teachers from {year}." | `theses.seoTitle`, `គរុនិស្សិត` (thesisSummary.description) |
| 3 | `/km/theses/program/<programme>` title/H1 (`theses.browseProgramTitle`) | `{program}៖ និក្ខេបបទ និងរបាយការណ៍ស្រាវជ្រាវ` | "{programme}: theses and research reports" | as above |
| 3 | its description (`theses.browseProgramDescription`) | `និក្ខេបបទ និងរបាយការណ៍ស្រាវជ្រាវ {count} របស់គរុនិស្សិត វ.គ.ភ ក្នុងកម្មវិធីសិក្សា {program}។` | "…in {programme}." | `កម្មវិធីសិក្សា` (theses.seoDescription) |
| 3 | hub link labels (`theses.browseByYear`, `theses.browseByProgram`) | `រកមើលតាមឆ្នាំ`, `រកមើលតាមកម្មវិធីសិក្សា` | "Browse by year", "Browse by programme" | `subjects.hubTitle` "រកមើលតាមមុខវិជ្ជា" with the noun changed |
| 5 | Admin → Data Quality → Book descriptions (`adminDataQuality.descriptions.*`, 28 strings incl. `errorNeedsReview`, `sourceExtracted`) | e.g. `ការពិពណ៌នាសៀវភៅ`, `សេចក្តីព្រាង`, `អនុម័ត និងផ្សព្វផ្សាយ` | "Book descriptions", "Draft", "Approve and publish" | admin vocabulary already in km.json (`ការពិពណ៌នា`, `អនុម័ត`, `បោះបង់`, `រក្សាទុក`); staff-only screen |
| 5 | Rule-built Khmer description drafts (`lib/seo/description-draft.ts`, the `locale === "km"` branch) | `…គឺជាសៀវភៅភាសាខ្មែរ ដោយ …`, `សៀវភៅនេះស្ថិតក្នុងប្រធានបទ …`, `ជំពូកនានារួមមាន៖ …`, `អ្នកអានអាចអានអត្ថបទពេញតាមអនឡាញដោយឥតគិតថ្លៃ…` | "… is a Khmer-language book by …", "It is catalogued under …", "Its chapters cover …", "The full text can be read online free of charge" | every draft carries `TODO(km-review)` and approval refuses it until a reviewer removes the marker; fix the wording here once and every later draft inherits it |
| J | Journal page + admin journals (`messages/km.json` → `journals.*` new keys: `eyebrowIndexed`, `titleTranslation`, `accessModel`, `peerReview`, `frequencyValue`, `howToRead`, `ptecAuthorsHeading` …; `adminJournals.*` new keys) | e.g. `ការបកប្រែរបស់បណ្ណាល័យ`, `ចូលប្រើដោយសេរី`, `ការត្រួតពិនិត្យដោយអ្នកជំនាញ ដោយលាក់ឈ្មោះទាំងសងខាង`, `អ្នកនិពន្ធ វ.គ.ភ ក្នុងទស្សនាវដ្ដីនេះ` | "Library translation", "Open access", "Double-blind peer review", "PTEC authors in this journal" | `ចូលប្រើដោយសេរី` (`publicationDetail.openAccess`), `អាជ្ញាបណ្ណ`, `ទស្សនាវដ្ដី`, `លេខផ្សាយ`, `វ.គ.ភ` from existing keys; peer-review and access-model phrasing is new — `docs/JOURNALS-REDESIGN.md` |

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
| 6 | `/contact` map placeholder button (`contact.showMap`, decision P6-1) | `បង្ហាញផែនទី` | "Show the map" | sits under the existing `ទីតាំង` ("Find us") heading; the map loads only after the press |
| Home 2026-10 | Homepage shelf, third tab (`home.tabTheses`) | `សារណា` | "Theses" | `home.recentTypeThesis` verbatim |
| Home 2026-10 | the same tab's list label, read by screen readers (`home.browseListTheses`) | `សារណាដែលគេអានច្រើនជាងគេ` | "Most-read theses" | `សារណា` + `ដែលគេអានច្រើនជាងគេ` (new phrasing — "most read") |
| Home 2026-10 | the same tab when empty (`home.browseEmptyTheses`) | `មិនទាន់មានសារណាផ្សាយនៅឡើយទេ។` | "No theses published yet." | `home.browseEmptyTrending` with `ធនធាន` → `សារណា` |
