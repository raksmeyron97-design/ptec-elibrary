# Koha integration

**Status (2026-09-27): Phase 5 — record writes (built, not switched on).**
Phase 1 laid the server-only client, its configuration, error model and a mock
Koha. Phase 2 makes the Physical Library a read-only projection of a real Koha
26.05 (**[KOHA-SYNC.md](KOHA-SYNC.md)**, live since 2026-09-26). Phase 5 lets the
admin create and edit bibliographic records in Koha first
(**[KOHA-WRITES.md](KOHA-WRITES.md)**), with `KOHA_INTEGRATION=write`. Off by
default.

## Who owns what

| Koha (source of truth for the physical library) | PTEC (digital library and discovery) |
|---|---|
| Bibliographic records, MARC | Digital books, PDFs, OCR, AI, search, SEO |
| Items: barcode, call number, location, status | Reader progress, bookmarks, notes, collections |
| Patrons, checkouts, renewals, holds, due dates | Public catalogue pages (a projection of Koha) |

The physical catalogue lives in PTEC's `catalog_books` / `catalog_copies`.
Once the first Koha build is applied they are filled and kept current from
Koha (`koha_biblio_id` / `koha_item_id` link each row to its Koha
counterpart). Availability is not claimed as live — and the public pages say
so (`CATALOG_AVAILABILITY_IS_LIVE` in `lib/catalog.ts`) — until the PMB loans
have been re-issued in Koha.

Circulation desk work stays in **Koha's staff interface**: Koha's REST API has
no check-in endpoint in any release up to 26.05 (bug 24401 is not merged), and
a desk that can check out but not check in is half a tool. PTEC shows
circulation read-only.

## Modes — `KOHA_INTEGRATION`

| Value | Meaning |
|---|---|
| unset / `off` / anything unrecognised | No Koha calls. Every call is refused with `disabled`. |
| `mock` | An in-process fake Koha 26.05 (`lib/koha/mock.ts`). No network. For development and tests. |
| `read` | Reads from a real Koha. Requires the settings below. |
| `write` | Everything `read` does, and the admin creates/edits bibliographic records in Koha first (Phase 5). Needs the Koha API user at `PTEC_API_LEVEL=cataloguing`. |

All settings are server-side environment variables — never `NEXT_PUBLIC_`,
never stored in the database, never shown after they are set. See the Koha
section of `.env.example`.

| Variable | |
|---|---|
| `KOHA_BASE_URL` | Koha's **staff** interface origin; the API is `/api/v1` on it. On the box, the compose service name, e.g. `http://koha:8080`. |
| `KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET` | The API key of a dedicated Koha staff patron (below). |
| `KOHA_LIBRARY_ID` | Koha library code the integration acts for (`x-koha-library`). |
| `KOHA_TIMEOUT_MS` | Per-call budget for interactive calls, default 8000. The sync's background page reads carry their own 60 s budget (KOHA-SYNC.md); a record write, 30 s. |
| `KOHA_STAFF_URL` | Optional. Koha's staff interface as a librarian's browser reaches it (the box's LAN address). Used only for "Open in Koha" / "Add copies in Koha" links. |

## Setting up Koha 26.05 for the integration

Done once, in Koha's staff interface, by the Koha administrator:

1. **Enable client credentials.** Administration › System preferences › search
   `RESTOAuth2ClientCredentials` → *Enable*. (Without it Koha answers
   "Unimplemented grant type", and `koha:check` says exactly that.)
2. **Create a dedicated API user.** A new patron (e.g. category *Staff*,
   surname `PTEC e-Library API`), not a person's account. Give it **only**
   `catalogue` for now — the Phase 2 sync needs nothing more. Later phases add permissions one at a time (cataloguing
   writes need `editcatalogue`; patron lookup needs `borrowers:list_borrowers`).
   Never `superlibrarian`.
3. **Generate its API key.** Open that patron › More › Manage API keys ›
   Generate. Copy the client id and secret into the box's `.env` — Koha shows
   the secret once.
4. **Note the library code** (Administration › Libraries) for `KOHA_LIBRARY_ID`.

Networking: the PTEC container must reach Koha's staff interface. On ZimaOS,
put both on a shared Docker network and use the service name; plain `http` is
accepted there and warned about toward a public host, because the client secret
travels on the token request. The deployment on Vercel cannot reach a box on
the LAN.

## Checking it

```bash
KOHA_INTEGRATION=mock npm run koha:check     # no Koha needed
npm run koha:check                           # uses .env.local
```

It prints each step — version (proves the token and the `catalogue`
permission), libraries, the configured library code — and exits 0 only when
all pass. It never prints the secret.

## How the client behaves (`lib/koha/*`)

- **Server-only.** `lib/koha/index.ts` is the only module that reads the
  environment and is `server-only`; everything else is pure and injected with
  `fetch`, so tests, scripts and the server run the same code.
  `lib/koha/boundary.test.ts` fails if a client component imports it or a
  `NEXT_PUBLIC_KOHA*` variable appears.
- **No steerable URLs.** Every call is `KOHA_BASE_URL + /api/v1 + path`, and a
  path must be a plain one built with `kohaPath()`, which encodes each
  parameter as one segment.
- **Tokens** are held in process memory, refreshed a minute before Koha's
  one-hour expiry, minted once for concurrent callers, and refreshed once on a
  401 before the credentials are reported as wrong.
- **Bounded and traceable.** Every call has a timeout and an
  `x-koha-request-id` — a positive **integer**: Koha 26.05 declares the
  header `type: integer` and answers 400 to anything else on its list
  endpoints (`/libraries`, `/biblios`, …). The mock enforces the same rule.
  Verified against a live Koha 26.05.03 with the least-privilege API user
  (`catalogue` only): `koha:check` passes all three steps.
- **Retries** only for reads, only on transient failures (unreachable,
  timeout, 5xx, 429), twice, at 300 ms and 1 s. A write is never retried
  blindly: a timed-out write may have happened.
- **Errors name their owner** — `transient` (Koha down/slow), `permanent`
  (not found, conflict, rejected input) or `config` (off, unconfigured, bad
  credentials, a missing permission) — the same split `resource_index_state`
  uses. Messages carry Koha's own reason, never a token or secret.
- **Responses are checked** against the 26.05 shapes (`lib/koha/types.ts`); a
  body that does not match is a `bad_response`, never a half-read record.

## Next

Phase order agreed at Gate 2: **1** foundation → **4** Add by ISBN → **3**
catalogue redesign → **2** read-only sync and the barcode-keyed reconciliation
(live since 2026-09-26) → **5** bibliographic writes (this) → **6** items → **8** librarian-assisted patron linking →
**7** read-only circulation in My Library → **9** unified discovery.
