-- 0079_contact_inbox_workflow.sql
-- Adds delivery-state tracking, retry support, internal notes, drafts, and
-- contact-specific audit rows for the admin contact inbox.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typnamespace = 'public'::regnamespace
      and t.typname = 'contact_status'
      and e.enumlabel = 'pending_reply'
  ) then
    alter type public.contact_status add value 'pending_reply';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typnamespace = 'public'::regnamespace
      and t.typname = 'contact_status'
      and e.enumlabel = 'email_failed'
  ) then
    alter type public.contact_status add value 'email_failed';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'contact_email_status'
  ) then
    create type public.contact_email_status as enum ('pending', 'sent', 'failed');
  end if;
end $$;

alter table public.contact_messages
  add column if not exists admin_notification_status public.contact_email_status not null default 'pending',
  add column if not exists user_confirmation_status public.contact_email_status not null default 'pending',
  add column if not exists last_reply_status public.contact_email_status,
  add column if not exists last_email_error text,
  add column if not exists last_email_attempt_at timestamptz;

update public.contact_messages
set admin_notification_status = 'sent'
where admin_notification_status = 'pending';

update public.contact_messages
set user_confirmation_status = case when confirmation_sent then 'sent'::public.contact_email_status else 'failed'::public.contact_email_status end
where user_confirmation_status = 'pending';

alter table public.contact_replies
  add column if not exists subject text,
  add column if not exists delivery_status public.contact_email_status not null default 'pending',
  add column if not exists email_error text,
  add column if not exists last_attempt_at timestamptz;

update public.contact_replies r
set subject = 'Re: ' || m.subject
from public.contact_messages m
where r.contact_message_id = m.id
  and (r.subject is null or btrim(r.subject) = '');

alter table public.contact_replies
  alter column subject set default '',
  alter column subject set not null;

update public.contact_replies
set delivery_status = case
    when gmail_message_id is not null and sent_at is not null then 'sent'::public.contact_email_status
    else 'failed'::public.contact_email_status
  end,
  last_attempt_at = coalesce(sent_at, created_at),
  email_error = case when gmail_message_id is null then 'Email was not sent before delivery tracking was added.' else email_error end
where delivery_status = 'pending';

update public.contact_messages m
set last_reply_status = latest.delivery_status,
    last_reply_at = latest.sent_at,
    last_email_attempt_at = latest.last_attempt_at,
    last_email_error = case when latest.delivery_status = 'failed' then latest.email_error else last_email_error end
from (
  select distinct on (contact_message_id)
    contact_message_id,
    delivery_status,
    sent_at,
    last_attempt_at,
    email_error
  from public.contact_replies
  order by contact_message_id, created_at desc
) latest
where latest.contact_message_id = m.id
  and m.last_reply_status is null;

create table if not exists public.contact_notes (
  id                 uuid        primary key default gen_random_uuid(),
  contact_message_id uuid        not null references public.contact_messages(id) on delete cascade,
  admin_id           uuid        references public.profiles(id) on delete set null,
  admin_name         text        not null,
  note_body          text        not null,
  created_at         timestamptz not null default now()
);

create table if not exists public.contact_reply_drafts (
  id                 uuid        primary key default gen_random_uuid(),
  contact_message_id uuid        not null references public.contact_messages(id) on delete cascade,
  admin_id           uuid        not null references public.profiles(id) on delete cascade,
  subject            text        not null default '',
  reply_body         text        not null default '',
  cc                 text,
  bcc                text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (contact_message_id, admin_id)
);

drop trigger if exists contact_reply_drafts_set_updated_at on public.contact_reply_drafts;
create trigger contact_reply_drafts_set_updated_at
  before update on public.contact_reply_drafts
  for each row execute function public.set_updated_at();

create table if not exists public.contact_audit_logs (
  id                 uuid        primary key default gen_random_uuid(),
  contact_message_id uuid        references public.contact_messages(id) on delete set null,
  admin_id           uuid        references public.profiles(id) on delete set null,
  action             text        not null,
  old_value          jsonb,
  new_value          jsonb,
  metadata           jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists contact_messages_priority_idx
  on public.contact_messages (priority);
create index if not exists contact_messages_delivery_idx
  on public.contact_messages (admin_notification_status, user_confirmation_status, last_reply_status);
create index if not exists contact_messages_subject_trgm_idx
  on public.contact_messages using gin (subject gin_trgm_ops);
create index if not exists contact_messages_message_trgm_idx
  on public.contact_messages using gin (message gin_trgm_ops);
create index if not exists contact_messages_name_trgm_idx
  on public.contact_messages using gin (name gin_trgm_ops);
create index if not exists contact_messages_email_trgm_idx
  on public.contact_messages using gin (email gin_trgm_ops);
create index if not exists contact_messages_phone_trgm_idx
  on public.contact_messages using gin (phone gin_trgm_ops);
create index if not exists contact_replies_delivery_idx
  on public.contact_replies (contact_message_id, delivery_status);
create index if not exists contact_notes_message_id_idx
  on public.contact_notes (contact_message_id, created_at);
create index if not exists contact_audit_logs_message_id_idx
  on public.contact_audit_logs (contact_message_id, created_at desc);

alter table public.contact_notes enable row level security;
alter table public.contact_reply_drafts enable row level security;
alter table public.contact_audit_logs enable row level security;
-- No policies: contact inbox data stays service-role only, matching
-- contact_messages/contact_replies. Server Actions enforce admin permission.
