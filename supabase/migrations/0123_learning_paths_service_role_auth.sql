-- Migration 0123: Allow service_role to execute replace_learning_path_curriculum
-- Fixes "not authorized" error when saving learning paths via Server Actions using createServiceClient().

create or replace function public.replace_learning_path_curriculum(
  p_path_id uuid,
  p_modules jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m            jsonb;
  s            jsonb;
  v_module_id  uuid;
  m_idx        int := 0;
  s_idx        int := 0;
begin
  -- Allow service_role (used by server actions via createServiceClient) or users with librarian+ role
  if auth.role() <> 'service_role' and not public.is_librarian() then
    raise exception 'not authorized';
  end if;

  delete from public.learning_path_modules where path_id = p_path_id;

  for m in select * from jsonb_array_elements(coalesce(p_modules, '[]'::jsonb))
  loop
    insert into public.learning_path_modules (path_id, title, title_km, description, description_km, position)
    values (
      p_path_id,
      m->>'title',
      nullif(m->>'title_km', ''),
      nullif(m->>'description', ''),
      nullif(m->>'description_km', ''),
      m_idx
    )
    returning id into v_module_id;

    s_idx := 0;
    for s in select * from jsonb_array_elements(coalesce(m->'steps', '[]'::jsonb))
    loop
      insert into public.learning_path_steps (
        module_id, resource_type, resource_id, resource_title, external_url,
        instruction, instruction_km, est_minutes, is_required, position
      )
      values (
        v_module_id,
        s->>'resource_type',
        case when (s->>'resource_id') is null or (s->>'resource_id') = '' then null else (s->>'resource_id')::uuid end,
        nullif(s->>'resource_title', ''),
        nullif(s->>'external_url', ''),
        nullif(s->>'instruction', ''),
        nullif(s->>'instruction_km', ''),
        case when (s->>'est_minutes') is null or (s->>'est_minutes') = '' then null else (s->>'est_minutes')::int end,
        coalesce((s->>'is_required')::boolean, true),
        s_idx
      );
      s_idx := s_idx + 1;
    end loop;

    m_idx := m_idx + 1;
  end loop;
end;
$$;

revoke all on function public.replace_learning_path_curriculum(uuid, jsonb) from public, anon;
grant execute on function public.replace_learning_path_curriculum(uuid, jsonb) to authenticated, service_role;
