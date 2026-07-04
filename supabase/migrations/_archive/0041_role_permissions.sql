-- 0041_role_permissions.sql
-- Persistent permission matrix for each role × resource combination.
-- Super admins can edit these via /admin/roles. Values are display/audit;
-- server-side guards (requireAdmin etc.) use the role hierarchy as the
-- enforcement layer.

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role        user_role   NOT NULL,
  resource    text        NOT NULL,
  level       text        NOT NULL DEFAULT 'none'
                          CHECK (level IN ('none', 'read', 'write')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (role, resource)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can view the permission matrix
CREATE POLICY "Admins can view role_permissions"
  ON public.role_permissions FOR SELECT
  USING (public.is_admin());

-- Modifications only via service role (server actions gate with requireSuperAdmin)

-- Seed default permissions
INSERT INTO public.role_permissions (role, resource, level) VALUES
  ('reader',      'books',         'read'),
  ('reader',      'catalog',       'read'),
  ('reader',      'research',      'read'),
  ('reader',      'posts',         'read'),
  ('reader',      'announcements', 'read'),
  ('reader',      'users',         'none'),
  ('reader',      'roles',         'none'),

  ('staff',       'books',         'read'),
  ('staff',       'catalog',       'read'),
  ('staff',       'research',      'read'),
  ('staff',       'posts',         'write'),
  ('staff',       'announcements', 'write'),
  ('staff',       'users',         'none'),
  ('staff',       'roles',         'none'),

  ('librarian',   'books',         'write'),
  ('librarian',   'catalog',       'write'),
  ('librarian',   'research',      'write'),
  ('librarian',   'posts',         'read'),
  ('librarian',   'announcements', 'read'),
  ('librarian',   'users',         'none'),
  ('librarian',   'roles',         'none'),

  ('admin',       'books',         'write'),
  ('admin',       'catalog',       'write'),
  ('admin',       'research',      'write'),
  ('admin',       'posts',         'write'),
  ('admin',       'announcements', 'write'),
  ('admin',       'users',         'write'),
  ('admin',       'roles',         'none'),

  ('super_admin', 'books',         'write'),
  ('super_admin', 'catalog',       'write'),
  ('super_admin', 'research',      'write'),
  ('super_admin', 'posts',         'write'),
  ('super_admin', 'announcements', 'write'),
  ('super_admin', 'users',         'write'),
  ('super_admin', 'roles',         'write')
ON CONFLICT (role, resource) DO NOTHING;
