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

Approved keys reused as-is (no review needed): `about.eyebrow` (the /about
title), `thesisSummary.title` / `thesisSummary.description` (the theses
index), `reader.readOnline` (the reader title), `about.breadcrumb.home` /
`about.breadcrumb.about` (About breadcrumb JSON-LD), `libraryName.km` from
System Settings (the /km title suffix and `og:site_name`).
