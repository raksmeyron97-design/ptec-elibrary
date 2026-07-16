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
      { key: "announcements", label: "Announcements", description: "Site-wide announcement banners" },
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
      { key: "users", label: "Users", description: "Accounts, team directory, and role assignment" },
      { key: "roles", label: "Roles", description: "This permission matrix itself" },
      { key: "settings", label: "System Settings", description: "Global site configuration: contacts, hours, links, SEO" },
    ],
  },
];

/** Flat list of every resource key that the matrix (and server) accepts. */
export const ALL_RESOURCE_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.resources.map((r) => r.key),
);

/** Flat resource → group-id lookup, for filtering. */
export const RESOURCE_GROUP: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.resources.map((r) => [r.key, g.id])),
);

/** Human label for a resource key (falls back to a titleized key). */
export function resourceLabel(key: string): string {
  for (const g of PERMISSION_GROUPS) {
    const r = g.resources.find((res) => res.key === key);
    if (r) return r.label;
  }
  return key.replace(/_/g, " ");
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
