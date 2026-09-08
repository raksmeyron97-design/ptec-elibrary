# Reader 2 — position, bookmarks, notes, collections

What a reader creates while reading, where it lives, and why each piece lives
there. Reading *performance* is a separate subject with its own documents
(`READER-PRODUCTION-AUDIT-2.md`, `READER-CACHING-STRATEGY.md`); this one is
about the state a student would be upset to lose.

The rule the whole document turns on: **a reader's work belongs to the reader,
not to the browser they happened to use.** PTEC students read on a lab PC and
continue on a phone. Every design decision below follows from that sentence.

---

## 1. Where each piece of reader state lives

| What | Store | Survives a new browser? | Why |
|---|---|---|---|
| Exact page | `reading_progress.last_page` (0141) **+** `localStorage` | yes | See §2 |
| Progress % | `reading_progress.progress_pct` | yes | Pre-existing; drives dashboards |
| High-water % | `reading_progress.max_progress_pct` | yes | Only ever rises |
| Bookmarks | `reader_bookmarks` (0141) **+** `localStorage` | yes | See §3 |
| Highlights + notes | `book_annotations` (0047) | yes | Server-only; needs a selection |
| Saved sources | `reading_list_items` (0136) | yes | Polymorphic across all 3 types |
| Theme, zoom, fit, rotation | `localStorage` only | no, deliberately | A device preference, not work |
| Downloaded PDFs | Cache Storage | no | Bytes belong to the device |

The last two rows are the boundary. A zoom level is a property of the screen
you are looking at; a bookmark is a property of the thinking you did. Only the
second kind is worth a table.

---

## 2. Reading position

### Two stores, different precision

* **The device** (`localStorage`, `ebook:pos:<bookId>`) holds the exact page,
  the percentage it was, when it was written (`t`), and the percentage this
  device last successfully sent to the server (`s`).
* **The server** (`reading_progress`) holds the percentage, the exact page
  (`last_page`), the page count that page was measured against
  (`last_page_count`), and `last_read_at`.

Before 0141 the server held only the percentage, so *continuing on a second
device meant re-deriving the page from a rounded percent.* One percentage point
is five pages of a 500-page book: a student who stopped at page 237 on the lab
PC opened their phone at page 235, mid-paragraph, in text they had not read.
The reader had always computed the page it was on. It simply had nowhere to put
it.

### `last_page_count` is not redundant

A page number only means something against the document it was measured in, and
the file behind a book can be replaced. Without the denominator, page 240 of a
document that is now 12 pages long clamps to page 12 — the *end* of the book,
presented as where you left off. `serverResumePage()` re-derives proportionally
instead (page 6 of 12), and where no denominator was stored it uses the
percentage written alongside as a cross-check: the two server values are
written together, must agree, and the percentage wins when they do not.

### Who wins

`resolveResumePage()` decides between the two positions on **recency**, not on
precision — that logic predates this work and is unchanged. `serverResumePage()`
only makes the server's answer *precise* when the server wins.

```
?page=N in the URL        →  always wins. A destination, not a resume.
local record is newer     →  exact local page
server holds what we sent →  exact local page  (clock-free branch)
percentages agree ±2      →  exact local page
otherwise                 →  server: last_page, else pageFromPercent()
```

Every new input is optional and every branch has a fallback, so a row written
before 0141 resumes exactly as it did.

### Transports

Unchanged in number, extended in payload — the page always travels *with* the
percentage, never on its own schedule, because they describe one position and a
transport carrying one without the other would let them disagree in the
database.

* debounced autosave → `saveReadingProgress` Server Action
* teardown flush → `POST /api/reader/progress` with `keepalive: true`

Both end in `upsertReadingProgress()`, so the high-water rule and the page rule
are each defined once.

### Degradation

Every read and write of the new columns is retried without them on a database
that lacks them (`42703` / `PGRST204`). This is load-bearing in two places:

* the **write** — losing the percentage to gain a page is a net loss;
* the **dashboard's select** — that one query also carries the embedded book
  rows the whole "My library" section is built from, so failing it for an
  unknown column would trade the section for the page.

---

## 3. `?page=N`

The read route accepts it, survives the sign-in redirect with it, and the
viewer treats it as a **destination**: it outranks both saved positions and
suppresses the "Welcome back" prompt, because someone following a link to page
42 is not returning to anything.

The reader keeps it current with a debounced `history.replaceState`
(`useReaderPageUrl`). Three reasons for that API and not the router:

* no RSC round-trip per page turn;
* `replaceState`, so a 300-page book does not leave 300 history entries between
  the reader and the Back button;
* debounced, so scrolling a chapter writes one URL rather than forty.

Only `layout="fill"` (the dedicated reader route) writes it. The embedded
preview on the book detail page does not own that URL, and putting a scroll
position into a document's canonical address would be wrong.

---

## 4. Bookmarks

**Local-first, account-durable.** The ordering is design, not optimisation:

* a bookmark is a one-tap action taken mid-sentence, so it must land in the
  same frame;
* the offline reader has no server to reach, but must still let someone mark a
  page in a book they downloaded.

So `localStorage` stays the working set and the write path, and the server is
layered underneath:

1. **First sync** pushes this device's pages up and takes the merged set back.
   This is what carries an existing reader's bookmarks into their account —
   without asking them to do anything, and without telling them it happened.
   Existing rows keep their labels (`ignoreDuplicates`), so a device that never
   knew about a label cannot null it.
2. **Every toggle** updates local state first and reports to the server after.
3. **A rejected write rolls local state back** — a bookmark that shows in the
   panel and does not exist in the account is the failure this table exists to
   remove. The offline reader is the exception: there, local *is* the truth.
4. **A failed sync changes nothing.** The device's bookmarks stay visible; they
   are not lost, merely not yet uploaded, and the next open retries.

Labels are server-only. Naming a page is a considered act rather than a one-tap
one, and a label typed offline has nowhere to go — so the rename control is
**omitted** rather than disabled when it cannot work. The displayed name falls
back to the nearest outline heading, then the page number.

---

## 5. Mutations must report what they changed

> PostgREST does not treat a statement matching no rows as an error.

A delete or update scoped `.eq("user_id", user.id)` against someone else's id —
or a row a second tab already removed — **succeeds, having changed nothing**.
So `{ success: !error }` reports "done" for a request that did nothing, and the
client updates its own state to match a database that never moved.

This was never a cross-user *write*: the scoping was always correct, and RLS
backs the paths that do not use the service client. It was a cross-user **lie**,
which is harder to notice, because the screen agrees with you until you reload.

Five mutations had it: `deleteAnnotation`, `updateAnnotationNote`,
`removeItemFromList` (which discarded its result outright), `updateReadingList`
and `deleteReadingList`.

**The rule now:** every mutation asks for its affected rows back and answers on
the count. Delete and update then answer *differently* on zero rows:

| | zero rows | why |
|---|---|---|
| delete | success, `removed: false` | The caller wanted the row gone. It is gone. |
| update | **failure** | What they typed is stored nowhere. Saying otherwise loses it. |

`lib/reader/mutation-truthfulness.test.ts` enforces the shape. It is a source
scan because the defect is invisible to the alternatives: a mocked client
returns whatever it was told to, and `{ success: boolean }` is a perfectly good
type for a wrong answer. What *is* detectable is that a mutation which never
asks for its affected rows cannot know whether it changed any. It checks per
function (a filter built in stages puts the `.select()` on another line) and
strips comments first — these files document the anti-pattern they avoid, and a
scan reading prose as code would fail on the explanation of its own rule.

---

## 6. Deletion

`reader_bookmarks` and `reading_list_items` are polymorphic with **no foreign
key**, because the target is one of three tables. Cleanup is therefore the
application's job, guarded by `lib/indexing/cleanup.test.ts` — a polymorphic
orphan has no parent to be noticed from, so scanning the delete sites is the
only thing that can catch an omission.

`book_annotations` is deliberately absent from that list: it has a real
`book_id references books(id) on delete cascade`, so the database clears it, and
asserting a redundant delete would make the file lie about where the guarantee
comes from.

**Unpublishing is not deleting.** `hydrateItems()` keeps a saved item whose
resource is merely hidden, so it returns when the resource does. Only a hard
delete clears reader state.

---

## 7. Collections

`reading_list_items` (0136) holds books, theses and publications side by side,
because that is what one research topic actually looks like. Items carry an
optional page and note, so "p. 42: contradicts chapter 3" is a first-class
thing to save.

**Duplicate saves are a no-op, not an error.** Two partial unique indexes make
a resource appear once per list as a plain save and once more per annotated
page (Postgres treats NULLs as distinct, so the "saved, no page" case needs its
own index). The client treats `already_in_list` as success and ticks the box: a
reader who saves something twice wanted it saved, and it is.

Membership is read on **every** menu open, not passed once as a prop. The book
detail page resolves it server-side as an optimisation; every other mount
passed nothing, so the menu opened with every collection unticked regardless of
what was in them — and clicking an already-saved one hit the unique index, came
back `already_in_list`, and was dropped silently. No tick, no message, a
control that read as broken while it was correctly refusing a duplicate and
failing to say so.

---

## 8. Benchmarking

```bash
npm run reader:benchmark                    # run the spec, then report
npm run reader:benchmark -- --report-only   # report the last run
npm run reader:benchmark -- --save <name>   # commit this run as a baseline
```

It is a **reporter** over `e2e/reader-performance.spec.ts`, not a second
measurement harness. That spec drives real pdf.js against a real range-serving
HTTP server over multi-megabyte documents and is the authority CLAUDE.md names
for any byte or memory claim; instrumenting the same things again would produce
a second set of numbers free to disagree with the ones the project gates on.

What it adds is the part the spec does not do — the spec asserts bounds but
writes its measurements out without ranking or comparing them, so a change can
pass every assertion while quietly doubling first paint. This lays the metrics
out in one table and diffs each against `docs/reader-performance/`.

* **±15% on wall-clock, ±10% on bytes and memory.** Reader timings on a laptop
  move by more than a build does; byte counts barely move at all.
* **A missing report exits 0**, with an explanation. A machine without the
  fixtures should say it has no numbers, not fail a build with numbers it does
  not have.

---

## 9. What this deliberately did not do

* **In-book search still runs client-side** over pdf.js text content, not over
  the `book_pages` index. It works offline, produces exact character spans for
  highlighting, needs no round-trip, and caches each page's text for the life
  of the document. The indexed table is the right source for *cross-book*
  search (`/api/search/native`) and remains so.
* **Offline annotation and offline bookmark *labels* are not supported.** The
  reader does not queue writes for later. Bookmarks work offline because they
  were already local; notes and labels honestly do not, and the controls are
  omitted rather than offered and then dropped.
* **`reading_list_books` is still in place**, backfilled from and no longer
  written to. Retiring it is a later migration's job.
