CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  role text DEFAULT 'user'
);

CREATE TABLE authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  bio text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  author_id uuid REFERENCES authors(id),
  category_id uuid REFERENCES categories(id),
  department text,
  isbn text,
  language text,
  published_at date,
  is_published boolean DEFAULT false,
  rating numeric DEFAULT 5,
  pages integer DEFAULT 1,
  cover_color text,
  cover_url text,
  download_count integer DEFAULT 0,
  view_count integer DEFAULT 0,
  tags text[],
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE book_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  format text NOT NULL,
  file_url text,
  file_size_kb integer,
  download_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE download_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  downloaded_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  content text,
  cover_image text,
  is_published boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE saved_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, book_id)
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  content text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, book_id)
);

CREATE TABLE reading_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  progress_pct integer DEFAULT 0,
  last_read_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, book_id)
);

CREATE TABLE catalog_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  isbn text,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE catalog_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_book_id uuid REFERENCES catalog_books(id) ON DELETE CASCADE,
  status text DEFAULT 'available',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- RPCs
CREATE OR REPLACE FUNCTION increment_download_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE books SET download_count = download_count + 1 WHERE id = row_id;
  UPDATE book_files SET download_count = download_count + 1 WHERE book_id = row_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_view_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE books SET view_count = view_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;
