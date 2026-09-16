# The verification workspace (`/admin/review`)

*Queue views: `lib/review/queues.ts`. Change reasons:
`lib/review/change-reasons.ts`. Engine: `app/actions/review.ts` +
`lib/content-status.ts` (unchanged).*

The review engine — the eleven-value status vocabulary, the transition table,
the self-approval rule, reviewer assignment, review notes, `content_versions`
— is migration 0086's and is **not** rewritten here. What changed is what a
reviewer can see and answer without leaving the page.

## Six tabs, two fetches

`getReviewQueues()` fetches exactly what it always did: the submitted backlog
and the "published but never verified" queue. Five of the six tabs are **views
over the first one**, computed by `selectPendingView()`:

| Tab | `?tab=` | Membership |
|---|---|---|
| All submitted | *(none)* | the whole pending queue — unchanged |
| My queue | `mine` | `assigned_reviewer = me` |
| Unassigned | `unassigned` | no reviewer **and** actionable |
| Needs changes | `changes` | `status = changes_requested` |
| Published without review | `unverified` | the second fetch |

"My queue" is a question asked of rows the page already has, never a second
query — two fetches could disagree about one record, and then a reviewer's
personal backlog and the shared one tell different stories.

**Unassigned is unclaimed WORK, not every unassigned row.** A record sitting at
`changes_requested` has no reviewer because its editor has it; listing it as
unclaimed is how "Unassigned" stops meaning anything. That is also why
`changes_requested` is absent from `ACTIONABLE_STATUSES` and therefore from the
sidebar's backlog badge.

`?tab=unverified` keeps its historical spelling — it is what the KPI tiles and
every existing bookmark point at, and renaming it would break links for no
reader-visible gain. `tab`, `status`, `page` and `size` all still live in the
URL; the client is remounted per view so an optimistic removal never outlives
the list it was made against.

## Provenance

A verification stamp is worth what the name on it is worth, so `verified_by` is
resolved alongside `created_by` and `assigned_reviewer` in the **same** profiles
lookup (adding a second query would be an N+1 on the queue where nearly every
row has one) and rendered on the card: *"Verified by Ron Raksmey on 16 Sep
2026"*. The assigned reviewer moved from inside Details onto the front of the
card, because "who is reviewing this?" is one of the questions the queue exists
to answer.

## The claim signal

`claimedByAnother()` is **derived, not stored**: `in_review` means a reviewer
pressed "Start review" and `assigned_reviewer` says who, so the pair is already
an honest claim. No lock table, no heartbeat, no migration — and the module is
pure, so it structurally cannot read one.

It is advisory. The answer is a banner and a "Take over" button, never a
refusal: a hard lock on a two-librarian team strands records behind whoever
forgot to release one. "Take over" is `claimReviewItem()`, which is
`assignReviewer(…, me)` — the same `*.review.assign` policy and the same
`content.assign_reviewer` audit row, because a takeover that bypassed the
assignment gate would be a second, weaker path to the same write.

## Structured "Request changes"

A free-text box records what one reviewer thought; it cannot answer "what do
records get sent back FOR?" across a term. So the reviewer picks from a
nine-entry vocabulary **and** writes the specifics, and neither is kept in a
new place:

- the human sentence goes in `books.review_note` (0086) — the column the editor
  already reads and every existing surface already renders. There is **no second
  rejection model**.
- the reason **ids** go in the metadata of the `content.changes_requested`
  audit row the transition already writes, which is where "who did what, when,
  why" already lives and is already queryable.

`composeChangeNote()` stores the canonical **English** labels, never the
reviewer's UI locale: the note outlives the session that wrote it and is read by
whoever opens the record, so freezing one reader's language into the data is the
bug. The checkboxes are translated; the stored string is not.

Either a reason or a sentence is enough (`hasChangeRationale`). Requiring both
makes "Other" unusable; requiring neither reintroduces the empty rejection that
`review_note` exists to prevent.

## Checklists are the existing quality report, not new checkboxes

The verification checklist is `evaluateQuality()`'s own output
(`lib/metadata-quality.ts`) — every tick corresponds to a field the database
actually holds. **No checkbox was added that persists a reviewer's claim to have
looked at something the system does not record**, because a UI tick that means
only "somebody clicked" is worse than no tick. The one human attestation in the
workflow remains `verified_at` / `verified_by`, which is exactly what it always
was.

## Working a backlog

The document is one click away and **inside the card** — a lazily-mounted
`<iframe>` over the authenticated proxy route (`/api/books/[id]/file`,
`/api/theses/[id]/file`), never the storage URL, which `zimaFetch()` serves
with no credentials. It is the browser's own viewer, not a second pdf.js
instance: the reviewer is checking that the file opens and matches the
metadata, which is what a plain viewer answers. Nothing is fetched until asked,
so a queue of ten cards costs no PDF bytes.

After a card leaves the queue, focus moves to the next card's heading and the
remaining count is announced. Deliberately **not** an auto-advance that acts on
its own: an action that scrolled and pre-selected the next record is how a stray
Enter verifies the wrong book.

## What did not change

The state machine, `canActorTransition` / `canActorVerifyInPlace` (librarians
still cannot verify their own records; an admin override is still audit-logged
as one), the publish-readiness gate, version history and restore, the
per-collection write split (`books` vs `research`), and every pre-0086 column
fallback.
