-- 0096_catalog_import_jobs.sql
-- Import-job history for the catalog CSV import wizard.
--
-- One row per import run: who imported what, when, with which options, and
-- the final counts. Used for the duplicate-submission guard (same admin +
-- same source hash within a window) and as durable import history alongside
-- admin_audit_log entries (catalogImportStarted / Completed / Failed /
-- Cancelled).
--
-- The application is pre-migration-safe: when this table is missing the
-- import still runs (fully audited via admin_audit_log); only history rows
-- and the cross-session duplicate-submission guard degrade.
--
-- Data hygiene: no CSV content is stored — only the file name, a SHA-256
-- source hash, options and counters.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.catalog_import_jobs (
  id               uuid PRIMARY KEY,
  requested_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_file_name text,
  source_type      text NOT NULL DEFAULT 'file' CHECK (source_type IN ('file', 'paste')),
  source_hash      text NOT NULL,
  status           text NOT NULL DEFAULT 'processing'
                   CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
  total_rows       integer NOT NULL DEFAULT 0,
  created_count    integer NOT NULL DEFAULT 0,
  updated_count    integer NOT NULL DEFAULT 0,
  copies_created   integer NOT NULL DEFAULT 0,
  skipped_count    integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,
  excluded_count   integer NOT NULL DEFAULT 0,
  options          jsonb,
  created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_catalog_import_jobs_admin_hash
  ON public.catalog_import_jobs (requested_by, source_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_import_jobs_created
  ON public.catalog_import_jobs (created_at DESC);

-- Service-role only (RLS rule for new tables — PostgREST exposes public
-- tables by default). Reads/writes go through server actions that already
-- enforce requirePermission("books", "write").
ALTER TABLE public.catalog_import_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_import_jobs FROM public, anon, authenticated;
