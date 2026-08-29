# Author profiles & publication access control

Two features that landed together in migration `0125`, because they share a
theme: a fact about a record should live in the record, and be enforced where
it is read — not asserted by the UI that happens to display it.

- **Author profiles** turn a name attached to a publication into a reusable
  academic identity with its own page, `/authors/<slug>`.
- **Download permission** turns "we hide the download button" into "the server
  refuses the bytes".

---

## 1. Author profiles

### The table

There are two author tables and they are **not** being merged. `0052` says why:

| Table | Holds | Shape |
|---|---|---|
| `publication_authors` | People credited on **publications** | The academic profile |
| `authors` | People credited on **e-books** | `id, name, bio, photo_url` + `slug` |

`0125` gives `publication_authors` the profile columns (`slug`,
`position_title`, `affiliation_name`, `website_url`, `google_scholar_url`,
`research_gate_url`, `research_interests`, `is_published`, `updated_at`) and
gives `authors` **only** `slug`.

That asymmetry is deliberate. Copying nine columns into a second author table
is the "duplicate author record" problem wearing a schema. The academic profile
has one home; `/authors/[slug]` joins a book author to it by slug when the same
person exists in both.

### Slugs

`publication_authors.slug` and `authors.slug` are backfilled by `0125` using
`[^[:alnum:]]` as a stand-in for JavaScript's `\p{L}\p{M}\p{N}`. The two
character classes agree on everything the library holds, but they are not the
same specification, so:

- the SQL backfill is **best-effort**;
- `scripts/backfill-author-slugs.ts` re-derives every slug with the real
  `slugify()` and is the authority — run it once after `0125` applies
  (`npx tsx scripts/backfill-author-slugs.ts` reports; `--apply` writes);
- `getAuthorProfile()` falls back to name matching when a slug lookup misses,
  so a divergence degrades to "slower but correct", never to a 404.

That fallback is what keeps pre-existing URLs like
`/authors/javier-garc%C3%ADa-mart%C3%ADnez` resolving.

### `is_published` hides the profile, not the person

`is_published = false` withholds the biography, photo, position, affiliation
and external links. The name and the works list still render, and the author
still appears in every byline they earned. An authorship is a fact of the
record; a profile is a page about a person, and only the page is optional.

### What `/authors/[slug]` fetches, and what it used to

The previous resolver scanned up to 1,000 rows from each author table on every
request and ran `slugify()` over both in JavaScript, then found the person's
work with `ilike '%<name>%'` against every author-name string in the library —
**including publications, which have had a foreign key since `0052`**. An author
named "Sok" collected every work by "Sok Dara", "Sok Nara" and "Sok Pisey".

`lib/authors/profile.ts` now:

| Resource | How it is matched |
|---|---|
| Publications | `publication_authorships.author_id` (the FK) |
| E-books | `books.author_id` |
| Theses | `ilike` on `research_reports.author_names`, then re-checked with `parseAuthorNames()` |
| Physical catalog | `ilike` on `catalog_books.author`, then re-checked the same way |

Theses and catalog records genuinely store free text, so the database can only
narrow — `isNamedIn()` decides, comparing whole casefolded names. That is what
stops a substring match becoming a claimed work.

### Statistics

`lib/authors/stats.ts` derives only what the library can observe: how many
works it holds, the span they cover, how many kinds they are. There is no
citation count and no h-index. A repository that publishes a number it cannot
source is a repository whose other numbers stop being believed.

The span collapses to a single year rather than reading "2026–2026", and the
type count is hidden at 1.

### External links

`lib/authors/links.ts` publishes a link **only** when it is a well-formed
`http(s)` URL (ORCID goes through `normalizeOrcid`/`orcidUrl` instead, since the
field stores an identifier). A librarian who types "see my website" gets nothing
rendered rather than a link to `https://library.ptec.edu.kh/see my website`, and
a `javascript:` URL pasted into an admin field cannot become stored XSS on a
public page. The same validation runs server-side in `upsertPublicationAuthor`.

`sameAs` in the `Person` structured data is built from the validated list, so a
malformed identifier never becomes a machine-readable assertion.

### Admin

`/admin/publications/authors` — search, filters (incomplete / possible
duplicates / hidden), publication counts, profile completeness, and **merge**.

**Delete refuses when the author is credited on anything.**
`publication_authorships` cascades on delete, so removing the row would strip
the person from every byline they hold while reporting only "author deleted".
`mergePublicationAuthors()` moves the credits first, skipping any publication
where the target is already credited (the PK is
`(publication_id, author_id)`), and deletes the source last — an interrupted
merge leaves credits intact rather than orphaned.

Duplicate detection (`duplicateKey`) casefolds and strips punctuation but
**keeps diacritics**: "Muller" and "Müller" stay distinct. A merge is
destructive, so the rule is to under-report.

---

## 2. Download permission

### Two gates, and they answer different questions

| Column | Question | Set by |
|---|---|---|
| `publications.allow_download` (`0125`) | **Library policy** — do we choose to hand out the file? | A librarian, in the publication editor |
| `publications.fulltext_redistributable` (`0092`) + licence heuristic | **Rights** — are we allowed to? | Copyright, plus an admin override |

Both must say yes. They are deliberately not collapsed into one column: the
reasons differ, the people who set them differ, and the sentence a reader
should see differs.

Neither refusal touches online reading. A read-online-only record and a
citation-only record are both still readable in the viewer — that is the whole
point of distinguishing them from a record with no file.

### One resolution, three readers

`lib/publications/access.ts` → `resolveDownloadAccess()` is pure and
browser-safe, and is called by:

1. `/api/publications/[slug]/file` — **the enforcement point.** It decides
   whether the bytes leave the server.
2. `app/[locale]/(public)/publications/[slug]/page.tsx` — decides whether a
   Download button is drawn, and which notice replaces it.
3. `/api/search/native` — decides whether a search result carries a download
   action at all, so a result never links straight at a 403.

Because all three ask the same function, the page cannot advertise a download
the server will refuse, and a hidden button is never the only thing standing
between a visitor and a file.

The rights half delegates to `isFreelyAccessible()` — the same predicate the SEO
builder uses to claim `isAccessibleForFree`. `lib/publications/access.test.ts`
asserts the two agree across a matrix of publisher/licence combinations, so a
record can never advertise itself as open access in structured data while
refusing the file.

### Reader-facing states

| Reason | What the reader sees |
|---|---|
| `no-file` | "No file attached" — bibliographic record only |
| `policy` | "Download unavailable" + the librarian's own message, or the standard read-online-only line |
| `rights` | "Download unavailable" + third-party copyright, follow the DOI |

Never colour-only: each state carries its own icon and its own words.
`ActionButtons` promotes "Read online" to the primary button when there is no
download beside it (`emphasizePreview`).

### Pre-migration safety

`allow_download` defaults to `true`, and every reader treats an **absent**
column as allowed — which is exactly how every existing record already behaved.
`resolveDownloadAccess` accepts `undefined`/`null` for that field on purpose,
and `access.test.ts` pins it.

`save_publication_atomic` is replaced in `0125` with the two columns added, and
both are written defensively: an INSERT from a client that omits the key takes
the column default, and an UPDATE keeps whatever the librarian already set
rather than resetting it. That matters because the recovery-draft restore path
replays a payload captured by an older build of the form.

---

## 3. Figures (`publication_figures`)

A normalized table, not a JSON blob: figures are queried, reordered and
individually replaced.

`caption` and `alt_text` are stored **separately** and the admin form asks for
both, because they do different jobs — the caption is the printed "Figure 1. …"
line, the alt text is what a screen reader announces instead of the image. When
no alt text is supplied the image is marked decorative (`alt=""`) and the
caption carries the meaning; `alt={caption}` would make every screen-reader user
hear it twice.

**Figures are deliberately not embedded in `PUBLICATION_DETAIL_SELECT.`** They
feed one section of one page, and an embed that fails would take the whole
article record down with it. `getPublicationFigures()` is its own query,
concurrent with the rest, and returns `[]` on any error.

**They also save through their own action.** The publication editor writes
everything else through `savePublicationWorkspace`, which carries
optimistic-concurrency tokens, a debounced recovery draft and a publish gate.
A figure caption edit has no business re-entering that path, so `FiguresEditor`
owns its own Save and says so in its status line.

The lightbox is a native `<dialog>` opened with `showModal()` — the browser
supplies the focus trap, the inert backdrop and Escape-to-close, none of which a
hand-rolled modal would get right three times over.

---

## Files

| Area | Path |
|---|---|
| Migration | `supabase/migrations/0125_author_profiles_and_access.sql` |
| Slug reconciliation | `scripts/backfill-author-slugs.ts` |
| Access policy (pure) | `lib/publications/access.ts` + `.test.ts` |
| Author domain (pure) | `lib/authors/{types,stats,links,admin}.ts`, `lib/authors/authors.test.ts` |
| Author fetch (server) | `lib/authors/profile.ts` |
| Author actions | `app/actions/authors.ts`, `upsertPublicationAuthor` in `app/actions/publications.ts` |
| Public page | `app/[locale]/(public)/authors/[slug]/`, `components/ui/authors/*` |
| Publication page | `components/ui/publications/{PublicationAccessNotice,PublicationFigures}.tsx` |
| Admin | `app/(admin)/admin/(protected)/publications/authors/*`, `_components/FiguresEditor.tsx` |
| Shared switch | `components/admin/kit/form/Switch.tsx` |
