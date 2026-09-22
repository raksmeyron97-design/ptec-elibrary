-- ─────────────────────────────────────────────────────────────────────────────
-- 0152 — the identity provider's photo reaches public.profiles
--
-- Google sign-in is how most PTEC readers create an account, and a Google
-- account always carries a photo. `handle_new_user()` copied only id, email and
-- full_name out of `raw_user_meta_data`, so `profiles.avatar_url` was NULL for
-- every one of them and `/admin/users` drew initials for the whole directory.
--
-- The read paths now fall back to auth metadata (lib/auth/oauth-avatar.ts), but
-- the surfaces that JOIN the profile row for OTHER people — review lists, the
-- admin activity log, the mobile nav — have no metadata to fall back to. This
-- migration is what fills the column for them.
--
-- WHY THE HOST CHECK IS HERE AND NOT ONLY IN TYPESCRIPT: `signUp()` runs in the
-- browser and GoTrue's public endpoint stores whatever `options.data` carries,
-- so `raw_user_meta_data->>'avatar_url'` is NOT necessarily something an
-- identity provider wrote. A trigger that copied it unconditionally would let
-- any self-registered account write an arbitrary URL into a column the rest of
-- the app treats as trusted — laundering exactly the value the application
-- layer refuses. The same reasoning the 0019 comment applies to `role`.
--
-- The check is deliberately a SHORT HOST ALLOW-LIST rather than a copy of the
-- TypeScript rule: reproducing application logic in PL/pgSQL is how the two
-- drift (see 0130's note on `normalizeTitle()`). Keeping it conservative means
-- the worst drift is a photo the trigger declines and the runtime fallback
-- still displays.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── the allow-list ───────────────────────────────────────────────────────────
-- Google serves avatars from a rotating shard (lh3, lh4, lh5, avatars…), so the
-- Google host is matched by suffix; GitHub's is a single host.
CREATE OR REPLACE FUNCTION public.provider_avatar_url(url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- `~*`, not `~`: the TypeScript rule lower-cases the hostname before it
  -- matches, and a host is case-insensitive. A case-sensitive check here would
  -- decline a photo the application then displays anyway — a gap with no
  -- purpose.
  SELECT CASE
    WHEN url ~* '^https://([a-z0-9-]+\.)*googleusercontent\.com/[^[:space:]]*$' THEN url
    WHEN url ~* '^https://avatars\.githubusercontent\.com/[^[:space:]]*$'       THEN url
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.provider_avatar_url(text) IS
  'An avatar URL an identity provider published, or NULL. See 0152.';

-- PostgREST exposes every public-schema function as an RPC. Nothing outside the
-- trigger and the backfill below calls this one.
REVOKE ALL ON FUNCTION public.provider_avatar_url(text) FROM public, anon, authenticated;

-- ── trigger: new accounts arrive with their photo ────────────────────────────
-- Unchanged from 0019 except for avatar_url: role STILL must default to
-- 'reader' from the column default and MUST NOT be read from
-- raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    -- Each key is judged on its own: a junk `avatar_url` must not shadow a real
    -- `picture`, which is the shape Google writes when a photo changes.
    COALESCE(
      public.provider_avatar_url(NEW.raw_user_meta_data->>'avatar_url'),
      public.provider_avatar_url(NEW.raw_user_meta_data->>'picture')
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- The trigger itself is unchanged; recreated so a database that somehow lost it
-- comes back consistent.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── backfill: the accounts that already exist ────────────────────────────────
-- Only rows with NOTHING stored are touched. An uploaded avatar is a deliberate
-- choice and is never overwritten by a migration; refreshing our own earlier
-- copy is the running application's job, not a one-shot.
UPDATE public.profiles p
SET avatar_url = v.url
FROM (
  SELECT
    u.id,
    COALESCE(
      public.provider_avatar_url(u.raw_user_meta_data->>'avatar_url'),
      public.provider_avatar_url(u.raw_user_meta_data->>'picture')
    ) AS url
  FROM auth.users u
) v
WHERE p.id = v.id
  AND v.url IS NOT NULL
  AND NULLIF(TRIM(p.avatar_url), '') IS NULL;

-- A name the trigger wrote as '' (0019 writes the empty string when it finds
-- neither key) is not a name. Same precedence as `preferStored()`.
UPDATE public.profiles p
SET full_name = v.name
FROM (
  SELECT
    u.id,
    NULLIF(TRIM(COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      ''
    )), '') AS name
  FROM auth.users u
) v
WHERE p.id = v.id
  AND v.name IS NOT NULL
  AND NULLIF(TRIM(p.full_name), '') IS NULL;
