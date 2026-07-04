-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Add embedding column to books table (Gemini text-embedding-004 uses 768 dimensions)
alter table books add column if not exists embedding vector(768);

-- 3. Create a function to search books by cosine similarity
create or replace function match_books (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  slug text,
  title text,
  cover_url text,
  description text,
  department text,
  language text,
  author_name text,
  category_name text,
  similarity float
)
language sql stable
as $$
  select
    b.id,
    b.slug,
    b.title,
    b.cover_url,
    b.description,
    b.department,
    b.language,
    a.name as author_name,
    c.name as category_name,
    1 - (b.embedding <=> query_embedding) as similarity
  from books b
  left join authors a on b.author_id = a.id
  left join categories c on b.category_id = c.id
  where b.is_published = true
    and 1 - (b.embedding <=> query_embedding) > match_threshold
  order by b.embedding <=> query_embedding
  limit match_count;
$$;

-- 4. Create an index for faster searching
create index on books using ivfflat (embedding vector_cosine_ops)
with (lists = 100);