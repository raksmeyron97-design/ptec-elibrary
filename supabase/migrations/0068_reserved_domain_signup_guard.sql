-- 0068: Enforce the reserved-admin-domain signup rule at the database layer.
--
-- Background: app/actions/auth.ts:verifySignup() deletes public signups that
-- use a reserved admin domain, but it only runs if the client calls it after
-- signup — a direct API call to Supabase Auth skips it entirely. This trigger
-- closes that gap where it cannot be bypassed.
--
-- What is BLOCKED:   public email/password signups (provider = 'email',
--                    unconfirmed at insert, not invited) whose email ends with
--                    a reserved admin domain.
-- What is ALLOWED:   • accounts created by an admin / the Supabase dashboard
--                      (inserted with email_confirmed_at already set)
--                    • invited users (invited_at set)
--                    • OAuth signups (provider != 'email') — a Google user who
--                      actually owns a @ptec.edu.kh mailbox may sign in; they
--                      still start as role 'reader'.
--
-- Note: GoTrue surfaces a trigger exception to the client as a generic
-- "Database error saving new user". The signup UI pre-checks the domain and
-- shows a friendly message before ever calling signUp, so real users never
-- see the generic error — only direct-API bypass attempts do.

create or replace function public.block_reserved_domain_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_domains constant text[] := array[
    '@ptec.edu.kh',
    '@admin.ptec.edu.kh',
    '@ptec-admin.edu.kh'
  ];
  d text;
begin
  -- Only self-service email/password signups are in scope.
  if coalesce(new.raw_app_meta_data->>'provider', '') <> 'email' then
    return new;
  end if;
  if new.email_confirmed_at is not null or new.invited_at is not null then
    return new;
  end if;

  foreach d in array reserved_domains loop
    if lower(coalesce(new.email, '')) like '%' || d then
      raise exception 'Signup with a reserved admin domain is not permitted.'
        using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

-- The insert into auth.users is performed by the supabase_auth_admin role.
grant execute on function public.block_reserved_domain_signup() to supabase_auth_admin;

drop trigger if exists trg_block_reserved_domain_signup on auth.users;
create trigger trg_block_reserved_domain_signup
  before insert on auth.users
  for each row
  execute function public.block_reserved_domain_signup();

comment on function public.block_reserved_domain_signup() is
  'Blocks public email/password signups using reserved admin email domains. See migration 0068.';
