# Data Governance Policy

_Created 2026-07-12 (roadmap Task 6). Approved owner: library director;
technical steward: web-team lead. Review annually or after any relevant
incident. The technical enforcement column cites the code/migration that
implements each rule — policy and implementation must not drift apart._

## 1. Ownership

| Asset | Owner (decides) | Steward (operates) |
|---|---|---|
| Catalog metadata (books/theses/publications) | Library director | Librarians via `/admin` |
| User accounts & reading data | The user (self-service export/delete) | Web-team lead |
| Search analytics, audit logs, ops data | Web-team lead | Web-team lead |
| Backups | Web-team lead | Web-team lead + box owner |
| Published policy text (this file, privacy page) | Library director | Web-team lead |

## 2. Data classes & retention

| Data | Class | Retention | Enforcement |
|---|---|---|---|
| Published catalog metadata | Public | Indefinite (institutional record) | — |
| Draft/unpublished metadata | Internal | Until published or archived; archived kept indefinitely | status workflow (0086); excluded from exports/feeds (`lib/exports/works.ts`, OAI gate) |
| Content version snapshots | Internal | **400 days** | `purge_content_versions` via cron cleanup (0086) |
| Admin audit log | Internal (accountability) | ≥ 2 years (no automatic purge) | reviewed monthly (§M3) |
| Search query log (raw terms + session hash) | Personal-adjacent | **365 days** | `purge_search_analytics` via cron cleanup (0087) |
| Search term actions/synonyms/curated | Internal | Indefinite (curation record) | — |
| Contact messages + replies | Personal | 2 years after resolution, then delete thread | annual manual sweep (M4 add-on); Gmail side follows same rule |
| Account data (profile, notes, annotations, progress, lists) | Personal | Life of account | self-service export (`app/actions/export.ts`); deletion below |
| Download/view logs | Personal-adjacent (user-linked) | 1 year, then aggregate only | aggregates in `daily_content_*`; raw sweep with the search purge cadence |
| Push subscriptions | Personal | Until unsubscribed/expired (auto-pruned on send failures) | 0081 hardening |
| Backups | Mixed (contains the above) | 7 daily + 4 weekly + 6 monthly | BACKUP-DR §3 prune |
| ops_events | Internal | 1 year | annual prune with M4 |

Privacy rules already enforced in code: no raw IPs in the search log
(daily-rotating HMAC session hash only — `lib/search/analytics.ts`); bots
excluded at logging time; security log never contains passwords, tokens,
cookies, or message bodies (`lib/security-log.ts` contract); analytics
tables are RLS-locked service-only (0084/0087) and read exclusively through
librarian-guarded actions.

## 3. Account deletion

On verified user request (or via profile self-service where available):
1. Delete Supabase auth user → `profiles` and user-owned rows cascade
   (notes, annotations, progress, lists, saved books, subscriptions,
   push subscriptions).
2. Reviews/comments: delete, or anonymize where thread integrity matters.
3. Contact threads: retained under the contact rule (legitimate interest),
   detached from the account.
4. Audit-log rows referencing the user's *admin actions* are retained
   (accountability record) — this is disclosed in the privacy text.
5. Backups: deletion propagates as archives rotate out (≤ 6 months);
   restored archives must re-apply deletions recorded after the archive
   date (kept in the deletion log, shared drive).

## 4. Takedown, complaints & corrections

| Request | Channel | SLA | Procedure |
|---|---|---|---|
| Copyright complaint | Contact form / email to library | Acknowledge 3 working days | Unpublish (archive status — reversible, audited) pending review; DIR decides outcome; record in incident folder |
| Research-resource takedown (author/institution request) | Same | Same | Verify requester identity/authority → archive or restrict → note reason in `review_note` |
| Incorrect metadata report | Contact form | 10 working days | Librarian fixes via edit forms (versioned); if disputed, DIR arbitrates; reporter notified |
| Privacy/data request (access, deletion) | Email | 30 days | §3; identity verification first |

Archived ≠ deleted: archived records keep their history and can be restored
(status workflow); true deletion is reserved for legal requirements and is
audit-logged.

## 5. Public vs private resources

- Public = `status='published'` (and for files, served through the logged
  download proxy). Everything else is private to the admin panel.
- Authoritative external surfaces (OAI-PMH, `/api/export`) additionally
  require librarian verification — see `METADATA-EXPORTS.md` §gating.
- OAI additionally requires an open license (redistribution implied).
- RLS is the backstop: every table's policy is documented in
  `RLS-MATRIX.md` and probed by `lib/rls.test.ts`.

## 6. Access review

Quarterly (RUNBOOKS §M12): every staff+ account justified, MFA verified,
departures offboarded same-day (§M17), sign-off by DIR filed in the shared
drive. The `admin_audit_log` + `content_versions` trail makes every
privileged change attributable in between reviews.

## 7. Alignment duty

Any change to what the site collects, keeps, or exposes MUST update, in the
same change: this file, the public privacy text, and the enforcement
(migration/cron). The reviewer checklist for such PRs is those three boxes.
