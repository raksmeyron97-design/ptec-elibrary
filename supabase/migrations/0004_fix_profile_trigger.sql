CREATE OR REPLACE FUNCTION prevent_role_update() RETURNS trigger AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Allow bypass if auth.uid() is null (meaning it's a Service Role or Superuser)
    IF auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Unauthorized to change roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
