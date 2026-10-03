# Koha integration

**Status (2026-09-27):** Phase 2 (read-only sync, **[KOHA-SYNC.md](KOHA-SYNC.md)**),
Phase 5 (record writes) and Phase 6 (copy writes, **[KOHA-WRITES.md](KOHA-WRITES.md)**)
are live in production. Phases 8 + 7 — library cards linked at the desk and a
reader's own loans and holds in My Library, read-only — are built, not switched
on: **[KOHA-PATRONS.md](KOHA-PATRONS.md)**. Off by default.

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
so — until the PMB loans have been re-issued in Koha; the administrator then
sets `CATALOG_AVAILABILITY_LIVE=on` (`lib/catalogs/availability-live.ts`; a
code constant until Phase 9.1).

Circulation desk work stays in **Koha's staff interface**: Koha's REST API has
no check-in endpoint in any release up to 26.05 (bug 24401 is not merged), and
a desk that can check out but not check in is half a tool. PTEC shows
circulation read-only — except that readers may **renew** their own loans
and **place and cancel** their own holds (Phase 10.1/10.2,
[Reader services](KOHA-READER-SERVICES.md)) through a PTEC Koha plugin that
can do nothing else; checking out and in stay at the desk.

## Public OPAC links — where a reader's library account is

The Koha OPAC is public at `https://koha.ptec.edu.kh` (reverse-proxied by this
app, `lib/koha/opac-proxy.ts`, PR #263) and never indexed
(ptec-koha-deployment `docs/SEO-URL-POLICY.md`). The e-Library is the
catalogue readers search; the OPAC is where a reader **signs in** to see their
loans, due dates and holds. The e-Library links there, and nothing else
couples the two: no iframe, no shared session, no request to Koha to draw a
link.

| Where | Link | Rule |
|---|---|---|
| `/catalogs`, landing view only (no query, no filter, page 1) | "Borrowing printed books?" strip → **My Library Account ↗** | `components/ui/books/LibraryAccountStrip.tsx` |
| `/catalogs/<slug>`, the `#where` card | **View in the library catalogue ↗** → `/bib/<koha_biblio_id>` | only for a positive integer id; `rel="nofollow"` (below) |
| Phone Explore sheet | **My Library Account ↗**, right after the Physical Library row | `components/layout/MobileNavSheets.tsx` |
| Footer, library links | **My Library Account ↗** | `components/layout/Footer.tsx` |
| Dashboard, Library loans panel | **Full account ↗** in the card header, every state | `components/ui/dashboard/LibraryLoans.tsx` |

Rules (`lib/opac/links.ts`, pinned by `lib/opac/links.test.ts`):

- **One module writes OPAC URLs.** It lives outside `lib/koha` because client
  components render the links and no client component may import `lib/koha`
  (`lib/koha/boundary.test.ts`). `opac-proxy.ts` takes the host from it, so
  the name the proxy answers and the name the site links to are one constant.
- **Absolute, https, never locale-prefixed.** A relative URL would pass
  through the locale-aware `Link` and become `/km/…`. The links are plain
  `<a target="_blank" rel="noopener noreferrer">` with the site's "opens in a
  new tab" wording, like every other external link here.
- **A record link only from a stored Koha id.** `kohaOpacRecordUrl()` accepts
  a positive safe integer and nothing else — never a title search, never a
  string. `/bib/N` is the OPAC's canonical record address. A record Koha has
  since deleted answers Koha's own 404; the sync unlists such a record here.
- **`nofollow` on record links.** Catalogue records are `noindex, follow`
  (decision P2-1), so a crawler would otherwise walk ~2,600 record links into
  an OPAC that runs two Plack workers and is itself `noindex`.
- **No live check, by design.** A Koha that is down costs the e-Library
  nothing: the link opens a tab that fails, and the page a reader is on is
  untouched. The reverse is not true — the OPAC's public name is served
  through this app's container, so the e-Library being down takes the public
  OPAC with it (the LAN port is unaffected).
- **Khmer readers are told the OPAC's menus are in English** (Koha's
  interface is English; the PTEC content on it is bilingual).

Deliberately not built: a `/physical-library` page (`/catalogs` is that
page), a desktop dropdown, a "search Koha" form (the CSP's
`form-action 'self'` would refuse it, rightly), click analytics, and the
homepage link (it waits for the homepage redesign, PR #297).

To roll back, revert the commit: no data, setting or Koha change is involved.

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
| `KOHA_WRITE_ITEMS` | `on`: copies are written to Koha first (Phase 6; KOHA-WRITES.md). |
| `KOHA_READ_PATRONS` | `on`: library cards + My Library loans, read-only (Phases 8 + 7; KOHA-PATRONS.md). Needs `PTEC_API_LEVEL=patrons`. |
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
(live since 2026-09-26) → **5** bibliographic writes → **6** items (both live
2026-09-27) → **8** + **7** library cards and read-only loans (this) → **8** librarian-assisted patron linking →
**7** read-only circulation in My Library → **9** unified discovery.
