# Reader services: online renewals (Koha Phase 10.1)

**Status (2026-09-29): built, and verified live against a local Koha 26.05.03
with the PTEC Reader Services plugin. Off until switched on.** Holds (10.2)
come next and stay off until print availability is live.

A reader whose library card is linked (docs/KOHA-PATRONS.md) sees a **Renew**
button on each loan Koha would renew online, in the *Library loans* panel of
My Library (`/dashboard`). A loan Koha would not renew shows Koha's reason
instead — the renewal limit, someone waiting for the book, a fine, an expired
card, too early — in English or Khmer. Returns stay at the desk.

Decisions (PTEC, 2026-09-29): renew through a PTEC Koha plugin, not Koha's own
API (Option B); audit the profile, Koha's ids, the action and Koha's code — no
titles; renewals first, holds after the desk has re-issued the PMB loans.

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

## Not in this phase

Holds (10.2: placing on the Physical Library page, cancelling on the
dashboard), returns, fines and payments, renewing on someone else's behalf,
and renewal reminders.
