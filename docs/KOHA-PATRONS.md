# Library cards and My Library loans (Koha Phases 8 + 7)

**Status (2026-09-27): built and tested against a local Koha 26.05.03 holding
the full PMB catalogue (live checks below). Not switched on in production.** It switches on with
`KOHA_READ_PATRONS=on` in the e-Library and `PTEC_API_LEVEL=patrons` in the
Koha deployment package.

A librarian links a reader's e-Library account to their Koha library card at
the desk; the reader then sees their own **loans** (due dates, overdue,
renewals) and **holds** (waiting for pickup, in transit, in the queue) in the
"Library loans" panel of My Library (`/dashboard`). This part is
**read-only**; renewing online is Phase 10.1 ([Reader services](KOHA-READER-SERVICES.md)),
and returns stay at Koha's desk.

Decisions (PTEC, 2026-09-27): the Koha API user gains three read-only
permissions as a new level `patrons`; **librarians** (catalog write) link
cards; no self-service linking for now; current loans and holds only (no
history, no fines).

## Why these permissions, and not circulation

Koha 26.05.03 has no read-only circulation permission on its general
endpoints: `GET /checkouts` needs `circulate_remaining_permissions` — the
permission that also checks books out and renews them — and `GET /holds` needs
`place_holds`. The **per-patron** endpoints accept read-only permissions
instead, so the e-Library uses only those:

| Endpoint | Permission (level `patrons`) |
|---|---|
| `GET /patrons?cardnumber=…&_match=exact` — find a card at the desk | `borrowers → list_borrowers` |
| `GET /patrons/{id}/checkouts` — a reader's current loans | `borrowers → view_checkout_history` |
| `GET /patrons/{id}/holds` — a reader's holds | `borrowers → view_holds_history` |

None of them can change anything in Koha. The trade-off: `list_borrowers` lets
the API key read any patron's record, not only linked readers' — the price of
looking a card up at the desk. `_match=exact` matters: Koha's default is a
substring match, so `0803` would also find `30803`.

## What is stored

Only the link (`koha_patron_links`, migration 0159): e-Library profile ↔ Koha
patron id, and the card's last four characters to show which card it is. One
card per reader, one reader per card. RLS on, revoked from `anon` and
`authenticated`: browsers never read it.

Koha's patron record carries address, phone, email and date of birth. The
e-Library keeps none of it: `summarisePatron()` (`lib/koha/patrons.ts`) keeps
the name, category, library, expiry and the expired/restricted flags — what a
librarian needs to confirm the card in person — and a test fails if anything
else leaves it. Loans and holds are read live and never stored.

## Linking a card (the desk)

`/admin/catalogs/library-cards` — opens for catalog **write** (it shows readers'
names and emails and patron details), linked from the Physical Library page.

1. Find the reader by their e-Library email (exact, case-insensitive). A reader
   without an account signs up first.
2. Find the card by its number, exactly as printed. Koha answers; the page
   shows the name in Koha, the category, library and expiry, and flags an
   expired card, a restriction in Koha, or a card already linked to someone.
3. **Link only if the name in Koha is the person in front of you.**

The server re-looks the card up at the moment of linking: the browser sends a
reader and a card number, never a patron id. Every lookup, link and unlink is
in the admin audit log (`koha_card_lookup`, `koha_card_link`,
`koha_card_unlink`), with the card's last four characters, never the whole
number. Unlinking removes the pairing only; nothing changes in Koha.

## My Library

The "Library loans" panel on `/dashboard` loads after the page from
`GET /api/me/library-loans`, so a slow or unreachable Koha never holds up the
dashboard. That route takes no parameter at all: the reader is the verified
session's, and the patron is the one linked to them.

| State | The reader sees |
|---|---|
| Not switched on | nothing (the panel is not rendered) |
| No card linked | "Ask at the library desk to link your library card" |
| Koha did not answer | "Your loans can't be shown right now" — **never** "Nothing on loan" |
| Linked | loans (soonest due first, overdue flagged, renewals) and holds (ready for pickup + collect-by date, on its way, in the queue + position, paused), each title linked to its `/catalogs` page |

Titles come from the e-Library's own catalogue (a loan by its copy's
`koha_item_id`, a hold by its record's `koha_biblio_id`). A book the sync has
not brought yet is shown as such, not guessed.

Koha is read **at most once a minute per reader** (an in-process cache):
Koha runs two Plack workers, and a dashboard is opened far more often than
loans change. A link or unlink clears that reader's cache.

Each read — the reader's panel, and a card lookup at the desk — has **one
10-second budget, retries included** (`PATRON_READ_BUDGET_MS`). Without it the
client's default for a read (three attempts of 8 s) kept the panel on
"Loading…" for 28 s when Koha did not answer; with it, 13 s including the page
load. A failure is never cached, so the next view asks Koha again.

Dates are shown in the library's timezone (Asia/Phnom_Penh), not the device's:
a loan due at 23:59 is due that day wherever a phone is set.

## Switching it on (production)

1. Merge; the box deploys it (migration 0159 with it).
2. In the deployment package: `PTEC_API_LEVEL=patrons` in `.env`, then
   `scripts/ptec-configure.sh`; `--check` →
   `… + read-only patrons (list, checkouts, holds)`.
3. In the e-Library's `.env`: `KOHA_READ_PATRONS=on`. Restart.
4. `scripts/check-from-elibrary.sh` → `✓ patron reads: permitted (list 200,
   loans 404, holds 404) — read-only`. The loans and holds checks ask about
   patron 0, which does not exist: 404 means "allowed", 403 "not allowed".
5. Link one real reader at the desk, lend them a book in Koha, and check
   their My Library shows it (within a minute).

**Off again:** `KOHA_READ_PATRONS` unset (the panel and the page say so; links
are kept), and `PTEC_API_LEVEL=items` + `scripts/ptec-configure.sh`.

## Tested (local Koha 26.05.03, full PMB catalogue, 2026-09-27)

Test patrons, loans and holds were made in Koha by a test-only helper
(`AddIssue`, `AddReserve`); the e-Library only read them.

| Check | Result |
|---|---|
| Koha at `items` | card lookup, loans and holds refused (403); the desk page says "Koha refused … PTEC_API_LEVEL=patrons"; nothing linked |
| `ptec-configure.sh` to `patrons`, `--check` | `flags=4 granular=[4:list_borrowers,4:view_checkout_history,4:view_holds_history,9:edit_catalogue,9:edit_items]`, login locked, API key kept |
| Connection check | `patron reads: permitted (list 200, loans 404, holds 404)`; with `KOHA_READ_PATRONS` off it warns that Koha allows more than the e-Library uses; at `items` with it on, it fails (exit 1) naming the fix |
| Library code, live (10 checks) | card by exact number with its Khmer name; no email, address or phone kept; a prefix finds nothing; overdue loan first and flagged; barcode and record from `embed item`; waiting hold with its collect-by date, then the queue; an unknown patron is Koha's 404 |
| Browser (30 checks) | unlinked reader asked to link at the desk; the route is 401 without a session and `private, no-store` with one; the desk finds the reader (case-insensitive) and the card, shows no Koha contact data, links, refuses a card already linked and a second card; loans, overdue, holds and titles in English and Khmer; Koha paused → "can't be shown right now" (never "nothing on loan") while the dashboard renders, and back once Koha answers; unlink; a reader cannot open the desk page |
| Switched off, a link stored | no panel, no link on the Physical Library page, the desk page says it is off, the route answers `off` without asking Koha, the link is kept |
| Koha afterwards | borrowers, loans, holds, items, records and action log unchanged by every e-Library check |

## Not in this phase

Renewals (now Phase 10.1, [Reader services](KOHA-READER-SERVICES.md)) and
placing or cancelling holds (Phase 10.2) — both through a PTEC Koha plugin,
because Koha's own routes need permissions that can change far more — returns,
fines and payments, loan history,
patron creation or edits, self-service linking with a card + OPAC password
(`api_validate_password`, and rate limiting against guessing), and due-date
reminders.
