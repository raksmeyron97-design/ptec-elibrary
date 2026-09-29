# Reader services: online renewals and holds (Koha Phase 10)

**Status (2026-09-29): renewals (10.1) and holds (10.2) built, and verified
live against a local Koha 26.05.03 with the PTEC Reader Services plugin. Off
until switched on — and holds stay off until print availability is live.**

A reader whose library card is linked (docs/KOHA-PATRONS.md) sees a **Renew**
button on each loan Koha would renew online, in the *Library loans* panel of
My Library (`/dashboard`). A loan Koha would not renew shows Koha's reason
instead — the renewal limit, someone waiting for the book, a fine, an expired
card, too early — in English or Khmer. Returns stay at the desk.

With holds on, a Physical Library title with **no copy on the shelf** offers
*Place a hold* (`/catalogs/[slug]`), and the dashboard lists the reader's holds
with **Cancel hold** — or, for a hold already waiting on the hold shelf, **Ask
to cancel**, which the desk confirms. Check-outs and returns stay at the desk.

Decisions (PTEC, 2026-09-29): renew and hold through a PTEC Koha plugin, not
Koha's own API (Option B); a waiting hold becomes a cancellation REQUEST, never
a silent cancel; a hold only when no copy is on the shelf, and holds only once
the desk has re-issued the PMB loans (`CATALOG_AVAILABILITY_LIVE`); audit the
profile, Koha's ids, the action and Koha's code — no titles.

## How a renewal travels

```
Renew (browser)
  → renewLibraryLoan(checkoutId)            app/actions/library-loans.ts
      switch on? · signed in? · 20 an hour per reader
  → renewForReader(profile, checkoutId)     lib/koha/reader-services.ts (server-only)
      the reader's linked Koha patron (koha_patron_links)
      their loans read NOW — the loan must be one of them, or "not found"
  → renewLoan(client, patron, loan)          lib/koha/renewals.ts (pure)
      POST /api/v1/contrib/ptec/patrons/{patron}/checkouts/{loan}/renewal   — sent ONCE
  → PTEC Reader Services plugin (in Koha)
      the loan must be the patron's own · OpacRenewalAllowed · expired card
      Koha's CanBookBeRenewed, nothing overridden → AddRenewal
  → one activity_events row, the cached loans forgotten, the answer shown
```

Why the plugin rather than Koha's `POST /checkouts/{id}/renewal`: that route's
permission (`circulate_remaining_permissions`) also checks books out and
rewrites the lending rules, it accepts any loan number without asking whose it
is, and it skips the OPAC's rules. Measured on Koha 26.05.03 in
ptec-koha-deployment, docs/08-READER-SERVICES.md. The e-Library's Koha client
cannot even address Koha's own renewal route: `WRITE_ROUTES` names the
plugin's and nothing else (`lib/koha/boundary.test.ts`).

## Rules

- **Only the reader's own loan.** The browser sends only Koha's loan number.
  The patron is the one linked to the signed-in reader, and the number must be
  in that patron's loans read at the moment of the press — a stale page or a
  guessed number is refused before anything reaches Koha. The plugin checks
  ownership again inside Koha.
- **Sent once.** `client.write()` never retries. If Koha's answer is lost (a
  timeout, a dropped connection, a 5xx), the loans are READ: a renewal count
  that went up is a renewal; otherwise the reader is told it could not be
  confirmed and offered **Check again**, which re-reads — it never presses
  Renew again. Koha may still be finishing it.
- **Koha's code is the answer.** A refusal carries Koha's own code
  (`too_many`, `on_reserve`, `too_soon`, …), each with its own message
  (`renewalMessageKey`). A `403` *without* a code is the API user lacking the
  permission — a configuration fault, shown as "can't be done right now", never
  as the library refusing.
- **What the panel knows before a press is a hint.** Each loan's verdict comes
  from the plugin's renewability route when the panel loads (two at a time,
  cached with the loans for a minute). Koha decides again at the press; a
  verdict that went stale — someone placed a hold in between — is refused with
  Koha's reason, measured live.
- **Every attempt is audited**: one `activity_events` row, `event_type =
  circulation`, `success` / `denied` / `failed`, the reader's profile, and in
  `metadata` the action, Koha's patron, loan, item and record ids, and Koha's
  code. No title, no card number. `/admin/logs` shows them under **Account**
  as *Loan renewed*, *Renewal refused* or *Renewal failed*.
- **The loans cache is per process.** A renewal forgets the reader's cached
  loans so the next view is Koha's. The cache lives on `globalThis`: a route
  handler and a server action can load separate copies of a module, and with a
  module-level map the route kept serving the pre-renewal due date for up to a
  minute (measured on the dev server).

## Switching it on

1. In Koha (ptec-koha-deployment, docs/08-READER-SERVICES.md): the librarians
   check *OpacRenewalAllowed* and the renewal rules; then
   `PTEC_API_LEVEL=renewals`, `scripts/ptec-configure.sh`, `--check`.
2. In the e-Library's `.env`: `KOHA_READER_RENEWALS=on`, with
   `KOHA_INTEGRATION=write` and `KOHA_READ_PATRONS=on` (both already on for
   Phases 5–8). Restart.
3. `scripts/check-from-elibrary.sh` in the deployment package prints
   `✓ reader renewals: permitted through the Reader Services plugin`.

Off again: remove `KOHA_READER_RENEWALS`, restart. The Renew buttons go, the
desk note reads "Renewals and returns happen at the library desk." again, and
the action answers `off` without asking Koha.

## Verified live (2026-09-29)

The dev server against a local Koha 26.05.03 (`PTEC_API_LEVEL=holds`, plugin
1.0.0) and local Supabase, the seeded reader linked to a Koha patron with three
loans — one renewable, one at its limit, one someone was waiting for:

| Check | Result |
|---|---|
| `/api/me/library-loans` | `renewalsOnline: true`; the three verdicts (`allowed`, `too_many`, `on_reserve`, limit 2); another reader's loan absent |
| The panel | one Renew button; "Renewal limit reached."; "Someone is waiting for this book…"; desk note "Returns happen at the library desk." |
| Pressing Renew | "Renewed — now due 27 Oct 2026"; in Koha `renewals_count` 0 → 1 and the due date 13 → 27 Oct |
| Audit | one `circulation` row, `success`, Koha's patron, loan, item and record ids, no title or card |
| Reload | "Renewed 1 of 2" from Koha (found and fixed: the cache was per module copy, and the reload showed the old due date) |
| A verdict gone stale | another reader held the title after the page loaded; pressing Renew showed "Someone is waiting…" on that loan, audited `denied` / `on_reserve` |
| Khmer, and a phone | the Khmer button and reasons; a 40 px Renew target at 390 px, no horizontal scroll |

Unit tests (`lib/koha/renewals.test.ts`, the real client against the mock):
sent once with no body; Koha's codes passed through; a 403 without a code is
unavailable; a lost answer after Koha renewed is settled as renewed, before it
is "unconfirmed" — sent once either way. Boundary tests
(`lib/koha/reader-services-boundary.test.ts`, `boundary.test.ts`,
`write-boundary.test.ts`), each negative-controlled.

## Holds (10.2)

```
Place a hold (browser, /catalogs/[slug])
  → placeLibraryHold(slug)                   app/actions/library-loans.ts
      switch AND live availability? · signed in? · 20 an hour per reader (places + cancels)
  → placeHoldForReader(profile, slug)        lib/koha/reader-services.ts (server-only)
      the slug → a listed record the sync linked to Koha (holdableRecord)
      the reader's linked Koha patron · their holds read NOW — one hold per title
  → placeHold(client, patron, record, before)   lib/koha/holds.ts (pure)
      POST /api/v1/contrib/ptec/patrons/{patron}/holds {biblio_id}   — sent ONCE
  → PTEC Reader Services plugin (in Koha)
      OPACHoldRequests · the patron may place holds · pickup = their own library
      Koha's CanBookBeReserved · NO copy that could be borrowed off the shelf
      → AddReserve
  → one activity_events row, the cached holds forgotten, the answer shown

Cancel hold / Ask to cancel (browser, /dashboard)
  → cancelLibraryHold(holdId) → cancelHoldForReader(profile, holdId)
      the hold must be in the reader's OWN holds read NOW, or "not found"
  → cancelHold(...) → DELETE …/patrons/{patron}/holds/{hold}         — sent ONCE
  → the plugin: not yet found → cancelled (200)
                waiting on the hold shelf → a cancellation REQUEST (202), if the
                library's rule allows one; else waiting_cancel_not_allowed
                in transit / being processed → not_cancellable_online (the desk)
```

Why the plugin: Koha's own `POST /holds` needs the whole `reserveforothers`
module, and `place_holds` alone lets the API user list every patron's holds
and cancel any of them — including one waiting on the shelf — without asking
whose it is. `WRITE_ROUTES` adds only the plugin's two hold routes, and the
second is the **only DELETE** the e-Library's Koha client can send.

- **Only when no copy is on the shelf.** The page offers the button only when
  the catalogue shows no copy available and at least one that will come back
  — on loan, on another reader's hold shelf, or being processed
  (`titleMayBeHeld`). The page can be minutes old; the plugin decides again,
  and a copy back on the shelf is refused with `copy_on_shelf`: "A copy is on
  the shelf now — borrow it at the library desk." (measured live).
- **Only with live availability.** `kohaHoldsForReaders()` is
  `KOHA_READER_HOLDS` AND `CATALOG_AVAILABILITY_LIVE`: until the desk has
  re-issued the PMB loans, "no copy on the shelf" would be a statement about a
  database, not a shelf. With either off, the page shows no card, the
  dashboard no Cancel buttons, and both actions answer `off` without asking
  Koha.
- **The record comes from the server.** The browser sends a slug; the Koha
  record id is the listed catalogue row's `koha_biblio_id`. A hold number must
  be in the reader's holds read at the press.
- **One hold per reader per title**, whatever the lending rule would allow: a
  second press or a second tab is refused as `already_held` before Koha is
  asked.
- **A waiting hold is never silently cancelled.** The copy was already pulled
  for the reader, so the plugin records a cancellation request and the desk
  confirms it. The dashboard shows "Cancellation requested — the library desk
  will confirm it." from then on, read back from Koha (the
  `cancellation_requested` embed on the holds read), and offers no second
  request.
- **Sent once, settled by reading.** A lost answer to a place is settled by
  looking for a hold on that record that was NOT among the reader's holds read
  just before — an older hold on the same record never reads as the new one.
  A lost answer to a cancel is settled by whether the hold is gone (or now
  carries a request). Otherwise: "couldn't confirm", and **Check again**
  re-reads; it never sends again.
- **One rate bucket for placing and cancelling** (`RL_KOHA_HOLD_PER_HOUR`,
  default 20): every place and cancel reorders the queue behind it, so a
  place/cancel loop is the thing to stop.
- **Audited like renewals**: `event_type = circulation`, `metadata.action`
  `hold_place` or `hold_cancel` (with `outcome` `cancelled` or
  `cancellation_requested`), Koha's patron, hold and record ids and Koha's
  code. Never the title, the slug or the card. `/admin/logs` labels each row:
  *Hold placed / refused / failed*, *Hold cancelled*, *Hold cancellation
  requested / refused / failed*.
- **The page stays prerendered.** What THIS reader may do — sign in, link a
  card at the desk, already holds it (and where in the queue), has it on loan,
  or place a hold — comes from `GET /api/me/library-hold?slug=` after the page
  loads (`private, no-store`), answering `off` before reading a session when
  holds are off.

### Switching holds on

1. The desk has re-issued the PMB loans in Koha and
   `CATALOG_AVAILABILITY_LIVE=on` is set (docs/KOHA-SYNC.md).
2. In Koha (ptec-koha-deployment, docs/08-READER-SERVICES.md): the librarians
   check *OPACHoldRequests*, the hold rules, and — if readers may ask to cancel
   a hold already waiting — the *waiting hold cancellation* rule; then
   `PTEC_API_LEVEL=holds`, `scripts/ptec-configure.sh`, `--check`.
3. In the e-Library's `.env`: `KOHA_READER_HOLDS=on` (with
   `KOHA_INTEGRATION=write` and `KOHA_READ_PATRONS=on`). Restart. Cached
   `/catalogs` pages pick it up within five minutes.

Off again: remove `KOHA_READER_HOLDS`, restart.

### Holds verified live (2026-09-29)

The dev server against the local Koha 26.05.03 (`PTEC_API_LEVEL=holds`, plugin
1.0.0), local Supabase, `CATALOG_AVAILABILITY_LIVE=on`; fresh Koha readers and
records for the run (`p10/fixtures-holds.pl`): every copy out, a copy back on
the shelf that the e-Library still showed as out, a hold waiting on the shelf,
a hold in the queue, a title on loan to the reader, and another reader's hold.
**29/29** in English at 1280 px, **12/12** in Khmer on a 390 px phone.

| Check | Result |
|---|---|
| Signed out | "Sign in to place a hold on this book." — Sign in returns to the page |
| `/api/me/library-hold` | may place; waiting; queued at position 2; on loan with its due day |
| A title with a copy on the shelf | no card |
| Place a hold | "Hold placed — you're number 2 in the queue."; in Koha, the hold for THIS patron, priority 2, pickup PTEC; one `success` audit row with Koha's ids and no title or slug |
| Reload | "You have a hold on this book — number 2 in the queue.", no second button |
| A stale page (copy back on the shelf) | "A copy is on the shelf now — borrow it at the library desk."; no hold in Koha; audited `denied` / `copy_on_shelf` |
| Dashboard | `holdsOnline: true`; another reader's hold not listed |
| Cancel hold | asks first ("You'll lose your place in the queue"); *Keep hold* sends nothing; then "Hold cancelled." and the hold gone from Koha; audited `outcome: cancelled` |
| Ask to cancel, rule off | "This book is already waiting for you — ask at the library desk to cancel."; Koha: still `W`, no request; audited `denied` / `waiting_cancel_not_allowed` |
| Ask to cancel, rule on | "Cancellation requested — the library desk will confirm it."; Koha: still `W`, one cancellation request; audited `outcome: cancellation_requested`; after reload read back from Koha, no second button |
| Khmer, 390 px | card and panel in Khmer, links `/km/…`, a 44 px *Place a hold*, a 40 px *Cancel hold*, no horizontal scroll with the confirmation open |
| No card linked | "To place holds online, ask at the library desk to link your library card…", no button |

Unit tests (`lib/koha/holds.test.ts`, the real client against the mock): sent
once, through the plugin only; Koha's codes passed through; a missing plugin
or permission is unavailable; lost answers settled by reading, and an older
hold on the same record never mistaken for the new one (negative-controlled).
Boundary tests in `reader-services-boundary.test.ts`, `boundary.test.ts` and
`write-boundary.test.ts`, each negative-controlled.

## Not in this phase

Returns, fines and payments, renewing or holding on someone else's behalf,
item-level holds, choosing a pickup library, pausing a hold, and renewal or
hold-ready reminders (Koha's own notices send those).
