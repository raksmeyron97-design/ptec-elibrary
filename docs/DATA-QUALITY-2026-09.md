# Contributor data quality — September 2026

What a contributor string in this library actually is, what production was
publishing because of it, and what changed.

Companion documents: `docs/SEO-3.2-CONTRIBUTOR-GRAPH.md` (the canonical read
policy), `docs/CANONICAL-RESOURCES.md` (the tables), `docs/BOOK-INGESTION.md`
(where a byline enters).

---

## 1. The problem

`books.author` is free text. Nothing in the ingestion path has ever required it
to be a byline, and for a large part of this collection it is not one: it is
whatever the PDF's `Author` metadata field happened to hold when the file was
produced. That is, routinely:

* the operating-system account of the person who scanned the book,
* the name of the program that wrote the file,
* a placeholder in a form nobody filled in,
* a contact detail typed into the wrong box.

Every one of those strings became an `authors` row. Every `authors` row with at
least one published work became an entry in `/authors`, a URL in `sitemap.xml`,
and a page publishing a `ProfilePage` whose `mainEntity` is a `Person` with a
stable `@id`.

The library was telling search engines that people exist who do not.

## 2. Evidence

`[PRODUCTION]` Measured against `https://library.ptec.edu.kh` on 2026-09-19 by
reading the public `/authors` hub and fetching each page over HTTP. The roster
held **318 names**. Ten of them do not identify anybody, and every one answered
HTTP 200 with `<meta name="robots" content="index, follow">`:

| URL | Name | Works | What it actually is |
|---|---|---:|---|
| `/authors/channa-0977-33-61-62` | `Channa 0977 33 61 62` | **621** | A given name and a Cambodian mobile number |
| `/authors/windows-user` | `Windows User` | 7 | The Microsoft Word default document author |
| `/authors/user` | `user` | 4 | An operating-system account |
| `/authors/administrator` | `Administrator` | 1 | An operating-system account |
| `/authors/pc` | `PC` | 1 | A device |
| `/authors/lenovo` | `LENOVO` | 1 | A device manufacturer |
| `/authors/pptxgenjs` | `PptxGenJS` | 1 | A JavaScript library that writes .pptx files |
| `/authors/name` | `Name:` | 1 | A form label |
| `/authors/teste` | `Teste` | 1 | A test |
| `/authors/ទំព័រ` | `ទំព័រ` | 1 | The Khmer word for "page" |

The first row is the one that matters. `Channa 0977 33 61 62` is the
**single most-published `Person` in the library** — 621 of 1,916 published
books, 32% of the collection, asserted to every crawler as the work of one
human being whose name contains a phone number. Verbatim from that page:

```json
{"@context":"https://schema.org","@type":"ProfilePage",
 "url":"https://library.ptec.edu.kh/authors/channa-0977-33-61-62",
 "mainEntity":{"@type":"Person","name":"Channa 0977 33 61 62",
               "@id":"https://library.ptec.edu.kh/authors/channa-0977-33-61-62#person"}}
```

This is the defect `CLAUDE.md` already forbids in words — "Never create fake
Person entities" — with no code anywhere able to enforce it, because every
existing check asks what KIND of entity a byline names and none asks whether it
names one at all.

## 3. What changed

### 3.1 One pure module answers one question

`lib/resources/contributor-trust.ts` — `assessContributorName(name)` returns
`valid`, `suspicious` or `invalid`, with a stable reason id.

`lib/resources/contributor-identity.ts` asks it **before every other question**,
of the whole byline and of each part after a split. That placement is the whole
integration: the contract already documents an empty `contributors` array as a
real answer that callers must honour by omitting the claim, so every existing
consumer became correct with no edit —

| Consumer | Behaviour with an unidentified byline |
|---|---|
| `lib/seo/contributor.ts` → book / thesis / publication JSON-LD | no `author` property |
| `/authors/[slug]` `mainEntity` | absent |
| `lib/resources/contributor-view.ts` | the canonical row is dropped from the public read |
| `lib/resources/contributor-write.ts` | no canonical contributor row is created at ingestion |

`NormalizedByline.unidentified` distinguishes "names nobody" from "names several
people, inseparably". Both produce no contributors; they need different
handling, because a composite URL should keep linking to the people it names and
an unidentified one should not be advertised at all.

### 3.2 Three consumers state the rule explicitly

* `getListedAuthors()` filters on `workCount > 0 && identified`. This one
  function backs `/authors`, the sitemap, and the AI assistant's author
  vocabulary, so none of them can disagree.
* `app/sitemap.ts` drops the name **without consulting the roster**. Its
  documented behaviour when the roster read fails is to emit UNFILTERED rather
  than drop every author URL — right for the works rule, which needs a
  database; wrong for this one, which needs nothing.
* `/authors/[slug]` sends `noindex, follow`. Leaving a sitemap stops
  *recommending* a URL; only `noindex` withdraws one already in the index.

### 3.3 A read-only repair queue

`/admin/data-quality` gains a panel (`lib/admin/contributor-trust-report.ts`,
pure) ranking findings by the **works that ride on them**, not by row count —
ten junk rows with one book each matter less than one with 621. It opens no
write path, and `lib/admin/contributor-trust-report.test.ts` fails if one
appears.

## 4. What deliberately did NOT change

* **Nothing is deleted.** The `authors` rows stand, and the books keep the
  byline they were catalogued with — that string is a true fact about the file.
* **The pages still answer 200.** Unadvertised, not removed: a librarian
  repairing the record needs to be able to open it.
* **The visible byline on a book page is untouched.** What stops is the
  machine-readable claim, not the catalogue record.
* **No re-attribution.** The 621 books credited to a phone number have a real
  author or a real corporate producer and nothing in this codebase knows which.
  Merging, retiring or re-attributing stays deliberate, audited, human work.

## 5. Why the rules are narrow, and must stay narrow

The two errors do not cost the same, and not in the direction that first
suggests itself.

> Being wrong by calling a real author invalid silently deletes a scholar from
> the entity layer, and nothing in the app can tell that from a library that
> never held their work. Being wrong by calling junk valid leaves one more bad
> URL in a sitemap that already has hundreds of good ones.

So `invalid` is only ever one of two shapes:

1. an **exact whole-string** match against a closed vocabulary — OS account
   defaults, software product names, form placeholders. Exact, because `User`
   is junk and `Users, A. B.` is a catalogued name.
2. a **structural impossibility** — six or more digits, an email address, a
   URL, a file extension, a twelve-character hex token, or no letters at all.

Anything that merely looks odd is `suspicious`, which is advisory and changes
nothing: `IJERE` is a real journal, and `KPC` and `ITPSO` may well be real
Cambodian institutions. A rule that caught them would catch the next real one.

`[LOCAL]` The resulting split over the production roster: **10 invalid, 3
suspicious (`Computer Teacher`, `sokhavuth`, `indavy`), 305 valid.** The second
half of `lib/resources/contributor-trust.test.ts` pins the 305 — every acronym,
every single-token Cambodian given name, every Khmer ministry,
`William Mendenhall III` — because that is the half a future vocabulary entry
can quietly break.

## 6. Reproducing it

```bash
# The classifier and its conservatism
npx vitest run lib/resources/contributor-trust.test.ts lib/admin/contributor-trust-report.test.ts

# What production publishes, per entity shape. The two `names nobody`
# fixtures FAIL until this change is deployed — that is the point of them.
npx tsx scripts/verify-production-entities.ts --base https://library.ptec.edu.kh

# The full historical contributor audit (read-only, changes nothing)
npx tsx scripts/audit-contributors.ts
```

## 7. Status

| | |
|---|---|
| Implemented | `[LOCAL]` + `[CI]` — unit tests and the full suite pass |
| Verified in production | **Not yet.** Requires a deploy. |
| How it will be verified | `scripts/verify-production-entities.ts` turns green on the two new fixtures; `/authors` drops from 318 to 308 listed names; `sitemap.xml` loses 10 author URLs |
| Unknown | Whether any of the 10 rows has a recoverable true author. Nothing here attempts to find out. |
| Deferred | Merging or retiring the rows; re-attributing the 621 books. Both are cataloguing decisions with URL consequences. |
