# Catalog review — the Physical Library's librarian review

`/admin/catalogs/review` is where librarians check each Physical Library record
against the book in hand. It is behind `CATALOG_REVIEW` (server-only; off in
production unless `on`). This document covers Slice 1: the language queues, the
review state, and Save & next. Later slices (tasks, provenance, copy locations,
ISBN status, duplicates, Khmer fallbacks) build on the same state.

## Why it exists

All 2,639 production records (2026-10-05) came from PMB through Koha. The PMB
export carried no ISBN, publisher or year, so almost every record is thin in
the same ways — and until now nothing recorded which records a person had
actually checked. `is_active` is public visibility, and stays that.

## Two queues, one engine

| Queue | Rule | Koha item type | Production, 2026-10-05 |
|---|---|---|---|
| Khmer books | `language = 'km'` | `BK` | 1,290 |
| English & other languages | `language` is `en`, `fr`, `zh` or `other` | `BKEN` | 1,349 |
| — (counted apart) | no language, or a value that is not a catalogue code | — | 0 |

The rule is `reviewQueueOf()` in `lib/catalogs/review.ts`, pinned against
`kohaItemTypeFor()` for every catalogue language. The language is the record's
stored value, never a guess from the title. A value such as `"Khmer"` is not a
code, so it is in **neither** queue and counted as unrecognised rather than
guessed (by the BK/BKEN rule alone it would land in the English queue).

The queue is part of every query: the list, the counts, previous/next. The URL
carries the whole context — `?language=km|en&status=…&assignee=…&sort=shelf` —
so refresh, bookmarks and back/forward land on the same record in the same
queue. Previous/next are computed over the queue's one ordered list relative to
the current record's place in it, so a record that just left the filter (it was
verified) still has a next, and no navigation can step into the other language.

Order is shelf order: call number (`catalog_books.ddc`, which for a Koha record
is the best copy's call number), digit runs compared as numbers, records without
one last, the record id breaking every tie.

## Review state — `catalog_review_state` (0169)

A table of its own because `catalog_books` is anon-readable (`USING (true)`,
0117): a status or assignee column there would be public. Service role only, RLS
on, revoked from `public`/`anon`/`authenticated`. Never written to Koha.

**No row = needs review.** The migration writes no row, so turning the feature
on is not a production write and turning it off leaves nothing a reader sees.

| Stored `status` | Meaning |
|---|---|
| `needs_review` | (or no row) waiting for a librarian |
| `in_review` | taken by `assigned_to` at `claimed_at` |
| `verified` | checked by `reviewed_by` at `reviewed_at`; `verified_fingerprint` is the sha256 of the bibliographic fields as stored |
| `blocked` | cannot be finished: `blocked_reason` (`book_not_found`, `needs_koha`, `needs_decision`, `other` + note) |

One step: the librarian who checks the book verifies it. There is no
READY_TO_VERIFY state (PTEC decision 2026-10-05).

Derived, never stored:

- **stale claim** — `claimed_at` older than 4 hours (`CLAIM_LEASE_MS`): anyone may take it;
- **changed since verified** — the live row's fingerprint no longer matches (e.g. edited in Koha);
- **imported** — a provenance fact about every current record, not a state.

`waived_tasks` and `field_sources` exist for Slices 2 and 4 and are unused here.

## Tasks and waivers (Slice 2)

`lib/catalogs/review-tasks.ts` (pure) turns the SAVED record into tasks — "Needs 3
tasks", never a percentage. It is built on `assessCatalogRecordHealth()` (the
edit page's six checks keep their meaning) plus four:

| Task | Tier | Waivable | Done when |
|---|---|---|---|
| language | blocking | no | `language` is a catalogue code |
| subject | blocking | no | a category |
| call number | blocking | no | `ddc` (Koha's best copy call number) or the book-level shelf |
| copies | blocking | no | at least one copy that is not withdrawn |
| ISBN | info | "No ISBN printed" | an ISBN |
| publisher and year | info | "Not stated in the book" | both |
| description | info | "Nothing to describe" | one that says more than the record (`isDerivedDescription`) |
| cover | info | "No usable cover" | a cover of its own |
| shelf in Koha | info | no — set in Koha | every copy has a Koha location (copy-level; the book-level field is never counted) |
| possible duplicate | info | "Separate edition" | no other record shares the canonical ISBN, or the normalized title AND author |

**Verification waits on the blocking tasks**, recomputed on the server from the
row as stored at the moment of verifying — the editor saves first, so a subject
typed a moment ago counts. A record that cannot get there (no copies) is
blocked with a reason instead. Info tasks never block.

A waiver says "this does not apply to this book"; it is stored in
`waived_tasks`, changes no review status, is refused over someone else's fresh
claim, and is audited (`catalogReview.waive` / `.unwaive`). A task that is done
stays done whatever was waived.

Duplicates use the library's ONE grouping (`findDuplicateGroups`,
`lib/admin/duplicates.ts`, the digital collection's queue) across BOTH
languages: a record carries the task when its group is high (shared canonical
ISBN) or medium confidence (same normalized title, and every record agrees on
the author — compared case-insensitively, nothing looser — or on the year). A
title alone or a prefix is low: shown in the duplicates view, never a task.
The workspace links to the other records; nothing merges.

The queue gains `task=<id>` (records where that task is OPEN — waived does not
count) and `sort=urgent` (open blocking tasks first, then open tasks, then shelf
order). Previous/next use the same comparator as the list.

## The catalogue list and bulk (Slice 3)

`/admin/catalogs`:

- **Call number**, not "DDC": for a Koha record `catalog_books.ddc` holds the
  best copy's call number (`510 BRO`, `ប.ល គីម`).
- **Location** comes from the copies (`lib/catalogs/copy-location.ts`): library
  · Koha shelf × count, and "N copies with no shelf in Koha" — never the
  book-level `shelf_location`, which Koha does not sync and which is empty on
  every production record. Withdrawn copies are left out.
- With the switch on, a **Review** column (status + "Needs N tasks", linking into
  the record's queue) and an **Open tasks by queue** table whose every count
  links to that queue filtered to that task. Both come from the page's existing
  collection scan, extended with the task fields — no second read.

Review list:

- Select rows, then **Take selected** or **Give back selected**. One request per
  page (≤ 50), each record through the same guarded, compare-and-set, audited
  transition as a single press. The request names its queue and the server
  refuses any record outside it (`other_language`). **No bulk verify** —
  verifying means checking the book in hand.
- **Export this list (CSV)**: the same parse, order and filter as the page,
  read-level (`catalog.review.view`), audited (`catalogReview.export`), UTF-8
  with BOM so Excel reads Khmer.

## Provenance (Slice 4)

The workspace says, per field, **where the current value came from, who
accepted it and when, and whether it changed since** (`lib/catalogs/provenance.ts`,
stored in `catalog_review_state.field_sources` as `{ source, by, at, hash, host? }`).

| Shown | Means |
|---|---|
| Open Library / Google Books · accepted by X, date | the saved value is exactly what that provider's cached answer gave |
| Publisher's page (host) / Crossref · accepted by X | THIS server fetched that text for that librarian (in-memory, 2 h) |
| Librarian · accepted by X | typed, or a fetched value the librarian then edited, or anything unproven |
| Koha (PMB import) · not checked yet | nothing recorded — the record's origin (a non-Koha record says "Entered in the e-Library") |
| … · changed since (was Open Library) | the value no longer matches what was recorded — edited here without a hint, or in Koha |
| … · verified | the record is verified and unchanged since |

Nothing is taken on the browser's word. The editor remembers which provider
filled which field and, **after a save succeeded**, sends hints for every field
whose saved value differs from the last saved one. `recordFieldSources` keeps a
provider credit only on evidence (the ISBN cache's answer for that ISBN equals
the saved value; for a cover, the provider offered an allow-listed cover and the
record now holds a stored one; for a publisher page, the fetch memory) and
otherwise credits the librarian. It writes `field_sources` only (compare-and-set)
and is audited (`catalogReview.provenance`). "Changed since" is derived from the
value hash on read — no trigger, no sync change.

## Fetch by ISBN as a preview (Slice 5)

The rules of `lib/isbn/enrich.ts` are unchanged (empty fields fillable,
different values only offered, nothing filled while the found title disagrees,
the cache, rate limits, the cover allow-list). The interaction changed:

- **Real status per step.** Two requests — `checkIsbnIdentity` (this catalogue,
  Koha) then `lookupIsbnProviders` (cache, then Open Library and Google Books in
  parallel) — so each line of "What each source answered" changes when that
  source actually answered. The two providers finish together, and the list
  says so. Each step is charged to the same per-user bucket, so a lookup costs
  two of the 60 per 10 minutes. Add by ISBN keeps its single call.
- **A preview, then Apply.** `lib/isbn/fetch-review.ts` arranges the answer as
  *Safe to apply* (empty fields, ticked), *Needs review* (fields that hold
  something else, unticked unless the current value only restates the record)
  and *No trusted data* (category, department, call number, shelf — never from
  a provider). Nothing reaches the form until Apply; nothing is saved until Save.
- **Editions are choices.** Candidates that name the work but give another
  publisher or year for the same ISBN are shown as cards ("exact ISBN match")
  and never merged; a candidate that states no edition joins every card.
- **Mismatch** ("This ISBN appears to belong to …") fills nothing. *It is this
  book* is a deliberate override that still goes through the preview.
- "Not found" only when every provider answered; one that failed makes the
  result *incomplete* or *partial*, said as such.

## Possible duplicates (Slice 6)

`/admin/catalogs/review/duplicates?language=km|en` lists the groups that touch
a queue (a group may cross languages; every member is shown with its own
queue). Strong groups (high/medium) by default; `signals=all` adds the weak
ones, labelled "weak signal — no task".

**Keep as separate editions** waives the duplicate task on each record of the
group, one guarded, compare-and-set, audited waiver per record — so it is
refused over another librarian's fresh claim. Nothing merges, nothing is
unlisted, no record is written. A group whose records are all kept apart
leaves the default view (`resolved=1` shows it); a record that joins the group
later starts with its own open task, so the group comes back. "Review later"
is leaving the group where it is; "open the existing record" is the record
link. Route `catalog.review.duplicates` (read); the action needs write.

## Transitions

`planReviewTransition()` (pure) decides; `app/(admin)/admin/(protected)/catalogs/review/actions.ts` applies.

| Action | From | To | Refused when |
|---|---|---|---|
| claim | needs review / in review (stale or mine) | in review (me) | someone else holds a fresh claim → `takeover` |
| takeover | in review (someone else) | in review (me) | — (confirmed in the UI, audited with `previousHolder`) |
| release | in review (mine) | needs review | not mine |
| verify | needs review / in review (not someone else's fresh claim) | verified | blocked, already verified |
| block | needs review / in review | blocked | unknown reason; `other` without a note |
| unblock | blocked | needs review | — |
| reopen | verified | needs review | — |

Every action: switch check → `requireAction("catalog.review.transition")`
(`catalog: write`) → read → plan → compare-and-set on `version` (or an insert
that collides on the primary key) → one `admin_audit_log` row
(`catalogReview.<action>`, metadata: from, to, queue, previousHolder, reason).
A press against an older page is refused as `stale` and nothing is written.
None of them writes `catalog_books`, `catalog_copies` or Koha.

## The workspace

`/admin/catalogs/review/[id]` embeds the ordinary record editor
(`EditBookWizard`, loaded by the shared `edit/[id]/load-record.ts`) with an
optional `review` prop. Saving is still `updateCatalogBook` — Koha first, the
three-way conflict check, sent once — unchanged.

| Button | Does |
|---|---|
| Previous / Skip | moves within the queue; writes nothing; asks first if there are unsaved edits |
| Save | saves the record; stays |
| Save & next | saves (if changed), gives the claim back if it was mine, moves on |
| Verify & next | saves (if changed), then verifies — fingerprinting the row as stored — then moves on |

The review step runs only after the save succeeded, and navigation only after
the review step succeeded. A Koha conflict, an ambiguous Koha answer, a refused
slug or a stale review version keeps the librarian on the record with the
reason shown. If the save succeeded and the review step was refused, the
message says the record IS saved.

While someone else holds a fresh claim, Save & next and Verify & next are off
and the bar says who; Take over asks first.

After moving on, focus goes to the new record's "Record N of M" heading (a
callback ref, because FormShell moves the context panel between inline and
sidebar after mount, replacing the node).

## Routes and access

| Route | Policy | Requires |
|---|---|---|
| `/admin/catalogs/review` | `catalog.review` | `catalog: read` |
| `/admin/catalogs/review/[id]` | `catalog.review.record` | `catalog: write` (it embeds the editor, like `catalog.edit`) |
| review actions | `catalog.review.transition` | `catalog: write` |

`/admin/catalogs` shows a card per queue (counts from its existing collection
scan plus the review rows) when the switch is on, and is unchanged when off.

## Scale

Each review page reads the catalogue's id/title/call number/language once
(three 1,000-row pages at PTEC's size) plus the review rows, and derives the
list, counts and neighbours from that one read. No query per record, no Koha
call. A failed or cut-short read is reported, never shown as a partial queue.

## Rollback

`CATALOG_REVIEW=off` (or unset in production): the routes 404, the overview
cards disappear, nothing else changes. The table keeps its rows and nobody reads
them. Removing the feature for good is a later migration that drops the table.

## Tests

- `lib/catalogs/review.test.ts` — queues vs BK/BKEN, URL round-trip, language-scoped filters, shelf order, previous/next, counts, transitions, fingerprint.
- `lib/catalogs/review-boundary.test.ts` — the migration is private/additive/empty; actions guard first, write only the review table, compare-and-set, audit; pages 404 when off; registry levels; the editor runs the review step only after a successful save.
- `e2e/catalog-review.spec.ts` — anonymous visitors are sent to the admin login (no authenticated-admin fixture exists in `e2e/`).
