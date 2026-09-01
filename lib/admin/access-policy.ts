/**
 * The admin authorization registry: one table that says what every admin route
 * and every admin mutation requires.
 *
 * Why it exists. Authorization knowledge used to live in three places that
 * could not see each other — the sidebar decided what to show, each page
 * decided (or forgot) what to guard, and each Server Action decided what to
 * check. They disagreed in both directions at once, and both directions are
 * bugs:
 *
 *   - The sidebar showed "Data Quality" to a `books: read` account whose
 *     report action ran `requireLibrarian()`. The link led to a 403 that
 *     surfaced as a red "Something went wrong!".
 *   - Twenty-four admin pages had no guard at all. They inherited only the
 *     panel's role+MFA check from the (protected) layout, and most of them read
 *     through the service client, which bypasses RLS. The sidebar's gate was
 *     the whole access control, and a typed URL walked straight past it.
 *
 * So the rule this file encodes is: **a nav gate, a route guard and an action
 * guard for the same capability must be the same requirement object.** They are
 * now read from here, and `lib/admin/access-policy.test.ts` reads the route
 * files back and fails when a page's declared policy stops matching its guard.
 *
 * This module is pure and client-safe on purpose (no `server-only`, no DB, no
 * `next/headers`): the sidebar renders in the browser from the same table the
 * server enforces, and the tests exercise the real decision functions offline.
 * Resolution of *who the viewer is* stays on the server — see
 * `lib/admin/route-guard.ts` and `lib/auth/admin-identity.ts`.
 */

import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ADMIN_ROLES } from "@/lib/types/roles";

// ── Requirements ────────────────────────────────────────────────────────────

/** The two access levels a resource requirement can ask for. `none` is never a
 *  requirement — it is the absence of one. */
export type AccessLevel = "read" | "write";

/**
 * What a destination or action demands.
 *
 * Three kinds, because the app genuinely has three:
 *  - `perm`   — the `role_permissions` matrix, the normal case.
 *  - `roles`  — a fixed role list, for surfaces with no matrix row (the
 *               security console, the activity log). Kept explicit rather than
 *               inventing matrix rows that nothing would ever toggle.
 *  - `panel`  — any account the (protected) layout already admitted. The
 *               dashboard and the admin's own profile page: no resource of
 *               their own, and locking them would strand a valid admin on a
 *               403 the moment they signed in.
 */
export type Requirement =
  | { kind: "perm"; resource: string; level: AccessLevel }
  | { kind: "roles"; roles: readonly AppRole[] }
  | { kind: "panel" };

export const perm = (resource: string, level: AccessLevel): Requirement => ({
  kind: "perm",
  resource,
  level,
});
export const roles = (list: readonly AppRole[]): Requirement => ({ kind: "roles", roles: list });
export const PANEL: Requirement = { kind: "panel" };

// ── The viewer ──────────────────────────────────────────────────────────────

export type AdminViewer = {
  role: AppRole;
  isSuperAdmin: boolean;
  perms: Record<string, PermLevel>;
};

export function isSuperAdminViewer(viewer: AdminViewer): boolean {
  return viewer.isSuperAdmin || viewer.role === "super_admin";
}

/** The viewer's effective level for one resource. */
export function levelFor(viewer: AdminViewer, resource: string): PermLevel {
  if (isSuperAdminViewer(viewer)) return "write";
  return viewer.perms[resource] ?? "none";
}

/**
 * Does this viewer satisfy `requirement`?
 *
 * Super admins short-circuit exactly as `requirePermission` does, so nothing
 * driven by this table can hide something the server would let them through
 * to — the failure mode that makes a sidebar untrustworthy.
 */
export function satisfies(viewer: AdminViewer, requirement: Requirement): boolean {
  if (isSuperAdminViewer(viewer)) return true;
  switch (requirement.kind) {
    case "panel":
      return true;
    case "roles":
      return requirement.roles.includes(viewer.role);
    case "perm": {
      const level = viewer.perms[requirement.resource] ?? "none";
      return requirement.level === "write" ? level === "write" : level !== "none";
    }
  }
}

/** `read != no access`: can the viewer open this resource's pages at all? */
export function canRead(viewer: AdminViewer, resource: string): boolean {
  return satisfies(viewer, perm(resource, "read"));
}

/** `write != page visibility only`: can the viewer mutate this resource? */
export function canWrite(viewer: AdminViewer, resource: string): boolean {
  return satisfies(viewer, perm(resource, "write"));
}

// ── Route policies ──────────────────────────────────────────────────────────

export type RoutePolicy = {
  /** Stable id a page declares: `requireRouteAccess("books.upload")`. */
  id: string;
  /** Route pattern; `[param]` matches one segment. */
  route: string;
  requires: Requirement;
  /**
   * Key under the `adminShell.nav` message namespace, for hubs another route
   * links back to. It is what lets the 403 page say "Back to E-books" in the
   * reader's language instead of printing a URL.
   */
  navKey?: string;
  /**
   * Where a denied viewer is offered to go instead. It must be somewhere they
   * can actually reach — a 403 whose only exit is another 403 is a dead end —
   * so this points at the read-level hub of the same area, and the guard falls
   * back to `/admin` when the viewer cannot reach even that.
   */
  backTo?: string;
};

/**
 * Every `/admin/*` destination, with the access it requires.
 *
 * Read/write split, stated once so the rest of the app can stop guessing:
 * a listing, a detail view, a queue and a report are READ; creating, editing,
 * uploading, importing, approving, publishing and deleting are WRITE. A page
 * that mixes both (the review queue, the collection workspace) is a READ page
 * whose mutation controls are gated separately — see `ACTION_POLICIES`.
 */
export const ROUTE_POLICIES: readonly RoutePolicy[] = [
  // ── Panel-wide ────────────────────────────────────────────────────────────
  { id: "dashboard", route: "/admin", requires: PANEL, navKey: "dashboard" },
  { id: "profile", route: "/admin/profile", requires: PANEL },

  // ── E-books ───────────────────────────────────────────────────────────────
  { id: "books.manage", route: "/admin/books", requires: perm("books", "read"), navKey: "manageEbooks" },
  { id: "books.upload", route: "/admin/books/upload", requires: perm("books", "write"), backTo: "/admin/books" },
  { id: "books.duplicates", route: "/admin/books/duplicates", requires: perm("books", "write"), backTo: "/admin/books" },
  { id: "books.edit", route: "/admin/edit/[id]", requires: perm("books", "write"), backTo: "/admin/books" },
  /* The queue is READ. Everything you *do* to an item in it is WRITE, checked
     per action — protecting the whole page with `books: write` would hide the
     validation state, the metadata preview and the backlog itself from the
     people whose job is to look at them. */
  { id: "books.review", route: "/admin/review", requires: perm("books", "read"), backTo: "/admin/books" },
  { id: "books.requests", route: "/admin/book-requests", requires: perm("books", "read"), backTo: "/admin/books" },

  // ── Physical catalog ──────────────────────────────────────────────────────
  { id: "catalog.manage", route: "/admin/catalogs", requires: perm("catalog", "read"), navKey: "catalog" },
  { id: "catalog.create", route: "/admin/catalogs/add", requires: perm("catalog", "write"), backTo: "/admin/catalogs" },
  { id: "catalog.edit", route: "/admin/catalogs/edit/[id]", requires: perm("catalog", "write"), backTo: "/admin/catalogs" },
  { id: "catalog.copies", route: "/admin/catalogs/add-copies/[bookId]", requires: perm("catalog", "write"), backTo: "/admin/catalogs" },

  // ── Posts ─────────────────────────────────────────────────────────────────
  { id: "posts.manage", route: "/admin/posts", requires: perm("posts", "read"), navKey: "posts" },
  { id: "posts.create", route: "/admin/posts/new", requires: perm("posts", "write"), backTo: "/admin/posts" },
  { id: "posts.edit", route: "/admin/posts/edit/[id]", requires: perm("posts", "write"), backTo: "/admin/posts" },

  // ── Theses (DB table is still `research_reports`; resource key is `research`) ─
  { id: "theses.manage", route: "/admin/theses", requires: perm("research", "read"), navKey: "theses" },
  { id: "theses.create", route: "/admin/theses/create", requires: perm("research", "write"), backTo: "/admin/theses" },
  { id: "theses.edit", route: "/admin/theses/edit/[id]", requires: perm("research", "write"), backTo: "/admin/theses" },
  { id: "theses.cohorts", route: "/admin/theses/manage-cohorts", requires: perm("research", "write"), backTo: "/admin/theses" },

  // ── Publications ──────────────────────────────────────────────────────────
  { id: "publications.manage", route: "/admin/publications", requires: perm("publications", "read"), navKey: "publications" },
  { id: "publications.create", route: "/admin/publications/new", requires: perm("publications", "write"), backTo: "/admin/publications" },
  { id: "publications.edit", route: "/admin/publications/edit/[id]", requires: perm("publications", "write"), backTo: "/admin/publications" },
  { id: "publications.authors", route: "/admin/publications/authors", requires: perm("publications", "read"), backTo: "/admin/publications" },

  // ── Learning paths ────────────────────────────────────────────────────────
  { id: "paths.manage", route: "/admin/paths", requires: perm("learning_paths", "read"), navKey: "learningPaths" },
  { id: "paths.create", route: "/admin/paths/create", requires: perm("learning_paths", "write"), backTo: "/admin/paths" },
  { id: "paths.edit", route: "/admin/paths/edit/[id]", requires: perm("learning_paths", "write"), backTo: "/admin/paths" },

  // ── Announcements ─────────────────────────────────────────────────────────
  { id: "announcements.manage", route: "/admin/announcements", requires: perm("announcements", "read"), navKey: "announcements" },
  { id: "announcements.create", route: "/admin/announcements/new", requires: perm("announcements", "write"), backTo: "/admin/announcements" },
  { id: "announcements.templates", route: "/admin/announcements/templates", requires: perm("announcements", "read"), backTo: "/admin/announcements" },
  { id: "announcements.edit", route: "/admin/announcements/[id]/edit", requires: perm("announcements", "write"), backTo: "/admin/announcements" },
  { id: "announcements.detail", route: "/admin/announcements/[id]", requires: perm("announcements", "read"), backTo: "/admin/announcements" },

  // ── Homepage photos ───────────────────────────────────────────────────────
  { id: "homepagePhotos.manage", route: "/admin/homepage-photos", requires: perm("homepage_photos", "read") },

  // ── Inbox ─────────────────────────────────────────────────────────────────
  { id: "inbox.manage", route: "/admin/inbox", requires: perm("contact", "read") },

  // ── Storage ───────────────────────────────────────────────────────────────
  { id: "storage.browse", route: "/admin/storage", requires: perm("storage", "read") },

  // ── Insights (reports over the collection — read-level, like the collection) ─
  { id: "insights.search", route: "/admin/search-insights", requires: perm("books", "read") },
  { id: "insights.dataQuality", route: "/admin/data-quality", requires: perm("books", "read") },

  // ── Administration ────────────────────────────────────────────────────────
  { id: "users.manage", route: "/admin/users", requires: perm("users", "read") },
  { id: "team.manage", route: "/admin/team", requires: perm("users", "read"), navKey: "libraryTeam" },
  { id: "team.create", route: "/admin/team/new", requires: perm("users", "write"), backTo: "/admin/team" },
  { id: "team.sections", route: "/admin/team/sections", requires: perm("users", "write"), backTo: "/admin/team" },
  { id: "team.edit", route: "/admin/team/[id]/edit", requires: perm("users", "write"), backTo: "/admin/team" },
  /* Role Management is delegable, through the same matrix it edits.
     `roles` defaults to `write` for super_admin and `none` for everyone else,
     so behaviour for all five shipped roles is exactly what the hardcoded
     super-admin check produced — but a super admin can now hand role
     management to a trusted `admin` without a code change, and the `roles` row
     on this very page finally decides something.
     The escalation this opens is bounded by three guardrails in
     `saveRolePermissions`: the super_admin row stays immutable, delegation is
     not transitive (only a super admin may move the `roles` row at all), and
     the same rule makes self-lockout impossible. See ROLES_DELEGATION_RULES. */
  { id: "roles.manage", route: "/admin/roles", requires: perm("roles", "write") },
  { id: "settings.manage", route: "/admin/system-settings", requires: perm("settings", "read") },
  /* No matrix row: these two read the security pipeline's own tables, which are
     service-role-only and have no delegable sub-capability. Admin and above. */
  { id: "security.console", route: "/admin/security", requires: roles(ADMIN_ROLES) },
  { id: "security.incidents", route: "/admin/security/incidents", requires: roles(ADMIN_ROLES) },
  { id: "security.incident", route: "/admin/security/incidents/[reference]", requires: roles(ADMIN_ROLES) },
  { id: "security.events", route: "/admin/security/events", requires: roles(ADMIN_ROLES) },
  { id: "logs.activity", route: "/admin/logs", requires: roles(ADMIN_ROLES) },
];

export type RoutePolicyId = (typeof ROUTE_POLICIES)[number]["id"];

const ROUTE_BY_ID = new Map(ROUTE_POLICIES.map((p) => [p.id, p]));

export function routePolicy(id: string): RoutePolicy | undefined {
  return ROUTE_BY_ID.get(id);
}

/** Compile `/admin/team/[id]/edit` to `^/admin/team/[^/]+/edit$`. */
function routeRegex(route: string): RegExp {
  const source = route
    .split("/")
    .map((segment) =>
      segment.startsWith("[") && segment.endsWith("]")
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${source}/?$`);
}

/** How specific a pattern is: more static segments wins, and a static segment
 *  beats a dynamic one at the same depth. */
function specificity(route: string): number {
  const segments = route.split("/").filter(Boolean);
  return segments.length * 2 + segments.filter((s) => !s.startsWith("[")).length;
}

const MATCHERS = ROUTE_POLICIES.map((policy) => ({ policy, re: routeRegex(policy.route) })).sort(
  (a, b) => specificity(b.policy.route) - specificity(a.policy.route),
);

/**
 * The policy governing a pathname, or `undefined` for a route this table does
 * not know. Used by the 403 page to name the access the visitor was missing,
 * and by the tests. It is NOT the enforcement path — pages declare their policy
 * id explicitly, so a new route without an entry fails a test rather than
 * silently inheriting a neighbour's gate.
 */
export function resolveRoutePolicy(pathname: string): RoutePolicy | undefined {
  const clean = pathname.split("?")[0].replace(/\/+$/, "") || "/admin";
  return MATCHERS.find((m) => m.re.test(clean))?.policy;
}

/** Can this viewer open the route behind `policyId`? */
export function canAccessRoute(viewer: AdminViewer, policyId: string): boolean {
  const policy = routePolicy(policyId);
  // Unknown id is a programming error, and the fail-closed answer is "no".
  if (!policy) return false;
  return satisfies(viewer, policy.requires);
}

// ── Action policies ─────────────────────────────────────────────────────────

/**
 * Mutations, named. The page decides what to *render* from this table and the
 * Server Action enforces the same entry, so a hidden button and a refused POST
 * are two readings of one row rather than two independent decisions.
 */
export const ACTION_POLICIES: Readonly<Record<string, Requirement>> = {
  // E-books
  "books.create": perm("books", "write"),
  "books.edit": perm("books", "write"),
  "books.delete": perm("books", "write"),
  "books.publish": perm("books", "write"),
  "books.archive": perm("books", "write"),
  "books.verify": perm("books", "write"),
  "books.bulk": perm("books", "write"),
  "books.replaceFile": perm("books", "write"),
  "books.retireDuplicate": perm("books", "write"),
  // Review queue — read the queue, write to move anything in it
  "books.review.view": perm("books", "read"),
  "books.review.approve": perm("books", "write"),
  "books.review.reject": perm("books", "write"),
  "books.review.assign": perm("books", "write"),
  "books.review.verify": perm("books", "write"),
  "research.review.approve": perm("research", "write"),
  "research.review.reject": perm("research", "write"),
  "research.review.assign": perm("research", "write"),
  "research.review.verify": perm("research", "write"),
  // Book requests
  "books.requests.update": perm("books", "write"),
  "books.requests.delete": perm("books", "write"),
  // Catalog
  "catalog.create": perm("catalog", "write"),
  "catalog.edit": perm("catalog", "write"),
  "catalog.delete": perm("catalog", "write"),
  "catalog.import": perm("catalog", "write"),
  "catalog.copies.manage": perm("catalog", "write"),
  // Content
  "posts.create": perm("posts", "write"),
  "posts.edit": perm("posts", "write"),
  "posts.delete": perm("posts", "write"),
  "theses.create": perm("research", "write"),
  "theses.edit": perm("research", "write"),
  "theses.delete": perm("research", "write"),
  "publications.create": perm("publications", "write"),
  "publications.edit": perm("publications", "write"),
  "publications.delete": perm("publications", "write"),
  "publications.authors.merge": perm("publications", "write"),
  "paths.create": perm("learning_paths", "write"),
  "paths.edit": perm("learning_paths", "write"),
  "paths.delete": perm("learning_paths", "write"),
  "announcements.create": perm("announcements", "write"),
  "announcements.edit": perm("announcements", "write"),
  "announcements.delete": perm("announcements", "write"),
  "announcements.push": perm("announcements_push", "write"),
  "homepagePhotos.manage": perm("homepage_photos", "write"),
  // Insights — the reports are read, the recalculation is not
  "insights.recalculate": perm("books", "write"),
  "insights.searchCurate": perm("books", "write"),
  // Communication
  "inbox.reply": perm("contact", "write"),
  "inbox.update": perm("contact", "write"),
  "inbox.delete": perm("contact", "write"),
  // Storage — deletion is a separate, higher-trust resource
  "storage.upload": perm("storage", "write"),
  "storage.modify": perm("storage", "write"),
  "storage.purge": perm("storage_manage", "write"),
  // Administration
  "users.invite": perm("users", "write"),
  "users.update": perm("users", "write"),
  "team.manage": perm("users", "write"),
  "team.create": perm("users", "write"),
  "team.sections": perm("users", "write"),
  "settings.publish": perm("settings", "write"),
  /* Same requirement as the page that hosts it: an editor who can open the
     matrix can save it. The extra rules a save must satisfy are not expressible
     as a permission level and live in ROLES_DELEGATION_RULES below. */
  "roles.save": perm("roles", "write"),
};

export type ActionPolicyId = keyof typeof ACTION_POLICIES;

export function actionPolicy(id: string): Requirement | undefined {
  return ACTION_POLICIES[id];
}

/** Can this viewer perform `actionId`? The question a button asks. */
export function canPerform(viewer: AdminViewer, actionId: string): boolean {
  const requirement = actionPolicy(actionId);
  if (!requirement) return false;
  return satisfies(viewer, requirement);
}

// ── Description of a denial ─────────────────────────────────────────────────

/**
 * Everything the 403 page needs, and deliberately nothing more: no message, no
 * digest, no stack, no query, no identifiers. Two resource+level pairs and a
 * link.
 */
export type AccessDenial = {
  /** Route policy id when the denial came from a route. */
  policyId?: string;
  /** Resource key, when the requirement was a `perm` one. */
  resource?: string;
  /** What the destination needs. */
  requiredLevel?: AccessLevel;
  /** What the viewer holds today, for the same resource. */
  currentLevel?: PermLevel;
  /** Set when the requirement was role-based rather than resource-based. */
  requiredRoles?: readonly AppRole[];
  /** A destination the viewer can actually reach. */
  backTo: string;
};

/** Build the denial description for a viewer who failed `requirement`. */
export function describeDenial(
  viewer: AdminViewer,
  requirement: Requirement,
  options: { policyId?: string; backTo?: string } = {},
): AccessDenial {
  const backTo = options.backTo ?? "/admin";
  if (requirement.kind === "perm") {
    return {
      policyId: options.policyId,
      resource: requirement.resource,
      requiredLevel: requirement.level,
      currentLevel: viewer.perms[requirement.resource] ?? "none",
      backTo,
    };
  }
  if (requirement.kind === "roles") {
    return { policyId: options.policyId, requiredRoles: requirement.roles, backTo };
  }
  return { policyId: options.policyId, backTo };
}

/**
 * Where to send a denied viewer. The policy's own `backTo` only helps if they
 * can reach it — a `books: none` account denied `/admin/books/upload` must not
 * be offered `/admin/books`.
 */
export function reachableFallback(viewer: AdminViewer, policy: RoutePolicy | undefined): string {
  if (!policy?.backTo) return "/admin";
  const target = resolveRoutePolicy(policy.backTo);
  if (target && !satisfies(viewer, target.requires)) return "/admin";
  return policy.backTo;
}

// ── What a level actually buys, per resource ────────────────────────────────

/**
 * The routes and named actions a resource's `read` and `write` levels unlock.
 *
 * Derived from the two tables above rather than written down a second time, so
 * the explanation `/admin/roles` shows an administrator is the same thing the
 * server enforces. This is what turns "Books — Read" from a word into
 * "opens /admin/books, /admin/review, /admin/book-requests, and nothing that
 * changes them".
 */
export type ResourceCapabilities = {
  /** Routes reachable at `read` (and therefore also at `write`). */
  readRoutes: string[];
  /** Routes that additionally require `write`. */
  writeRoutes: string[];
  /** Named mutations that require `write`. */
  writeActions: string[];
};

export function resourceCapabilities(resource: string): ResourceCapabilities {
  const readRoutes: string[] = [];
  const writeRoutes: string[] = [];
  for (const policy of ROUTE_POLICIES) {
    if (policy.requires.kind !== "perm" || policy.requires.resource !== resource) continue;
    (policy.requires.level === "write" ? writeRoutes : readRoutes).push(policy.route);
  }
  const writeActions = Object.entries(ACTION_POLICIES)
    .filter(([, req]) => req.kind === "perm" && req.resource === resource && req.level === "write")
    .map(([id]) => id);
  return { readRoutes, writeRoutes, writeActions };
}

/**
 * The three rules a `role_permissions` save must satisfy on top of the
 * permission level, enforced by `saveRolePermissions`.
 *
 * They exist because `roles: write` is the one grant that can grant grants. A
 * level check alone answers "may this person edit the matrix?"; it cannot
 * answer "may this edit widen who else may edit the matrix?", which is the
 * question that decides whether delegation stays bounded.
 *
 * Stated here, next to the policy, so the UI can explain them in the same words
 * the server refuses in — and so `lib/admin/access-policy.test.ts` can check
 * that the action file still implements each one.
 */
export const ROLES_DELEGATION_RULES = {
  /** super_admin's row is full access, always, and no save may change it. */
  superAdminRowImmutable: "superAdminRowImmutable",
  /**
   * Only a super admin may move the `roles` row itself.
   *
   * Delegation is not transitive: an `admin` granted `roles: write` administers
   * every other permission, but cannot appoint further administrators, and
   * cannot revoke their own grant either — so the same rule that stops the
   * trust boundary widening also makes self-lockout impossible. Widening or
   * withdrawing role management stays a super admin's decision.
   */
  rolesRowSuperAdminOnly: "rolesRowSuperAdminOnly",
  /** Every cell must name a real role, a real resource and a real level. */
  wellFormedChange: "wellFormedChange",
} as const;

export type RolesDelegationRule = keyof typeof ROLES_DELEGATION_RULES;

/**
 * Resources whose grant carries authority beyond its own pages, and which the
 * matrix therefore flags rather than presenting as one row among fifteen.
 *
 * `roles` is the only one: granting it hands over every other permission on
 * this page. It used to be un-editable for exactly that reason, which made the
 * row decide nothing — the same defect the `catalog` row had. It is editable
 * now, with the delegation rules above holding the line and this note telling
 * the editor what they are about to hand over.
 */
export const ELEVATED_RESOURCES: Readonly<Record<string, { rule: RolesDelegationRule }>> = {
  roles: { rule: "rolesRowSuperAdminOnly" },
};

export function isElevatedResource(resource: string): boolean {
  return resource in ELEVATED_RESOURCES;
}
