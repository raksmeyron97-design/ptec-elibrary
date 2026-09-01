// Shared, client-safe model for the Role Management workspace.
// No "server-only" import here — both the server page and client components use it.

import type { AppRole, PermLevel } from "@/lib/types/roles";

/** A single permission-controllable feature/resource (matrix row). */
export type Resource = {
  /** Matches the `resource` column in `role_permissions`. */
  key: string;
  label: string;
  /** One-line explanation of what this resource governs. */
  description: string;
};

/** A group of resources, mirroring a section of the admin sidebar. */
export type PermissionGroup = {
  id: string;
  label: string;
  description: string;
  /** Key into the client-side icon map (kept as a string so this file stays server-safe). */
  iconKey: "library" | "content" | "communication" | "administration";
  resources: Resource[];
};

/**
 * The full permission catalog, grouped to match the admin sidebar sections.
 * This is the source of truth for which resources appear in the matrix — it
 * now includes `publications` and `contact`, which the previous matrix omitted
 * even though they are live, sidebar-gated resources.
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "library",
    label: "Library",
    description: "Digital and physical collection management",
    iconKey: "library",
    resources: [
      { key: "books", label: "E-books", description: "Upload, review, and manage digital books" },
      { key: "catalog", label: "Catalog", description: "Physical collection and copy records" },
    ],
  },
  {
    id: "content",
    label: "Content",
    description: "Editorial and academic publishing",
    iconKey: "content",
    resources: [
      { key: "posts", label: "Posts", description: "News articles and blog posts" },
      { key: "research", label: "Theses", description: "Student theses and research reports" },
      { key: "publications", label: "Publications", description: "Institutional academic publications" },
      { key: "learning_paths", label: "Learning Paths", description: "Curated teacher learning journeys" },
      { key: "announcements", label: "Announcements", description: "Create, edit, and schedule announcements (in-app + banner)" },
      { key: "announcements_push", label: "Announcement Push", description: "Send announcement push notifications to subscribed devices" },
      { key: "homepage_photos", label: "Homepage Photos", description: "Photos shown in the homepage library-life gallery" },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    description: "Messages from library visitors",
    iconKey: "communication",
    resources: [
      { key: "contact", label: "Inbox", description: "Contact-form messages and replies" },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    description: "People, roles, and system access",
    iconKey: "administration",
    resources: [
      { key: "storage", label: "Storage", description: "Browse and upload files in the media library" },
      { key: "storage_manage", label: "Storage Deletion", description: "Permanently delete files, bypassing the trash" },
      { key: "users", label: "Users", description: "Accounts, team directory, and role assignment" },
      { key: "roles", label: "Roles", description: "This permission matrix itself" },
      { key: "settings", label: "System Settings", description: "Global site configuration: contacts, hours, links, SEO" },
    ],
  },
];

/**
 * The category + search filter, shared by the desktop matrix, the mobile card
 * list and the "differences" summary line so all three always agree on which
 * features are on screen. `searchText` is supplied by the caller because the
 * searchable string is the *translated* label and description.
 *
 * Note what is deliberately absent: the "differences" toggle. It is an
 * emphasis mode (uniform rows recede, mixed rows get a marker), not a filter —
 * hiding rows would defeat reading the permission landscape as a whole.
 */
export function visibleGroups(
  category: string,
  query: string,
  searchText: (key: string) => string,
): PermissionGroup[] {
  const q = query.trim().toLowerCase();
  return PERMISSION_GROUPS
    .filter((g) => category === "all" || g.id === category)
    .map((g) => ({
      ...g,
      resources: g.resources.filter((r) => !q || searchText(r.key).toLowerCase().includes(q)),
    }))
    .filter((g) => g.resources.length > 0);
}

/** Flat list of every resource key that the matrix (and server) accepts. */
export const ALL_RESOURCE_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.resources.map((r) => r.key),
);

/** Flat resource → group-id lookup, for filtering. */
export const RESOURCE_GROUP: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.resources.map((r) => [r.key, g.id])),
);

/**
 * Last-resort readable name for a resource key: `announcements_push` →
 * "Announcements Push". Used when a translation is missing so the UI degrades
 * to English words rather than leaking `adminRoles.resources.<key>` on screen.
 */
export function titleizeResourceKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Human label for a resource key (falls back to a titleized key). */
export function resourceLabel(key: string): string {
  for (const g of PERMISSION_GROUPS) {
    const r = g.resources.find((res) => res.key === key);
    if (r) return r.label;
  }
  return titleizeResourceKey(key);
}

// ── Permission levels ───────────────────────────────────────────────────────

export const LEVEL_ORDER: PermLevel[] = ["none", "read", "write"];

export type LevelMeta = {
  label: string;
  /** Short verb shown in dense/mobile contexts. */
  short: string;
  description: string;
  /** Icon key resolved in client components (kept string-only here). */
  iconKey: "none" | "read" | "write";
};

export const LEVEL_META: Record<PermLevel, LevelMeta> = {
  none: { label: "No access", short: "None", description: "Cannot see or use this area", iconKey: "none" },
  read: { label: "Read", short: "Read", description: "Can view but not change", iconKey: "read" },
  write: { label: "Full access", short: "Write", description: "Can create, edit, and delete", iconKey: "write" },
};

export function nextLevel(current: PermLevel): PermLevel {
  const idx = LEVEL_ORDER.indexOf(current);
  return LEVEL_ORDER[(idx + 1) % LEVEL_ORDER.length];
}

// ── Matrix + diffing ─────────────────────────────────────────────────────────

/** role → resource → level */
export type PermMatrix = Record<AppRole, Record<string, PermLevel>>;

export type PermChange = {
  role: AppRole;
  resource: string;
  from: PermLevel;
  to: PermLevel;
};

export function levelAt(matrix: PermMatrix, role: AppRole, resource: string): PermLevel {
  return matrix[role]?.[resource] ?? "none";
}

/** Every cell where `draft` differs from `baseline`. */
export function diffMatrix(baseline: PermMatrix, draft: PermMatrix, roles: AppRole[]): PermChange[] {
  const changes: PermChange[] = [];
  for (const role of roles) {
    for (const resource of ALL_RESOURCE_KEYS) {
      const from = levelAt(baseline, role, resource);
      const to = levelAt(draft, role, resource);
      if (from !== to) changes.push({ role, resource, from, to });
    }
  }
  return changes;
}

/** True when a role's row differs from another role's row for the given resources. */
export function rowDiffersAcrossRoles(
  matrix: PermMatrix,
  roles: AppRole[],
  resource: string,
): boolean {
  const levels = new Set(roles.map((r) => levelAt(matrix, r, resource)));
  return levels.size > 1;
}

/** super_admin is always full-access and is never editable. */
export function isLockedRole(role: AppRole): boolean {
  return role === "super_admin";
}

// ── Bulk operations ─────────────────────────────────────────────────────────
// The workspace edits one role at a time, so every bulk helper is scoped to a
// single role and returns a NEW matrix. They live here, pure and free of React,
// because "reset this role to the shipped defaults" is a rule about permissions
// — not about a dropdown — and `lib/admin/roles-bulk.test.ts` pins the rules
// without rendering anything.

/** Resource keys belonging to one group, in catalog order. */
export function groupResourceKeys(groupId: string): string[] {
  return PERMISSION_GROUPS.find((g) => g.id === groupId)?.resources.map((r) => r.key) ?? [];
}

/**
 * Overwrite one role's levels for the given resource keys. Locked roles are
 * inert.
 *
 * Bulk paths may move the `roles` row like any other now that role management
 * is delegable. The line that used to be held here is held on the server
 * instead (`ROLES_DELEGATION_RULES.rolesRowSuperAdminOnly`), which is where it
 * belongs: a bulk edit and a single-cell edit have to be refused by the same
 * rule, and only the server knows who is asking.
 */
export function setLevels(
  matrix: PermMatrix,
  role: AppRole,
  resources: string[],
  level: PermLevel,
): PermMatrix {
  if (isLockedRole(role)) return matrix;
  const row = { ...(matrix[role] ?? {}) };
  for (const key of resources) row[key] = level;
  return { ...matrix, [role]: row };
}

/**
 * The level a whole group sits at for one role, or `"mixed"` when its
 * resources disagree. Drives the pressed state of the group's Set-all buttons,
 * so "everything here is already Read" is visible without opening the group.
 */
export function groupLevel(
  matrix: PermMatrix,
  role: AppRole,
  resources: string[],
): PermLevel | "mixed" {
  if (resources.length === 0) return "none";
  const first = levelAt(matrix, role, resources[0]);
  return resources.every((key) => levelAt(matrix, role, key) === first) ? first : "mixed";
}

/** Copy every resource level from one role onto another. */
export function copyRoleLevels(matrix: PermMatrix, from: AppRole, to: AppRole): PermMatrix {
  if (isLockedRole(to) || from === to) return matrix;
  const source = matrix[from] ?? {};
  const row = { ...(matrix[to] ?? {}) };
  for (const key of ALL_RESOURCE_KEYS) row[key] = source[key] ?? "none";
  return { ...matrix, [to]: row };
}

/**
 * Restore one role to a reference row — in practice `DEFAULT_PERMISSIONS`,
 * handed down from the server so this module stays free of the `server-only`
 * import that `lib/permissions.ts` carries.
 */
export function applyReferenceRow(
  matrix: PermMatrix,
  role: AppRole,
  reference: Record<string, PermLevel> | undefined,
): PermMatrix {
  if (isLockedRole(role) || !reference) return matrix;
  const row = { ...(matrix[role] ?? {}) };
  for (const key of ALL_RESOURCE_KEYS) row[key] = reference[key] ?? "none";
  return { ...matrix, [role]: row };
}

/** How many resources a role can write, read, or not reach at all. */
export function accessSummary(matrix: PermMatrix, role: AppRole) {
  let write = 0;
  let read = 0;
  for (const key of ALL_RESOURCE_KEYS) {
    const level = levelAt(matrix, role, key);
    if (level === "write") write++;
    else if (level === "read") read++;
  }
  return { write, read, none: ALL_RESOURCE_KEYS.length - write - read, total: ALL_RESOURCE_KEYS.length };
}

/** Pending changes bucketed per role, in `roles` order — the review sheet's shape. */
export function changesByRole(
  changes: PermChange[],
  roles: AppRole[],
): { role: AppRole; changes: PermChange[] }[] {
  return roles
    .map((role) => ({ role, changes: changes.filter((c) => c.role === role) }))
    .filter((bucket) => bucket.changes.length > 0);
}

// ── Conflict resolution ─────────────────────────────────────────────────────

/** What to do with a cell someone else changed while this editor was working. */
export type ConflictChoice = "mine" | "theirs";

/**
 * A conflict as the UI needs it: what the editor started from, what they set,
 * and what the row actually holds now. The server returns the last of these in
 * `from`; `was` is what this session believed, which only the client still has.
 */
export type ConflictItem = {
  role: AppRole;
  resource: string;
  /** The level this editor started from. */
  was: PermLevel;
  /** The level this editor set. */
  mine: PermLevel;
  /** The level the database holds now, written by someone else. */
  theirs: PermLevel;
};

export function toConflictItems(
  serverConflicts: PermChange[],
  baseline: PermMatrix,
): ConflictItem[] {
  return serverConflicts.map((c) => ({
    role: c.role,
    resource: c.resource,
    was: levelAt(baseline, c.role, c.resource),
    mine: c.to,
    theirs: c.from,
  }));
}

/**
 * Pending changes bucketed by role and then by permission group.
 *
 * The review sheet asks "is this what you meant?", and for a change set that
 * spans several groups a flat list of nineteen rows cannot be checked against
 * that question — "Posts" and "Users" moving are very different kinds of edit,
 * and the category is what tells them apart at a glance.
 */
export function groupedChanges(
  changes: PermChange[],
  roles: AppRole[],
): { role: AppRole; groups: { id: string; changes: PermChange[] }[] }[] {
  return changesByRole(changes, roles).map(({ role, changes: roleChanges }) => ({
    role,
    groups: PERMISSION_GROUPS.map((group) => ({
      id: group.id,
      changes: roleChanges.filter((c) => RESOURCE_GROUP[c.resource] === group.id),
    })).filter((group) => group.changes.length > 0),
  }));
}

// ── Bulk previews ───────────────────────────────────────────────────────────

/** A whole-role bulk edit, before it is applied. */
export type BulkIntent =
  | { kind: "copy"; source: AppRole }
  | { kind: "defaults" }
  | { kind: "clear" };

/**
 * The matrix a bulk action *would* produce, without applying it.
 *
 * Separating the preview from the write is what lets the workspace tell an
 * editor "this will change 9 of 13 permissions" before anything moves. A bulk
 * action that silently rewrites a role's entire row is the one operation on
 * this page that can quietly widen access across every resource at once.
 */
export function previewBulk(
  matrix: PermMatrix,
  role: AppRole,
  intent: BulkIntent,
  reference: Record<AppRole, Record<string, PermLevel>>,
): PermMatrix {
  switch (intent.kind) {
    case "copy":
      return copyRoleLevels(matrix, intent.source, role);
    case "defaults":
      return applyReferenceRow(matrix, role, reference[role]);
    case "clear":
      return setLevels(matrix, role, ALL_RESOURCE_KEYS, "none");
  }
}

/** How many of a role's resources a bulk action would move. */
export function countRoleChanges(
  before: PermMatrix,
  after: PermMatrix,
  role: AppRole,
): number {
  return ALL_RESOURCE_KEYS.filter(
    (key) => levelAt(before, role, key) !== levelAt(after, role, key),
  ).length;
}
