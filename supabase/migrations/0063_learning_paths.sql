-- 0063_learning_paths.sql
-- Teacher Learning Paths (Area 3 of the 2026-07-06 improvement roadmap):
-- curated, ordered curricula of existing resources for PTEC trainees, e.g.
-- "Foundations of Pedagogy" or "Intro to Classroom Action Research".
--
-- path > module > step, where a step points at any existing resource
-- (book/thesis/catalog) or an external URL. Progress is tracked per-user via
-- enrollments + step completions, independent of reading_progress (a step
-- can point at a resource without requiring the PDF reader's own tracking).

create table public.learning_paths (
  id              uuid        primary key default gen_random_uuid(),
  slug            text        unique not null,
  title           text        not null,
  title_km        text,
  description     text,
  description_km  text,
  audience        text,        -- free-text tag, e.g. "Year 1 Trainee", "In-service Teacher"
  cover_url       text,
  is_published    boolean     not null default false,
  position        integer     not null default 0,
  created_by      uuid        references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.learning_path_modules (
  id         uuid        primary key default gen_random_uuid(),
  path_id    uuid        not null references public.learning_paths(id) on delete cascade,
  title      text        not null,
  title_km   text,
  position   integer     not null default 0,
  created_at timestamptz not null default now()
);

create table public.learning_path_steps (
  id              uuid        primary key default gen_random_uuid(),
  module_id       uuid        not null references public.learning_path_modules(id) on delete cascade,
  resource_type   text        not null check (resource_type in ('book', 'research', 'catalog', 'external')),
  resource_id     uuid,        -- FK-by-convention into books/research_reports/catalog_books.id (no formal FK: cross-table polymorphic reference)
  resource_title  text,        -- snapshot of the resource's title at add-time, so a step still reads sensibly if the resource is later deleted
  external_url    text,
  instruction     text,
  instruction_km  text,
  est_minutes     integer,
  position        integer     not null default 0,
  created_at      timestamptz not null default now(),
  check (
    (resource_type = 'external' and external_url is not null)
    or (resource_type <> 'external' and resource_id is not null)
  )
);

create table public.learning_path_enrollments (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  path_id      uuid        not null references public.learning_paths(id) on delete cascade,
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, path_id)
);

create table public.learning_path_step_progress (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  step_id      uuid        not null references public.learning_path_steps(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, step_id)
);

create index learning_path_modules_path_id_idx  on public.learning_path_modules (path_id, position);
create index learning_path_steps_module_id_idx  on public.learning_path_steps (module_id, position);
create index learning_path_enrollments_path_idx on public.learning_path_enrollments (path_id);
create index learning_path_step_progress_step_idx on public.learning_path_step_progress (step_id);

create or replace function public.update_learning_paths_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_learning_paths_updated_at
  before update on public.learning_paths
  for each row execute function public.update_learning_paths_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.learning_paths              enable row level security;
alter table public.learning_path_modules       enable row level security;
alter table public.learning_path_steps         enable row level security;
alter table public.learning_path_enrollments   enable row level security;
alter table public.learning_path_step_progress enable row level security;

create policy "Public can view published paths" on public.learning_paths
  for select using (is_published = true);
create policy "Librarians can view all paths" on public.learning_paths
  for select using (public.is_librarian());
create policy "Librarians can manage paths" on public.learning_paths
  for all using (public.is_librarian());

create policy "Public can view modules of published paths" on public.learning_path_modules
  for select using (
    exists (select 1 from public.learning_paths p where p.id = path_id and p.is_published = true)
  );
create policy "Librarians can view all modules" on public.learning_path_modules
  for select using (public.is_librarian());
create policy "Librarians can manage modules" on public.learning_path_modules
  for all using (public.is_librarian());

create policy "Public can view steps of published paths" on public.learning_path_steps
  for select using (
    exists (
      select 1 from public.learning_path_modules m
      join public.learning_paths p on p.id = m.path_id
      where m.id = module_id and p.is_published = true
    )
  );
create policy "Librarians can view all steps" on public.learning_path_steps
  for select using (public.is_librarian());
create policy "Librarians can manage steps" on public.learning_path_steps
  for all using (public.is_librarian());

create policy "Users can view own enrollments" on public.learning_path_enrollments
  for select using (user_id = auth.uid());
create policy "Users can enroll self" on public.learning_path_enrollments
  for insert with check (user_id = auth.uid());
create policy "Users can update own enrollment" on public.learning_path_enrollments
  for update using (user_id = auth.uid());
create policy "Users can unenroll self" on public.learning_path_enrollments
  for delete using (user_id = auth.uid());

create policy "Users can view own step progress" on public.learning_path_step_progress
  for select using (user_id = auth.uid());
create policy "Users can mark own step progress" on public.learning_path_step_progress
  for insert with check (user_id = auth.uid());
create policy "Users can unmark own step progress" on public.learning_path_step_progress
  for delete using (user_id = auth.uid());

grant select on public.learning_paths, public.learning_path_modules, public.learning_path_steps
  to anon, authenticated;
grant select, insert, update, delete on public.learning_path_enrollments, public.learning_path_step_progress
  to authenticated;
