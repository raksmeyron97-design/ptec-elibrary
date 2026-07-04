-- 0012_secure_profiles.sql
-- Revert the overly permissive public profiles policy introduced in 0008.
-- The application uses the service role key to fetch profiles for reviews on the server side,
-- so public access to the profiles table is not needed and poses a data scraping risk.

DROP POLICY IF EXISTS "Public can view profiles" ON profiles;

-- Ensure that the users can still view their own profiles
-- (This policy was created in 0002_rls.sql but we redefine it just to be safe if it was dropped)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (id = auth.uid());
