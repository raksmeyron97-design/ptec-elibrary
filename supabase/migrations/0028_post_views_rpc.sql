-- 0028_post_views_rpc.sql
-- Atomic post view counter. Replaces a non-atomic read-modify-write in
-- app/actions/posts incrementViews that could lose concurrent increments.

create or replace function public.increment_post_views(p_post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts
  set views = coalesce(views, 0) + 1
  where id = p_post_id;
$$;

-- Posts are public content; view counting may happen for anonymous visitors.
grant execute on function public.increment_post_views(uuid) to anon, authenticated;
