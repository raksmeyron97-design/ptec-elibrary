-- STEP 1: Enable RLS on all relevant tables
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_books ENABLE ROW LEVEL SECURITY;

-- 1. books
CREATE POLICY "Public can view published books" ON books FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all books" ON books FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can insert books" ON books FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update books" ON books FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can delete books" ON books FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 2. book_files
CREATE POLICY "Authenticated users can view book files" ON book_files FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage book files" ON book_files FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 3. profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (
  id = auth.uid() 
);

-- Drop any existing trigger to prevent errors
DROP TRIGGER IF EXISTS tr_prevent_role_update ON profiles;
DROP FUNCTION IF EXISTS prevent_role_update();

-- Create trigger to enforce role update restrictions at DB level
CREATE OR REPLACE FUNCTION prevent_role_update() RETURNS trigger AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Cannot update own role';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_prevent_role_update BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_update();

-- 4. download_logs
CREATE POLICY "Authenticated users can insert download logs" ON download_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own download logs" ON download_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all download logs" ON download_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 5. posts
CREATE POLICY "Public can view published posts" ON posts FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all posts" ON posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can manage posts" ON posts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 6. saved_books, reviews, reading_progress
CREATE POLICY "Users can manage own saved_books" ON saved_books FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage own reviews" ON reviews FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage own reading_progress" ON reading_progress FOR ALL USING (user_id = auth.uid());

-- 7. catalog_books
CREATE POLICY "Public can view catalog books" ON catalog_books FOR SELECT USING (true);
CREATE POLICY "Admins can manage catalog books" ON catalog_books FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
