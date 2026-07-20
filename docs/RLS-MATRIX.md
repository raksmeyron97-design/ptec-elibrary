# Supabase RLS & Authorization Matrix

_Audited 2026-07-11 against the migration history (squashed baseline + 0053–0084)
and verified behaviorally against the hosted database (`lib/rls.test.ts`)._

## Role model

DB role helpers (SECURITY DEFINER, read `profiles.role` for `auth.uid()`):

| Helper | True for roles |
|---|---|
| `is_staff()` | staff, librarian, admin, super_admin |
| `is_librarian()` | librarian, admin, super_admin |
| `is_admin()` | admin, super_admin |
| `is_super_admin_role()` | super_admin |

PostgREST clients: `anon` (no session), `authenticated` (any signed-in user —
role differentiation happens **inside policies** via the helpers above, not
via separate Postgres roles), `service_role` (bypasses RLS entirely).

**Server-side enforcement**: every admin Server Action calls a guard from
`lib/auth-guards.ts` (`requireStaff/Librarian/Admin/SuperAdmin`,
`requirePermission(resource, level)`) before using `createServiceClient()`.
The service key exists only in server env (`SUPABASE_SERVICE_ROLE_KEY`, never
`NEXT_PUBLIC_`); `lib/supabase/server.ts` imports `server-only`. Admin panel
access additionally requires MFA/AAL2 (`app/(admin)/admin/(protected)/layout.tsx`).
High-impact admin actions are audit-logged to `admin_audit_log` via
`app/actions/audit.ts`.

## Matrix

Legend: ✅ allowed · own = only rows where `user_id = auth.uid()` ·
pub = only rows with `is_published = true` (or equivalent) · svc = service-role
only (RLS enabled, no client policies — PostgREST returns zero rows / 42501).

### Content (public catalog)

| Table | anon SELECT | auth SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| books | pub | pub (+all if admin) | admin | admin | admin |
| book_files | pub (via parent book) | same | admin | admin | admin |
| catalog_books | ✅ all | ✅ all | admin | admin | admin |
| catalog_copies | ✅ all | ✅ all | admin | admin | admin |
| research_reports (theses) | pub | pub (+all if admin) | admin | admin | admin |
| publications (+authors/affiliations/authorships/files) | pub | pub (+admin) | svc | svc | svc |
| posts | pub ∧ visibility≠admin_only | same (+admin) | admin | admin | admin |
| learning_paths / modules / steps | pub | pub (+librarian all) | librarian | librarian | librarian |
| authors, categories, departments | ✅ all | ✅ all | admin | admin | admin |
| research_programs / faculties / cohorts / academic_years | ✅ all | ✅ all | admin | admin | admin |
| team_sections | ✅ all | ✅ all | svc | svc | svc |
| team_members | svc (0071 closed anon; page reads via service role) | admin | svc/admin | svc/admin | svc/admin |

### User-private data (owner-scoped)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | own (+admin all) | — (signup trigger) | own, **columns full_name+avatar_url only** (grant) | — |
| saved_books | own | own | — | own |
| reading_progress | own | own | own | own |
| reading_lists | own + public lists | own | own | own |
| reading_list_books | own-list + public-list read | own-list | own-list | own-list |
| book_notes / book_annotations | own (ALL policy) | own | own | own |
| reviews | ✅ everyone | own | own | own |
| publication_reviews | pub-parent | own | own | own |
| post_likes / post_saves | own | own | — | own |
| comment_likes | ✅ everyone | own | — | own or admin |
| post_comments | non-deleted (everyone) | own (authed) | own body | own or admin |
| content_subscriptions | own | own | own | own |
| push_subscriptions | own (0081) | own | own | own |
| learning_path_enrollments / step_progress | own | own | own | own |
| book_requests | own (+service) | own | svc | svc |
| ai_usage | own read | svc | svc | svc |
| notification_reads | own | own | — | — |
| notifications | broadcast rows (authed) + admin all | svc | svc | svc |

### Logs, analytics & ops (service-role only unless noted)

| Table | Client access |
|---|---|
| download_logs | own INSERT+SELECT; admin SELECT all |
| view_logs | own SELECT; admin SELECT/DELETE; svc INSERT |
| search_queries | **svc only — RLS added in 0084** (live DB already enforced via dashboard; fresh envs were exposed before 0084) |
| search_result_clicks | svc |
| rate_limit | no RLS, but ALL revoked from anon/authenticated (42501 verified) |
| contact_messages / notes / replies / drafts / audit_logs / rate_limit | svc (RLS enabled, no policies) |
| admin_audit_log | admin SELECT/INSERT; svc |
| daily_content_views / downloads / user_signups | admin SELECT; svc write |
| file_health | librarian |
| role_permissions | admin SELECT; svc write |
| post_drafts / thesis_drafts | admin (ALL) |
| book_pages / book_chunks | svc (RLS enabled, no policies) |
| announcements / announcement_delivery_jobs / announcement_push_deliveries / announcement_status_history / announcement_templates | svc only — RLS enabled, no anon/authenticated policies (0100). All reads/writes go through admin Server Actions (`requirePermission("announcements"\|"announcements_push", ...)`) and the `/api/cron/publish-scheduled` sweep, both service-role. Public banner reads go through a separate cached service-role helper (`lib/announcements-public.ts`), never client-side. |

## Key protections verified

- **No role self-elevation**: `authenticated` UPDATE on `profiles` is revoked
  and re-granted for `full_name, avatar_url` **only**; the
  `tr_prevent_role_update` trigger is defence-in-depth on top.
- **No client-provided identity**: server actions derive `user_id` from the
  session (`auth.getUser()`), never from form input (audited 2026-07-07).
- **Service key containment**: `createServiceClient` is server-only; grep for
  `SUPABASE_SERVICE_ROLE_KEY` shows no `NEXT_PUBLIC_` leakage; the browser
  bundle only ever sees the anon key.
- **Storage**: files live in Zima Storage/R2 behind server routes
  (`/api/books/[slug]/download`, `/api/theses/[id]/file`) — download
  authorization + logging happen server-side; Supabase Storage buckets are
  not used for book files (avatars use Vercel Blob).

## Findings from this audit (2026-07-11)

1. **search_queries had no RLS in the migration history** (0058). Live DB was
   already protected (dashboard drift — anon saw 0/257 rows), but a fresh
   environment built from migrations would expose raw search terms to anon
   read/write. Fixed: migration **0084** (`ENABLE ROW LEVEL SECURITY` +
   `REVOKE ALL … FROM public, anon, authenticated`). **Pending apply** —
   safe anytime, no app change needed.
2. Everything else in the behavioral probe suite passed on the first run:
   17 sensitive tables expose zero rows to anon, 8 content tables reject
   anon inserts with 42501, `rate_limit` is grant-denied.

## Automated tests

`lib/rls.test.ts` — opt-in behavioral probes against a real instance:

```bash
set -a; source .env; set +a
RLS_PROBE=1 npx vitest run lib/rls.test.ts          # anon-level matrix
RLS_PROBE=1 RLS_PROBE_USER_JWT=<jwt> npx vitest run lib/rls.test.ts  # + authed
```

Design guarantees the suite is production-safe: reads only, plus
write-denial probes that POST an **empty object** — the request is either
rejected by RLS/grants (42501, pass) or by NOT NULL constraints (fail →
flags a real gap); no row can ever be created.

### Minting a probe JWT (authenticated-reader tests)

On a **staging/local** instance, or with a throwaway account on production:
1. `POST {SUPABASE_URL}/auth/v1/admin/generate_link` (service key) with
   `{"type":"magiclink","email":"<probe user>"}` → returns `token_hash`.
2. `POST {SUPABASE_URL}/auth/v1/verify` (anon key) with
   `{"type":"magiclink","token_hash":"…"}` → returns `access_token`.
3. Export it as `RLS_PROBE_USER_JWT`. Delete the throwaway user afterwards.

Role-differentiated cases (staff/librarian/admin/suspended) exercise the
same policies through `is_*()` helpers; test them on staging by setting the
probe user's `profiles.role` and re-running — never mutate roles on
production for testing.

## Maintenance rule

Every migration that `CREATE TABLE`s in `public` MUST either
`ENABLE ROW LEVEL SECURITY` (+ policies) or `REVOKE ALL … FROM public, anon,
authenticated` in the same file. "Only server code touches it" is not a
protection — PostgREST exposes all public-schema tables by default.
