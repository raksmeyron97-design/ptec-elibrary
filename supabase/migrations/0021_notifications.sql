-- 0021_notifications.sql
-- Notification system: per-user alerts and admin broadcast announcements.

-- ── notifications ────────────────────────────────────────────────────────────
CREATE TABLE public.notifications (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  type        text        NOT NULL,  -- 'new_user' | 'new_book' | 'new_report' | 'announcement'
  title_en    text        NOT NULL,
  title_km    text,
  body_en     text,
  body_km     text,
  link        text,                  -- optional relative URL e.g. "/admin/users"
  target_role text,                  -- 'admin' = admin-only | NULL = all authenticated users
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Admins see everything (both 'admin'-targeted and NULL broadcasts)
CREATE POLICY "admins_read_notifications"
  ON public.notifications FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Regular authenticated users see broadcasts only (target_role IS NULL)
CREATE POLICY "users_read_broadcast_notifications"
  ON public.notifications FOR SELECT
  USING (target_role IS NULL AND auth.uid() IS NOT NULL);

-- ── notification_reads ────────────────────────────────────────────────────────
CREATE TABLE public.notification_reads (
  notification_id uuid        NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notification_reads_pkey PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_reads"
  ON public.notification_reads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_reads"
  ON public.notification_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_notifications_target_role_created
  ON public.notifications (target_role, created_at DESC);

CREATE INDEX idx_notification_reads_user
  ON public.notification_reads (user_id);
