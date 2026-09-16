# Journal Article Detail — UX Audit (Phase A)

Audited 2026-09-14, before any redesign code was written. Subject:
`/journals/articles/[slug]` — `app/[locale]/(public)/journals/articles/[slug]/page.tsx`
and the ~25 components it composes (`components/ui/publications/*`,
`components/ui/detail/*`).

**Evidence base.** Code reading, plus measurements of the live article
[`handmade-conductivity-measurement-device-thin-film-semiconductor-polypyrrole`](https://library.ptec.edu.kh/journals/articles/handmade-conductivity-measurement-device-thin-film-semiconductor-polypyrrole)
(en + km, 375 px and 1440 px, full-page Playwright captures with
`content-visibility` forced visible), plus the five seeded articles in
`supabase/seed.sql` §11, which cover every access state. Numbers quoted below
were measured, not estimated. Reference for hierarchy only (never branding):
the ACS article page for the same paper, `10.1021/ed500287q`.

The live article is a good stress case in one direction and a poor one in
another: it has four authors, two affiliations, two corresponding authors, a
Khmer title and abstract, eight keywords and a bio in both languages — but no
file, no figures and no references. Figures, references, long reference lists
and access states were audited on the seeded records and in code.

---

## 1. Information hierarchy

### What appears first (desktop, 1440 × 900)

The first viewport is spent almost entirely on one rounded card, the
masthead (`PublicationHero`), **788 px tall**. Inside it, in DOM order:

1. a journal **pill badge** (uppercase, 11 px, brand-tinted) with the article
   type squeezed inside it as a 9.5 px chip;
2. a rights chip ("LICENSED");
3. the DOI, top-right, **11.5 px mono in muted grey** — the lowest-contrast
   text in the masthead;
4. the title (36 px), then the Khmer title (22 px);
5. the byline, then a closed "Affiliations & corresponding author" disclosure;
6. "Cite this:" plus the citation line in italics;
7. three meta chips — date, licence text ("© 2014 American Chemical Society"),
   language;
8. five utility actions of near-equal weight (Add to List, Bookmark, Share,
   Copy Link, Export Citation);
9. the access notice;
10. a metrics strip with 44 px tiles: **"2 Views"** and **"2014 Year"**.

### What appears second

The **abstract starts at y = 1,096 px** — below the fold on a 900 px laptop
screen. On a 375 px phone it starts at **≈1,480 px**, after about two full
screens of masthead.

### What competes visually

| Competing element | Why it competes |
|---|---|
| Metrics strip ("2 Views", "2014 Year") | Full-width, bordered tiles with icons at the same weight as the actions; a view count of 2 is not information a reader needs before the abstract, and the year is already in the citation line. |
| Five equal utility buttons + a bordered "Bookmark" | No primary action exists on a record without a file, and nothing marks which control matters. "Bookmark" alone has a border (its component's built-in classes), so the odd one out draws the eye. |
| Journal pill badge | Styled as a tag, not as a masthead; it reads as a category label rather than "this is where the work was published". |
| Related books grid (6 cover cards) | The heaviest visual block on the whole page — heavier than the abstract — and it is the *least* related content on it. |

### What is buried

| Fact | Where it is | Problem |
|---|---|---|
| **Volume / issue** | Only inside the italic "Cite this" line, and in the breadcrumb — which hides journal below `sm` and issue below `md`. | On a phone there is no link to the issue anywhere near the top. |
| **DOI** | 11.5 px muted mono, top-right. | The article's permanent identifier is the least prominent text in the header; no copy control. |
| **Article type** | 9.5 px chip inside the journal badge. | Hard-coded English ("Article") on `/km`. |
| **Return to the issue** | No control at all. | A reader who arrived from an issue's table of contents has only the browser's Back button. |
| **Previous / next article** | Does not exist. | No way to move through an issue in printed order. |
| **References** (seeded record) | Section exists, but the nav entry is one of up to nine chips in a horizontal scroller. | Fine on desktop; off-screen chip on phones. |

### What is duplicated

| Fact | Occurrences on the live page |
|---|---|
| Licence / copyright | Rights chip; meta chip "© 2014 American Chemical Society"; sidebar "License" row; sidebar "Copyright" row — **4** |
| Year / date | Citation line; date chip; metrics strip "2014"; sidebar "Published" row — **4** |
| DOI | Masthead top-right; sidebar row — 2 |
| Journal name | Breadcrumb; badge; citation line; sidebar row — 4 |
| Copy link | "Copy Link" button; the copy field inside the Share dialog — 2 |
| **One related article** | "The Challenge of Enhancing Teacher Professional Identity…" appears in **More from this author** *and* **Related Articles** ("Same author"). `MoreFromAuthor` and `getRelatedPublications()` query independently and nothing de-duplicates across the two blocks. |

### What has too much visual weight

The masthead card itself (rounded 28 px, bordered, gradient top rule, shadow)
makes the header look like one card among several rather than the page's
masthead; the sidebar then adds three more cards of the same shape
(Publication information, Cite this article, Subjects & keywords), and the
authors section adds four more. The page is a stack of ~10 cards of equal
visual rank.

---

## 2. User tasks

| # | Task | Today (live article unless noted) | Verdict |
|---|---|---|---|
| 1 | Understand what article this is | Title is large and clear. Article type is a 9.5 px chip. | Mostly OK |
| 2 | Identify journal / issue | Journal: pill badge. Issue: only in the italic citation line and in a breadcrumb that hides it on phones. | **Weak** |
| 3 | Identify authors | Byline is one dense run of names with superscripts; affiliations behind a closed disclosure. | OK on desktop; dense on phones |
| 4 | Read abstract | Starts at 1,096 px (desktop) / ≈1,480 px (phone). On a 375 px phone the 86-word English abstract is **clipped behind "Show more"** (14-line cap ≈ 80 words at that width). | **Weak** |
| 5 | Read article | Seeded records: "Preview PDF" scrolls to an inline viewer that mounts on click. Live article: no file, so nothing — correctly. | OK |
| 6 | Download / open PDF | Drawn from `resolveDownloadAccess()`; refusal is explained by `PublicationAccessNotice`. The sticky nav re-surfaces Download after the masthead scrolls away (desktop only). | **Good — preserve** |
| 7 | Copy citation | "Export Citation" jumps to a sidebar card; on a phone that card sits between the abstract and the authors, ~1,100 px of cards. | Works, but far from the trigger |
| 8 | Find DOI | Muted 11.5 px text; no copy action. | **Weak** |
| 9 | Find references | Seeded record: numbered list with DOI/URL pills and back-links. Good structure; each row is a hover card. | OK |
| 10 | Find related articles | Three blocks of different shapes (carousel, card, grid), one duplicate, ordered author → related → books with no journal list first. | **Weak** |
| 11 | Return to issue | Not offered. | **Missing** |
| 12 | Previous / next article | Not offered. | **Missing** |

---

## 3. Responsive

| Width | Finding |
|---|---|
| 375 / 390 / 414 | Breadcrumb collapses to Home › Journals › title — journal and issue vanish. Masthead ≈1,320 px tall. Utility actions wrap into a 2-column grid of unequal buttons. The record rail is spliced in after the abstract: ten `dl` rows + a citation builder with six format tabs + keyword cloud ≈ 1,100 px before "About the authors". No horizontal overflow (measured `scrollWidth = 375`). |
| 768 | Cover thumbnail appears beside the title and costs 108 px of title width at exactly the width where the title needs it most. |
| 1024–1440 | Two-column body; rail is sticky. Abstract measure is capped at 70 ch — good. |
| Very long titles | Never truncated in the masthead (good); truncated in the breadcrumb (acceptable). |
| Many authors | One inline run; with 10+ authors it becomes a paragraph of names above the fold. Superscripts are 11 px. |
| Many keywords | Pills wrap in the sidebar; eight keywords = eight rows on the live page. |
| Long abstracts | Collapse at 14 lines regardless of viewport — which on phones clips ordinary 150–300-word abstracts. |
| Many figures | One figure per row at up to 520 px; fine. |
| Large reference lists | Collapse after 10 with "Show all N references" — good, and targets stay in the DOM for fragment links. |

---

## 4. Accessibility

| Area | Finding |
|---|---|
| Heading hierarchy | One `h1` (good). `h3` author names read **"Set SengCorresponding author"** — the badge sits inside the heading with no space. "More From This Author" is a styled `span`, so its `h3` hangs under the previous `h2` ("Explore related"). Every related **PublicationCard title is an `h2`**, flattening the outline into a list of peer sections. |
| Landmarks | The article is a `<section>` inside `<main>`; there is no `<article>` for the work itself. Breadcrumb `nav` is labelled; the section nav is labelled ("Article sections"). |
| Keyboard | All controls are native buttons/links. The reference "copy" button is `opacity-0` until hover but becomes visible on `:focus-visible` — OK. |
| Focus | Components hand-write `focus-visible:ring-2` while the base layer also paints an outline; mostly harmless now that the base fallback is in `@layer base`. |
| Contrast | DOI at 11.5 px `text-text-muted` is small but passes (muted #59677E is 5.7:1 on the white card, 5.2:1 on the page ground). |
| Buttons / names | `BookmarkButton` has English-only `aria-label`s ("Save publication") on `/km`. `ShareButton` is `aria-label="Share"` in both locales. `ReadingListButton` label is English ("Add to List", "In N lists"). |
| Images | Cover in masthead is `aria-hidden` + `alt=""` — correct. Figures: `alt_text` when catalogued, else decorative with the caption carrying meaning — correct. **Live author photo is broken** (`www.ptec.edu.kh` is not in `images.remotePatterns`; `/_next/image` answers 400) — flagged as a separate task. |
| Figure captions | Real `<figure>`/`<figcaption>`; lightbox is a native `<dialog>` with arrow-key stepping — **good, preserve**. |
| Sticky navigation | The sticky chip bar overlaps the top of every section it scrolls to unless `scroll-mt-*` is right; it is (`scroll-mt-24 lg:scroll-mt-36`). |
| Mobile controls | Tap targets are ≥ 44 px on actions. The rail's "Back to top" is desktop-only by design. |
| Reduced motion | The metrics count-up honours `prefers-reduced-motion`; smooth scrolling in the section nav does **not** check it. |

---

## 5. Other defects found in passing (not UX, flagged separately)

* **`citation_pdf_url` is emitted unconditionally for articles**
  (`lib/seo/citation.ts` → `publicationScholarMeta`). The live article has no
  file, yet tells Scholar a PDF exists. Books already omit the tag when the
  file may not be handed out. Out of scope for a UX change; raised as its own
  task so this redesign stays SEO-neutral.
* **Author photos from `www.ptec.edu.kh` are refused by the image optimizer.**
  Config change, raised as its own task.
* **Untranslated strings on `/km`:** article type (`TYPE_LABELS`), language
  chip ("English"), date (`toLocaleDateString("en-GB")`), "Copy Link"
  (`CopyLinkButton`), "Add to List" (`ReadingListButton`, shared with books),
  "Cite" in the compact action set.

---

## 6. What must survive the redesign

Every item in the brief's preservation list exists today and is load-bearing:

* **One access decision.** `resolveDownloadAccess()` is shared with
  `/api/publications/[slug]/file`; buttons must keep being drawn from it, and
  the notice must keep stating *why* when a button is absent.
* **Sections and nav from the same booleans** (`has.*`) — no dead anchors.
* **Fragment targets stay in the DOM** (abstract clipping and the reference
  collapse are CSS/`hidden`, never unmounting), so citation back-links work.
* **Abstract reader dialog + text-size controls** (`e2e/abstract-reader.spec.ts`
  depends on "Open abstract reader").
* **Breadcrumb `nav` named "Breadcrumb" with a "Journals" link** —
  `e2e/journals.spec.ts` asserts it, and the BreadcrumbList JSON-LD mirrors it.
* **JSON-LD, Scholar tags, canonical/hreflang** — untouched by this work; they
  are produced in `generateMetadata` and by `publicationJsonLd`, not by the
  visual components.
* **View ping** (`PublicationViewPing`), and download counting, which happens
  server-side in the file route when `?download=1` is requested — any "PDF"
  control that links there keeps being counted.

## 7. Redesign decisions this audit drives

1. Masthead becomes an **unboxed editorial header**: journal context row →
   type eyebrow → title → structured authors → compact affiliations →
   citation metadata (citation line, dates, DOI with copy/open) → primary
   actions (Read, PDF) → quieter secondary actions (Cite, Save, Add to list,
   Share). No metrics strip, no meta chips, no licence repeated.
2. **Back to issue** and **previous / next** in the issue's printed order
   (`compareArticlesInIssue`, the same order the issue page uses) — rendered
   only when the article is in a public issue.
3. **Cite** becomes a dialog, not a rail card.
4. Body gets a **quiet "On this page" rail** on desktop and a non-sticky
   **"Jump to"** row on phones; a small **bottom action bar** on phones once
   the header has scrolled away.
5. Abstract is not clipped on ordinary abstracts; keywords follow it inline.
6. The record's remaining facts (publisher, ISSN, licence, copyright,
   language, ISBN) move into one **"Published in"** journal context block near
   the end, beside View issue / View journal.
7. Related scholarship is ordered journal → authors → related → books, as
   **lists** for articles and a lighter shelf for books, de-duplicated across
   blocks.

---

## 8. What shipped (phases B–I)

| Decision | Where it lives |
|---|---|
| What to show, decided once and tested offline: section list from `has.*`, related de-duplication (journal > author > related), the record's own dates, affiliation numbering (a marker never points at nothing) | `lib/publications/article-layout.ts` (+ test) |
| Previous / next in the issue's printed order | `issueNeighbours()` in `lib/journals/order.ts` (+ test) |
| Editorial header: back link, journal context, type eyebrow, title (steps down a size past 120 / 200 characters, never truncated), structured authors, affiliations (folded past four), citation line, dates, DOI with copy | `components/ui/publications/article/ArticleHeader.tsx`, `ArticleAuthors.tsx`, `ArticleDoi.tsx` |
| Primary vs secondary actions, drawn only from `resolveDownloadAccess()` | `ArticleActions.tsx` |
| Cite as a native `<dialog>` (bottom sheet on phones), opened from the header, the rail or the dock | `CiteArticleDialog.tsx`, `lib/publications/cite-bus.ts`; `CitePublication.tsx` is now the chrome-less panel inside it |
| "On this page": sticky rail ≥ 1024 px, non-sticky "Jump to" below | `ArticleSectionNav.tsx` (replaces `SectionQuickNav`) |
| Phone action dock, shown only once the header's actions have scrolled past; carries the assistant, which now scopes to the article again | `ArticleMobileDock.tsx`, `FloatingDock` `revealAfterPassed`, `lib/ask/resource-context.ts`, `lib/nav/shell-routes.ts` |
| "Published in" block with the remaining record facts | `ArticleJournalContext.tsx` |
| Related scholarship as lists, books last on a lighter shelf | `ArticleScholarship.tsx`, `SimilarBooks.tsx`; queries moved into `lib/publications/related.ts` |
| Body restyle: calmer section headings, abstract 17/18 px and folded only past ~2,400 characters, bibliography-style references, fixed-ratio figures with a visible Enlarge control, list-style authors, lighter TOC / outcomes / FAQ | `ArticleSectionHeading.tsx`, `PublicationAbstractSection.tsx`, `ReferencesSection.tsx`, `PublicationFigures.tsx`, `AuthorBiosSection.tsx`, `TableOfContentsSection.tsx`, `LearningOutcomesSection.tsx`, `PublicationFAQ.tsx` |
| Loading state in the page's own order | `components/ui/skeletons/PublicationDetailSkeleton.tsx` |

Retired (no other importer): `PublicationHero`, `PublicationSidebar`, `PublicationMetadataCard`, `AuthorAffiliationPanel`, `SectionQuickNav`, `MoreFromJournal`, `MoreFromAuthor`, `RelatedPublications`.

Unchanged by design: `generateMetadata`, `toPublicationSeoInput`, the JSON-LD builders and the Scholar tags. Rendered head + JSON-LD were diffed old-vs-new on seven article URLs (both locales, every access state) and are identical.

---

## 9. Follow-up: the three requirements phases B–I did not reach

The brief's §8 (bilingual UX), §13 (text-size control) and §18 (author
biographies) were still unmet after the redesign above shipped. All three are
the same defect wearing three hats: **a bilingual record printed both languages
at once**, and the control that would have let a reader choose either did not
exist or was too heavy to sit where it belonged.

| Requirement | Was | Is |
|---|---|---|
| §8 abstract | English then Khmer, stacked under a divider — a reader of one paid the other's height, and on a phone that is a screenful before the rest of the article | `EN \| ខ្មែរ` switch leading the abstract; one language visible, the other `hidden` |
| §13 text size | `A− 100% A+ ⤢` — a four-button strip beside the "Abstract" heading, outweighing it | one `Aa` disclosure; the strip opens under it, labelled "Text size" |
| §18 biographies | `bio` and `bio_km` both printed — four authors with both languages added eight paragraphs, half unreadable to any one reader | the reader's language leads; the other sits behind a `<details>` |

### The rules that bound it

* **Folded is not gone.** The other language stays in the DOM (`hidden`, never
  unmounted) because four things depend on it being there: a crawler, the print
  stylesheet (`print:!block` restores both — paper has no switch), a reader
  without JavaScript (a `<noscript>` rule reveals both and removes the switch),
  and the reference back-links, which point *into* whichever abstract cited
  them. That last one needed code: following a back-link into the folded
  language now brings that language forward first, because `scrollIntoView` on
  a hidden element is a no-op — the same defect the collapse had before it
  learned to reveal its own hash target.
* **One choice, two surfaces.** The fullscreen reader takes the language the
  same way it takes the text size — from the section — so a reader who chose
  ខ្មែរ is not shown both again on opening it.
* **Preference, never coercion.** `resolveAbstractLanguage()`
  (`lib/publications/abstract-language.ts`, pure) opens in the reader's locale
  *only where that language has text*: an English-only article on `/km` still
  renders its English abstract, and the switch is offered only when both sides
  carry text — a control with one reachable side decides nothing.
* **The meter describes the text on show.** It was computed from the English
  abstract whichever language led, so a Khmer reader was told how long a
  paragraph they were not looking at would take. It now follows the active
  panel — and is **withheld for Khmer**, which is written without spaces and
  has no segmenter here: `split(/\s+/)` reports a 200-word Khmer abstract as
  one word. An absent estimate is honest; a wrong one is not.
* **Compact is opt-in.** `ReaderToolbar` gained `variant`, defaulting to the
  full strip. The thesis abstract renders the same inline toolbar and is
  outside this work; the dialog IS the reading surface, so its controls stay
  out where one press reaches them, which `e2e/abstract-reader.spec.ts`
  asserts. Pinned by `components/ui/reader/ReaderToolbar.test.tsx`.
* **A disclosure for a biography, a switch for an abstract.** The abstract is
  the content, so it gets a control with both options on show; a biography is
  supporting information, so it gets plain `<details>` — no JavaScript, in the
  DOM for a crawler and a printer, keyboard-operable by default.

### Verified

* Rendered head + JSON-LD diffed old-vs-new over 6 URLs (both locales, four
  access states): **identical**. No SEO surface is touched by any of this.
* `e2e/journal-article.spec.ts` green on both projects, including its WCAG
  A/AA scan. Axe (wcag2a/2aa/21a/21aa/22aa) additionally clean with the reader
  dialog open in both locales, with the text-size disclosure open, after
  switching language, and with a biography expanded.
* `e2e/abstract-reader.spec.ts` **cannot run against this seed** — its fixture
  slug `journal-of-chemical-education` is not a seeded article, so all 8 cases
  skip (pre-existing). Its assertions about the dialog were therefore checked
  directly against a seeded article over 2 locales × 5 viewports
  (360/390/768/1440/1920): `article > section[lang]` preserved, one language
  visible, every button ≥ 44 px and on-screen, no horizontal overflow.
* The text-size panel is anchored to its trigger's **right** edge. Left-anchored
  it opened past the right edge of a 390 px screen, leaving "A+" unreachable
  while the document itself reported no overflow — the QA sweep now measures
  the opened panel's box against the viewport at every width.

---

## 10. Second pass: one grid, and a tool rail

The redesign in §8 left one structural defect that no individual component owned.

**The page ran two grids stacked on each other.** The masthead — authors,
affiliations, citation line, DOI, the whole action row — spanned the full
1200 px container; a full-width hairline closed it; and only then did the body
drop to a 760 px column with a 220 px rail. Three things followed. The grid
visibly changed halfway down the page. The rail began level with the
*abstract*, so the entire top-right of the first screen was empty. And the
record's identity arrived as three loose lines — a citation line, a
date-and-rights line, a DOI line — at three sizes with three alignments,
reading as unrelated sentences rather than as one block of facts.

| Was | Is |
|---|---|
| Masthead full-width, body in a column, rail starting at the abstract | One grid from the breadcrumb down: an 820 px article column and a 248 px rail that **starts at the masthead** (measured: rail top 218 px = masthead top 218 px at both 1280 and 1440) |
| Rail held "On this page" plus Cite / PDF hanging off the bottom | Rail opens with **Tools** — Download PDF, Cite, Save, Add to list, Share — then "On this page", then Back to top |
| Utilities also inline under the primary buttons at every width | Inline **below `lg` only**; each utility is drawn exactly once at every width, which is now a test |
| "Cite this: …" / "Published … OPEN ACCESS" / "DOI … Copy" as three lines | One `<dl>`: **Cite this / Published / Issue date / DOI / Access**, label→value, each row drawn only when its value exists |
| Journal + issue repeated as breadcrumbs AND in the masthead block | Visible trail stops at "Journals"; the masthead names both, as links, with the year. The full path stays in the accessible trail and in the BreadcrumbList |
| Language switch: a filled brand chip, loudest thing above the abstract | A recessed track with the chosen side raised — colour is never the only channel |
| Section headings 21/23 px against 17–18 px body | 22/26 px, so ten sections stop reading as one column |

### Two defects found by measuring rather than looking

* **The DOI link was a 21.8 px pointer target.** Moving "DOI" into its own
  `<dt>` took the link out of a sentence, so WCAG 2.2's inline exception
  stopped applying and axe's `target-size` failed on Mobile Chrome. `py-1` on
  the anchor: 192 × 21.8 → 192 × 30. The rule it broke had been passing for a
  reason that no longer held — worth knowing before moving any other inline
  link into a definition list.
* **A 44 px layout shift about a second after load, on every page of the
  site.** `AnnouncementBanner` returns `null` until it has hydrated and read
  its dismissal list, then appears; the document drops by its height. Measured
  here: masthead top 174 px → 218 px between 600 ms and 1200 ms. A control
  pressed inside that window takes its `pointerdown` and its `mouseup` on two
  different elements, so **no click is produced at all** — which is why two
  rail tests failed on interactions that work perfectly for a person. The
  suite's `settle()` now waits out the shift (stillness alone is not enough:
  the page is perfectly still *before* the banner mounts, so a short window
  resolves on the wrong calm). **The shift itself is pre-existing, site-wide
  and still open** — see §11.

### Verified

* Rendered head + JSON-LD over 6 URLs (both locales, four access states):
  **identical** to the pre-redesign baseline. Trimming the visible breadcrumb
  changed no BreadcrumbList node.
* `e2e/journal-article.spec.ts` + `e2e/journals.spec.ts`: **74 passed, 0
  failed** across chromium and Mobile Chrome.
* Axe (wcag2a/2aa/21a/21aa/22aa) clean on the desktop layout in both locales,
  with the reader dialog open in both, with the text-size disclosure open,
  after switching abstract language, and with a biography expanded.
* Every access state drawn: downloadable, read-online-only, third-party
  rights, and no-file (which correctly offers no PDF in the rail either).

## 11. Open, not fixed

**`AnnouncementBanner`'s 44 px shift** (§10). The fix is the pattern
`THEME_INIT_SCRIPT` already uses for the theme: render the banner server-side
and hide dismissed ids with a pre-paint inline script, which removes the shift
*and* the flash-of-dismissed-banner the current comment is defending against.
It is shared chrome on every public page, so it is its own task rather than a
rider on an article-page redesign.
