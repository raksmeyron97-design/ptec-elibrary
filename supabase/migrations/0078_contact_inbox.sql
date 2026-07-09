-- 0078_contact_inbox.sql
-- Gmail-backed contact inbox, replacing the old Telegram-bot /api/contact
-- integration. Messages are persisted here first; admin replies go out
-- through the Gmail API (see lib/gmail.ts) and are logged in
-- contact_replies with the returned gmail_message_id.
--
-- Service-role only (mirrors contact_rate_limit, 0005/0019): the public
-- /api/contact route inserts with the service client, and every admin
-- read/write goes through Server Actions in app/actions/contact-messages.ts
-- that are gated by requirePermission("contact", ...). RLS is enabled with
-- no anon/authenticated policies, so both tables are deny-all outside the
-- service role.

create type public.contact_category as enum (
  'general',
  'book_request',
  'thesis_research',
  'account_problem',
  'technical_problem',
  'other'
);

create type public.contact_status as enum (
  'new',
  'read',
  'replied',
  'closed',
  'spam'
);

create type public.contact_priority as enum (
  'low',
  'normal',
  'high'
);

create table public.contact_messages (
  id                uuid              primary key default gen_random_uuid(),
  name              text              not null,
  email             text              not null,
  phone             text,
  subject           text              not null,
  message           text              not null,
  category          contact_category  not null default 'general',
  status            contact_status    not null default 'new',
  priority          contact_priority  not null default 'normal',
  source            text              not null default 'contact_form',
  ip_address        text,
  user_agent        text,
  -- Set false when the auto-confirmation email to the sender fails to send,
  -- so the admin inbox can surface a warning without losing the message.
  confirmation_sent boolean           not null default true,
  last_reply_at     timestamptz,
  created_at        timestamptz       not null default now(),
  updated_at        timestamptz       not null default now()
);

create table public.contact_replies (
  id                 uuid        primary key default gen_random_uuid(),
  contact_message_id uuid        not null references public.contact_messages(id) on delete cascade,
  admin_id           uuid        references public.profiles(id) on delete set null,
  admin_name         text        not null,
  reply_body         text        not null,
  -- Null when the Gmail send failed; the reply text is still kept so it's
  -- never lost, and the admin can see/retry it.
  gmail_message_id   text,
  sent_to            text        not null,
  cc                 text,
  bcc                text,
  sent_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index contact_messages_status_idx     on public.contact_messages (status);
create index contact_messages_category_idx   on public.contact_messages (category);
create index contact_messages_created_at_idx on public.contact_messages (created_at desc);
create index contact_messages_email_idx      on public.contact_messages (lower(email));
create index contact_replies_message_id_idx  on public.contact_replies (contact_message_id);

create trigger contact_messages_set_updated_at
  before update on public.contact_messages
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.contact_messages enable row level security;
alter table public.contact_replies  enable row level security;
-- No policies: both tables are service-role only, matching contact_rate_limit.
