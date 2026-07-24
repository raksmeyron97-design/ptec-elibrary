-- 0104_organizations_foundation.sql
-- Multi-tenant readiness (targeted-consolidation Phase 1 of the canonical
-- resource work — see docs/CANONICAL-RESOURCES.md).
--
-- Context: every resource in this schema is implicitly owned by PTEC — there
-- is no organization concept anywhere (grep for organization_id returns
-- nothing before this migration). This migration introduces a single
-- `organizations` table, seeds PTEC as the default, and stamps an
-- organization_id onto the core resource tables so the data model is
-- STRUCTURALLY ready for a second institution without a rewrite.
--
-- Deliberate scope limits (this is readiness, not activation):
--   * Existing RLS is NOT rewritten to be org-scoped. There is exactly one
--     org today, so org-scoping every one of the 100+ existing policies would
--     be pure risk for zero behavioural change. When a second org is onboarded,
--     add org predicates to the write policies in a focused follow-up — the
--     column they need already exists after this migration.
--   * The column defaults to the single default org via
--     default_organization_id(), so every existing INSERT path in the app
--     keeps working untouched (no app change required to apply this).
--
-- Idempotent: safe to re-run. Additive only — no destructive statements.

-- ── 1. organizations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        UNIQUE NOT NULL,
  name       text        NOT NULL,
  name_km    text,
  is_default boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- At most one default organization (the tenant fallback for un-scoped rows).
CREATE UNIQUE INDEX IF NOT EXISTS ux_organizations_single_default
  ON public.organizations (is_default) WHERE is_default;

-- Seed PTEC as the default tenant. Name is the documented fallback; the live
-- display name still comes from System Settings (getSiteConfig()), this is
-- only the tenant identity row.
INSERT INTO public.organizations (slug, name, is_default)
VALUES ('ptec', 'Phnom Penh Teacher Education College', true)
ON CONFLICT (slug) DO NOTHING;

-- Resolve the default tenant. STABLE + reads a table → legal in a column
-- DEFAULT and inlinable by the planner. SECURITY DEFINER so it resolves the
-- same for anon (used only as a DEFAULT, never returns row detail).
CREATE OR REPLACE FUNCTION public.default_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.organizations WHERE is_default LIMIT 1;
$$;

-- ── 2. RLS: organization identity is public, writes are super-admin only ─────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view organizations"        ON public.organizations;
DROP POLICY IF EXISTS "Super admins can manage organizations" ON public.organizations;

CREATE POLICY "Public can view organizations"
  ON public.organizations FOR SELECT USING (true);
CREATE POLICY "Super admins can manage organizations"
  ON public.organizations FOR ALL
  USING (public.is_super_admin_role())
  WITH CHECK (public.is_super_admin_role());

GRANT SELECT ON public.organizations TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_organizations_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_organizations_touch ON public.organizations;
CREATE TRIGGER trg_organizations_touch
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_organizations_updated_at();

-- ── 3. Stamp organization_id onto the core resource tables ───────────────────
-- Pattern per table: add nullable → backfill to default → default expression →
-- NOT NULL → index. Backfilling before NOT NULL guarantees no existing row
-- violates it; the DEFAULT guarantees future app inserts don't have to know
-- about the column.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'books', 'research_reports', 'publications',
    'catalog_books', 'learning_paths', 'posts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)',
      t);
    EXECUTE format(
      'UPDATE public.%I SET organization_id = public.default_organization_id() WHERE organization_id IS NULL',
      t);
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.default_organization_id()',
      t);
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL',
      t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_organization ON public.%I (organization_id)',
      t, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.organizations IS
  'Tenant identity. One row today (PTEC, is_default). organization_id on the resource tables references this; existing RLS is single-tenant and is org-scoped only when a second tenant is onboarded. See docs/CANONICAL-RESOURCES.md.';
