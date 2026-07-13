# Admin Intelligence Dashboard — metric definitions

Authoritative definitions for every number on `/admin`. Anything shown in the
UI links back to one of these. Sources are the raw event tables; all period
bucketing is **Asia/Phnom_Penh** (UTC+7, no DST), storage is UTC.

## Shared period model

- Ranges: `today` (hourly buckets), `7d`, `30d`, `90d` (daily), `custom`
  (validated `from`/`to`, inclusive, ≤365 days, no future start; invalid input
  falls back to `30d`). Implementation: `parseDashboardFilters` in
  `lib/admin/dashboard-shared.ts`, window building in `lib/admin/dashboard.ts`.
- Previous period = the same number of days immediately before the selected
  window (yesterday for `today`).
- Change badges: percentage only when the previous value ≥ 10; below that the
  absolute difference (`+326`) is shown, and the absolute previous value is
  always displayed next to the badge. Previous 0 → "New" (never `+∞%`).
- Filters `type` / `dept` / `lang` restrict events by joining
  `content_type:content_id` to the content catalog (books/theses/publications/
  posts). Department lives on books (text) and theses (via `departments`);
  language on books (`English`/`Khmer` → en/km) and publications.

## Event sources

| Event | Table | Written by | Notes |
|---|---|---|---|
| Content detail view | `view_logs` | detail-page pings via `logContentView` | Anonymous included since 0090; bot-filtered (UA), rate-limited 60/min/IP; `session_hash` = daily-rotating HMAC(ip, ua, secret) — no raw IP stored; `locale` from `x-locale` |
| Reader open | `reader_open_logs` (0090) | `PDFReaderLauncher` open click + `/books/[slug]/read` mount | sessionStorage dedupe per tab; new event — "collecting" until data exists |
| Download | `download_logs` | `/api/books/[slug]/download`, thesis download action | auth-required route; `session_hash` added by 0090 |
| Save | `saved_books` | existing save action | funnel stage only |
| Search | `search_queries` | `/api/search/native` (0058/0064/0080/0087) | has `result_count`, `query_language`, `session_hash` |
| Result click | `search_result_clicks` (0080) | `/api/search/click` | |
| Signup | `profiles.created_at` / `daily_user_signups` | Supabase auth | |
| AI request | `app_events` kind=`ai_request` (0090) | `/api/ask`, `/api/search` summary, `/api/chat` | status ok/error/quota + latency_ms; no prompt text ever |
| Storage op | `app_events` kind=`storage_operation` (0090) | download route | backend zima (ok/error) or r2 (fallback) |

## Overview KPIs (all period-scoped)

- **Unique visitors** — distinct identifiers among period `view_logs` rows,
  where identifier = `user_id` (stable across days) or `session_hash` (rotates
  daily). An anonymous person active on N days counts N times — deliberate
  privacy trade-off (no durable anonymous identifier exists). Rows with
  neither (pre-0090 history) are excluded and surfaced as "untracked".
- **Detail views** — count of period `view_logs` rows (bot-filtered at write).
- **Reader opens** — count of period `reader_open_logs` rows; "collecting"
  until instrumentation has data.
- **Downloads** — count of period `download_logs` rows.
- **Engagement rate** — |identified visitors with a reader open ∪ download| ÷
  |identified visitors with a detail view|. "Not enough data" below 5 viewers.

Lifetime inventory (`view_count` columns, totals) is deliberately *not* in
this row — it lives under Content → Collection health and is labeled
"lifetime totals — unaffected by the date range". The public-facing lifetime
counters still increment for signed-in users only (unchanged since 0019).

## Discovery & engagement (replaces the funnel — 2026-07-12 second pass)

The event streams are independent volumes: visitors enter via search, direct
links, shares and browsing, so a sequential funnel presentation was
**invalid** and has been removed. The dashboard now shows the three honest
pairwise rates (`discoveryRates` in `lib/admin/dashboard-shared.ts`):

- **Search click-through** = result clicks ÷ searches.
- **Read rate** = reader opens ÷ detail views (null while collecting).
- **Download rate** = downloads-or-saves ÷ detail views.

A rate whose ratio exceeds 100% is marked *not comparable* (the populations
differ — e.g. downloads recorded before view instrumentation covered
anonymous visitors) and renders as a dash with an explanation, never as a
percentage. Raw volumes are listed alongside without any implied sequence.

## Internal-traffic exclusion (verified correction, 2026-07-12)

Hosted-data audit found **58% of view events (205/355) and 5/13 downloads
came from admin-panel staff accounts** browsing the site. All engagement
analytics (KPIs, series, content table, departments, audience activity,
discovery rates) therefore **exclude events whose `user_id` belongs to a
profile with role staff/librarian/admin/super_admin** (`excludeInternal`,
applied at read time — raw logs keep everything, so the exclusion is
reversible). Registrations and total-user counts still include staff
(accounts are accounts). Public lifetime counters (`view_count` columns) are
unaffected.

## Test-query flagging (verified correction, 2026-07-12)

The search log contains obvious automation/testing artifacts ("education"
×123 in bursts, "zzzznotfound", pasted passage fragments). A deterministic
heuristic (`isLikelyTestQuery`: sentinel strings, >64 chars, ≥8 words) flags
these in the query table as *suspected test queries* and excludes them from
Collection Opportunities. They are never removed from raw analytics —
labelled, not hidden.

## Content intelligence

Per resource, within the period: views, unique viewers (distinct identifiers),
reader opens, downloads, conversion = (opens + downloads) ÷ views, trend =
views delta vs previous period. Metadata completeness is the share of a fixed
per-type checklist (books: cover, description, author, language, department,
ISBN; theses: cover, abstract, author, department, keywords, year;
publications: cover, abstract, DOI, keywords; posts: cover, excerpt,
category). Presets are deterministic filters/sorts (see
`getContentIntelligence`); pagination and preset selection are server-side.

**Department normalisation** — every "per resource" figure divides by the
count of *published* resources in that department, so a 2-book department is
comparable with a 70-book one. The formula is shown in the table caption.

## Search & AI

- Zero-result rate — share of period searches with `result_count = 0`
  (rows with NULL `result_count`, logged before 0064, are excluded).
- CTR — result clicks ÷ searches (aggregate volumes).
- Sessions — distinct `session_hash` values (collected since 0087).
- Khmer share — `query_language = 'km'` share.
- AI success/latency — `app_events` kind=`ai_request` (collected since 0090).
- `ai_usage` remains the quota instrument (per-user daily counts).
- Collection opportunities — deterministic: zero-result terms searched ≥3
  times, and terms searched ≥3 times whose average `result_count` ≤ 2.

## Audience

- New registrations — `profiles` created in period (not cumulative).
- Active registered users — signed-in users with any view/reader/download
  event in period. Returning — active on ≥2 distinct days.
- Signed-in vs anonymous views — `user_id` null-ness on period view rows.
- Locale split — `view_logs.locale` (collected since 0090).
- Privacy: no raw IPs, no durable anonymous identifiers, no device
  fingerprinting; daily HMAC rotation makes cross-day anonymous correlation
  impossible by construction (see `lib/search/analytics.ts`).

## Insights (deterministic rules)

Implemented in `lib/admin/insights.ts` with minimum-sample guards
(engagement rules need ≥20 events/period; Khmer share needs ≥20 searches;
department rule needs ≥3 departments). No LLM output anywhere on the
dashboard.

## Access control

- Page + all views: admin-panel roles via the `(protected)` layout (MFA).
- System & Operations view: `ADMIN_ROLES` only, enforced server-side in the
  page *and* re-checked by the export API.
- CSV export: `requireStaff` (+ `requireAdmin` for system), rate-limited
  10/min/user, audit-logged (`dashboard.export`), formula-injection-escaped.
- All analytics reads use the server-only service client; new tables
  (0090) are RLS-closed to anon/authenticated.

## Known limitations (honest gaps)

- Reader opens, AI telemetry, storage telemetry, view locale and view
  session hashes collect **from 0090 deployment onward** — comparisons need
  a full previous period of data before they are meaningful.
- Search latency is not measured (native search does not log timing).
- Device class and referrer are not collected (privacy-first decision).
- Anonymous cross-day retention is impossible by design (daily hash rotation).
- Discovery rates are aggregate volume ratios, not user-joined paths; a
  session-joined funnel becomes possible once `session_hash` coverage spans
  views, reader opens and downloads (post-0090 data only).
- Thesis reader opens: theses have no online PDF reader surface today, so the
  funnel's reader stage covers books (the migration supports theses and
  publications for the future).
