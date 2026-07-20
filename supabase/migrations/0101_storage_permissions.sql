-- 0101_storage_permissions.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Permission seeds for the new /admin/storage file-manager module. This
-- migration adds no new tables: the storage service's own metadata (files,
-- checksums, Trash) lives entirely inside the separate `storage` project's
-- own database (Zima OS), never in this app's Supabase instance — the two
-- systems stay fully separate, communicating only over the storage service's
-- authenticated /api/v1 HTTP API. This migration only extends the existing
-- role_permissions matrix (0041_role_permissions.sql) with two new resources:
--
--   • storage         — browse/search/upload/rename/move/trash/restore.
--                        write mirrors the existing content-upload resources
--                        (books/catalog/research/publications/posts): any
--                        role that already uploads files today keeps the
--                        same effective capability through the new UI.
--   • storage_manage  — permanent deletion + storage settings. Deliberately
--                        NOT granted to the ordinary `admin` role (unlike
--                        `settings`, which admin does get) — permanent file
--                        deletion is higher-risk than most admin actions
--                        because it can break a still-referenced book/thesis/
--                        post file with no undo, so it stays super_admin-only
--                        by default, same posture as `roles`.
--
-- Mirrors DEFAULT_PERMISSIONS in lib/permissions.ts — keep both in sync.
--
-- Rollback (manual, safe at any time — removes only the permission rows,
-- never touches any file or the storage service):
--   delete from public.role_permissions where resource in ('storage', 'storage_manage');
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.role_permissions (role, resource, level)
values
  ('reader',      'storage',         'none'),
  ('staff',       'storage',         'write'),
  ('librarian',   'storage',         'write'),
  ('admin',       'storage',         'write'),
  ('super_admin', 'storage',         'write'),

  ('reader',      'storage_manage',  'none'),
  ('staff',       'storage_manage',  'none'),
  ('librarian',   'storage_manage',  'none'),
  ('admin',       'storage_manage',  'none'),
  ('super_admin', 'storage_manage',  'write')
on conflict (role, resource) do nothing;
