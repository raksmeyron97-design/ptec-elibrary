# System Settings Platform

`/admin/system-settings` is the single source of truth for global website and
institution information: organization names, contact details, address, opening
hours, social/map links, and SEO defaults. It replaces the hard-coded values
that lived in `lib/ptec.ts` (which now serves only as the documented fallback
and seed source).

## Architecture

```
supabase/migrations/0098_system_settings.sql   tables + RLS + seed + permission
lib/system-settings/
  types.ts       section documents, SiteConfig, workspace shapes (client-safe)
  defaults.ts    code fallbacks — mirror lib/ptec.ts and the migration seed
  schemas.ts     dependency-free validators + normalizers + diffPaths
  hours.ts       pure derivations: spec, EN/KM sentences, closures
  map.ts         buildSiteConfig() — the PUBLIC ALLOWLIST mapper
  config.ts      getSiteConfig() — cached published config (server-only)
  admin.ts       getSettingsWorkspace() — admin read model (server-only)
app/actions/system-settings.ts                 save draft / discard / publish / rollback
app/(admin)/admin/(protected)/system-settings/ admin page
components/admin/system-settings/              workspace UI
```

### Database

- `site_settings` — one row per section (`organization`, `contact`, `hours`,
  `links`, `seo`). `draft` (never public) and `published` live side by side
  with `published_version` and editor/timestamps.
- `site_setting_versions` — immutable history; every publish/rollback appends
  a row (`action`, `changed_fields`, `comment`, `restored_from`). Rollback
  never deletes history — it publishes an old snapshot as a NEW version.
- RLS: both tables are service-role only (`revoke all from public, anon,
  authenticated`). Public reads go exclusively through the allowlist mapper.

### Reading configuration

Server code calls `getSiteConfig()` (cached under the `site-config` tag,
no cookies/headers → prerendered pages stay static). Client components receive
the values **via props** from their server parents (see `MobileMenu`,
`LibraryNow`, `PostsListClient`, `ContactClient`). Never query the settings
tables directly and never return raw rows to a client.

Failure model: table missing (migration pending) or unreachable → the config
is built from `lib/system-settings/defaults.ts`, which byte-matches the
pre-settings site (pinned by the parity tests in
`lib/system-settings/system-settings.test.ts`). A single invalid stored
section falls back alone; the rest still apply.

### Workflow

Draft → Validate → Publish → History/Rollback.

- **Save draft** — validates + normalizes (phones, URLs, hours), stores in
  `draft`. Public site unchanged; no cache invalidation.
- **Publish** — re-validates the draft server-side, optimistic-concurrency
  guarded (`expectedVersion`), bumps `published_version`, appends a version
  row with the changed field paths and optional comment, writes an
  `admin_audit_log` entry, then calls `revalidateSiteConfig()`.
- **Rollback** — restores a version snapshot (re-validated against the current
  schema) as a new version (`action = 'rollback'`), audited + revalidated.

### Cache invalidation

`revalidateSiteConfig()` in `lib/cache/revalidate.ts` busts the `site-config`
tag and both locale layout trees (`/en`, `/km`) — justified because the navbar
and footer render contact data on every public page. Saving a draft never
invalidates anything.

### Permissions

New `settings` resource in the `role_permissions` matrix (and
`DEFAULT_PERMISSIONS`): `admin`/`super_admin` = write, everyone else = none.
The page checks `requirePermission("settings", "read")`; every server action
re-checks `write`. The sidebar entry (Administration → System Settings) is
visibility only — never the enforcement layer.

### Validation & security

- Hand-rolled validators (project convention, no schema library) collect all
  field errors with dot-paths; the admin forms reuse them client-side, but the
  server-action run is authoritative.
- URLs must be `https://` (rejects `javascript:`, `data:`, `http:`); the map
  embed must be a `https://www.google.com/maps/embed…` URL — admins can never
  inject iframe HTML or scripts.
- Cambodian phone numbers are normalized (`+855…`/local → `0XX XXX XXX`);
  `tel:` and international display formats are derived, never typed.
- Hours are structured (per-day intervals + dated closures) and validated
  (HH:MM, close > open, no overlaps, ≥ 1 open day). All open/closed logic
  runs in `Asia/Phnom_Penh`, never the visitor's timezone.
- Audit: `settings.draft_saved` / `draft_discarded` / `published` /
  `rolled_back` in `admin_audit_log` (visible in /admin/logs).

## How to add a new setting

1. Add the field to the section document type in `types.ts` (or add a new
   section key to `SETTING_SECTIONS` + migration `check` constraints).
2. Add the code default in `defaults.ts` **and the migration seed** (keep them
   identical — the parity test will catch drift in mapped values).
3. Validate it in `schemas.ts`.
4. Map it (deliberately) in `map.ts` if it is public — unmapped fields never
   reach the site.
5. Add the form control in `components/admin/system-settings/SectionForms.tsx`.
6. Consume it via `getSiteConfig()`.

## Applying the migration

Run `supabase/migrations/0098_system_settings.sql` on the hosted database
(idempotent). Until applied, the admin workspace is read-only with a setup
notice and the site serves code defaults; after applying, editing works with
no deploy needed.

## Known limitations

- The PDF reader's "report broken file" mailto and the navbar/mobile-drawer
  brand lockup text still use code constants (documented in `lib/ptec.ts`) —
  the first is deep in a client component tree, the second is brand identity.
- `messages/{en,km}.json` `aboutHours*` strings are only used by the unused
  `HomeBento` component; the consistency test pins them to the fallback spec.
- Branding assets (logos, favicon, OG image) remain static files under
  `public/` — a future Branding section should reuse `uploadToZima()` with a
  dedicated `branding/` folder gated on `settings:write`.
