# Privacy Data Inventory

_Developer-facing inventory backing the public `/privacy` page. Created
2026-07-25. Keep in sync with `docs/DATA-GOVERNANCE.md`, the `privacy`
namespace in `messages/{en,km}.json`, and the enforcement code cited below.
Per DATA-GOVERNANCE §7, any change to what the site collects, keeps, or
exposes must update this file, the public privacy text, and the enforcement
in the same change._

This is the source of truth for what the app actually collects, verified by
reading the schema, server actions, API routes, and middleware — not by
reading the old policy text. The public page must not claim more or less
than what is listed here.

## 1. Data categories

| # | Category | Fields | Source | Purpose | Storage | Access | Retention | Deletion on account delete | Third parties | Visibility |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Account & sign-in | `email`, `full_name`, `avatar_url`, `role`, `is_super_admin` (`profiles`) | User at signup, or Google OAuth (`signInWithOAuth({provider:'google'})` — name/email/photo) | Run the account, sign-in, personalisation | Supabase Postgres; avatar via Vercel Blob | The user; technical steward (DB) | Life of account | Cascade-deleted (`auth.admin.deleteUser` → `profiles` + owned rows) | Supabase, Google (sign-in), Vercel (Blob) | Name + photo public on reviews; rest private |
| 2 | Download Access Profile | `gender`, `phone`, `institution_name`, `institution_type`, `faculty_department`, `professional_role`, `country`, `province_city`, `student_staff_id`, `download_purpose`, consent timestamps (`profiles`, migration 0093) | User, optional, at `/dashboard/settings` | Authorise thesis PDF downloads (Top-10 protection) | Supabase Postgres | The user; librarians see only aggregate snapshots | Life of account | Cascade-deleted | none | Private |
| 3 | Library activity (private) | saved books, reading lists, reading progress, book notes, highlights/annotations (`saved_books`, `reading_lists`, `reading_list_books`, `reading_progress`, `book_notes`, `book_annotations`) | User actions | Power "continue reading", saved items, notes | Supabase Postgres | The user only | Life of account | Cascade-deleted (`ON DELETE CASCADE` on `user_id`) | none | Private |
| 4 | Reviews & post comments (public) | rating, review text, comment text (`reviews`, `post_comments`) | User | Public book reviews / post discussion | Supabase Postgres | Everyone (published) | Until user deletes or account deleted | Cascade-deleted (may be anonymised where thread integrity matters — DATA-GOVERNANCE §3.2) | none | **Public**, shown with display name + photo |
| 5 | Contact-form messages | `name`, `email`, `message`, `ip_address` (`contact_messages`, migration 0078) | User via `/contact` | Reply to enquiries | Supabase Postgres | Library staff (contact inbox) | 2 years after resolution, then thread deleted | Retained but detached from account (legitimate interest — DATA-GOVERNANCE §3.3) | Gmail/SMTP (reply delivery) | Private to staff |
| 6 | Download & view logs | `user_id`, `book_file_id`/content id, timestamp (`download_logs`, `view_logs`, `research_report_downloads`) | Automatic on download/view | Security, download counts, catalog statistics | Supabase Postgres | Technical steward; librarians see aggregates | Raw 1 year, then aggregate only | `user_id` set null / cascaded; aggregates keep no identity | none | Private |
| 7 | Search queries | raw term, daily-rotating HMAC session hash (**not** raw IP), bot flag (`lib/search/analytics.ts`, `app_events`) | Automatic on search | Improve catalog (zero-result terms), AI answer | Supabase Postgres | Technical steward | 365 days (`purge_search_analytics`, cron cleanup) | Not account-linked (session hash only) | Google (Gemini processes the query text server-side to answer) | Private / aggregate |
| 8 | Push subscriptions | `endpoint`, `p256dh`, `auth_key` (`push_subscriptions`, migration 0044) | User opt-in | Send new-book/post notifications | Supabase Postgres | Technical steward | Until unsubscribed/expired (auto-pruned on send failure) | Cascade-deleted | Browser push service (Google FCM / Mozilla / Apple) | Private |
| 9 | Security & rate-limit | IP address, timestamps (`contact_rate_limit`, `rate_limit`, security log) | Automatic | Prevent abuse/spam, protect sign-in | Supabase Postgres | Technical steward | Short-term; `rate_limit` purged >24 h idle (cron) | Not account-linked | Cloudflare (Turnstile CAPTCHA on contact/auth forms) | Private |
| 10 | AI usage quota | `user_id`, daily `count` (`ai_usage`) | Automatic on AI use | Enforce per-user daily AI quota | Supabase Postgres | Technical steward | Rolling daily counters | Cascaded / not identifying | none | Private |
| 11 | Admin audit log | `admin_id`, `action`, `target`, `metadata`, timestamp (`admin_audit_log`) | Automatic on admin actions | Accountability for privileged changes | Supabase Postgres | Admins/super admins | ≥ 2 years, no auto-purge | **Retained** for staff who performed admin actions (accountability — disclosed) | none | Private (internal) |
| 12 | Device storage | theme (`ptec.theme`), locale cookie (`ptec_locale`), reader config, offline book cache (Service Worker: pages, covers, PDFs, Supabase GET) | User's browser | Preferences + offline reading (PWA) | Browser localStorage / cookies / Cache Storage / IndexedDB | The user (on device) | Until the user clears it | Cleared by the user via browser | none | Private, on device |

## 2. Third-party processors

| Processor | Role | Data reaching it |
|---|---|---|
| Supabase | Postgres DB + Auth | All server-side data above |
| Vercel | Hosting; `@vercel/analytics` (aggregate, cookieless) page metrics; Vercel Blob (avatars) | Request metadata, avatar images |
| Zima Storage (primary), Cloudflare R2 (legacy) | Book/thesis/publication file storage | Uploaded documents, covers |
| Google | OAuth sign-in; Gemini AI (search/assistant/summaries), server-side only | Sign-in profile; search/query text sent to Gemini |
| Gmail / SMTP | Auth emails + contact replies | Email address, message content |
| Cloudflare Turnstile | CAPTCHA on contact/auth forms | Challenge token, IP (Cloudflare-side) |
| VirusTotal (optional) | Hash-reputation check on **admin** uploads only | File hash (not user data) |

## 3. Discrepancies found vs. the previous policy text

The previous `/privacy` copy was accurate as far as it went but **under-disclosed**. Gaps fixed in the new page:

1. **Vercel Analytics** was not mentioned. It is loaded in `RootShell.tsx`. Now disclosed as aggregate, cookieless analytics.
2. **Download Access Profile** (gender, phone, institution, role, purpose — migration 0093) was not mentioned at all. Now disclosed (category 2).
3. **IP address** handling was not disclosed. It is stored on contact messages and used for rate-limiting; the search log deliberately stores an HMAC session hash, not a raw IP. Now disclosed and distinguished.
4. **Push subscriptions**, **Cloudflare Turnstile**, and **Gemini AI processing of search text** were not disclosed. Now disclosed.
5. **"Library staff cannot browse them"** overstated privacy. Corrected to: private data is not exposed in the admin panel, but the technical steward has database access under access controls (DATA-GOVERNANCE §6). Accurate per RLS + service-role reality.
6. **Retention** was described only as "while your account exists." Now gives category-based periods (search 365 d, raw download/view logs 1 yr, contact 2 yr, audit ≥ 2 yr) matching DATA-GOVERNANCE §2.
7. **Deletion exceptions** were not disclosed. Admin audit rows for staff actions and contact threads are retained; backups propagate deletion within ~6 months. Now disclosed (DATA-GOVERNANCE §3).
8. **"All connections use HTTPS encryption"** risked implying at-rest encryption. Rewritten to separate data in transit (HTTPS/TLS), data at rest (Supabase-managed storage), and access control (RLS + server-side permission checks) — per the prompt's requirement.
9. **Complaints channel** was implicit. Now explicit (contact form / email; 30-day response per DATA-GOVERNANCE §4).

## 4. Not collected (verified)

- No advertising, no ad networks, no cross-site tracking pixels.
- No sale of personal data.
- No third-party behavioural trackers (only cookieless Vercel aggregate analytics).
- No payment data (the library is free; no premium/payment tables exist).
- No Telegram integration for user data (Telegram appears only as a configurable social link in site settings, not a data channel).
- Search log stores **no raw IP** — HMAC session hash only.
