/**
 * The RBAC regression suite.
 *
 * Half of it exercises the pure decision functions against the five default
 * roles — the questions the brief asks in so many words ("can staff open
 * /admin/books? can staff reach /admin/books/upload?"). The other half is a
 * source scan, in the tradition of this repo's other invariant tests: it reads
 * every admin page file back and fails when a route stops declaring a policy,
 * when a policy points at a route that does not exist, or when the sidebar and
 * the guard could disagree. Those are the failures that are invisible in a
 * build and only show up as a 403 in front of a real librarian.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  ACTION_POLICIES,
  ROUTE_POLICIES,
  canAccessRoute,
  canPerform,
  canRead,
  canWrite,
  describeDenial,
  isElevatedResource,
  ROLES_DELEGATION_RULES,
  reachableFallback,
  resolveRoutePolicy,
  resourceCapabilities,
  routePolicy,
  satisfies,
  type AdminViewer,
} from "./access-policy";
import { ALL_RESOURCE_KEYS } from "./roles-shared";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { ADMIN_ROLES, ALL_ROLES, type AppRole } from "@/lib/types/roles";

const ADMIN_ROOT = "app/(admin)/admin/(protected)";
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const as = (role: AppRole): AdminViewer => ({
  role,
  isSuperAdmin: false,
  perms: DEFAULT_PERMISSIONS[role],
});

/** A role whose stored permissions have been edited on /admin/roles. */
const withPerms = (role: AppRole, overrides: Record<string, "none" | "read" | "write">): AdminViewer => ({
  role,
  isSuperAdmin: false,
  perms: { ...DEFAULT_PERMISSIONS[role], ...overrides },
});

// ── The reported bugs ───────────────────────────────────────────────────────

describe("BUG #1 — books: read must open the collection and refuse the upload page", () => {
  const staff = as("staff");

  it("staff holds books: read by default", () => {
    expect(DEFAULT_PERMISSIONS.staff.books).toBe("read");
  });

  it("staff can access /admin/books", () => {
    expect(canAccessRoute(staff, "books.manage")).toBe(true);
  });

  it("staff cannot access /admin/books/upload", () => {
    expect(canAccessRoute(staff, "books.upload")).toBe(false);
  });

  it("staff can view the review queue", () => {
    expect(canAccessRoute(staff, "books.review")).toBe(true);
  });

  it("staff cannot approve, reject, assign or verify in the review queue", () => {
    for (const action of [
      "books.review.approve",
      "books.review.reject",
      "books.review.assign",
      "books.review.verify",
    ]) {
      expect(canPerform(staff, action), action).toBe(false);
    }
  });

  it("staff cannot create, edit, delete or publish a book", () => {
    for (const action of ["books.create", "books.edit", "books.delete", "books.publish"]) {
      expect(canPerform(staff, action), action).toBe(false);
    }
  });

  it("staff cannot reach the duplicate sweep or the edit form", () => {
    expect(canAccessRoute(staff, "books.duplicates")).toBe(false);
    expect(canAccessRoute(staff, "books.edit")).toBe(false);
  });

  it("librarians can upload, edit and approve", () => {
    const librarian = as("librarian");
    expect(canAccessRoute(librarian, "books.upload")).toBe(true);
    expect(canPerform(librarian, "books.edit")).toBe(true);
    expect(canPerform(librarian, "books.review.approve")).toBe(true);
  });

  it("admins have the same book capabilities as librarians", () => {
    const admin = as("admin");
    expect(canAccessRoute(admin, "books.upload")).toBe(true);
    expect(canPerform(admin, "books.review.approve")).toBe(true);
  });

  it("a reader cannot reach any book surface at all", () => {
    // `reader` is not an admin-panel role — the layout stops them first — but
    // the policy layer must deny independently, because a Server Action can be
    // POSTed without the layout ever running.
    const reader: AdminViewer = { role: "reader", isSuperAdmin: false, perms: { books: "none" } };
    expect(canAccessRoute(reader, "books.manage")).toBe(false);
    expect(canAccessRoute(reader, "books.upload")).toBe(false);
    expect(canPerform(reader, "books.create")).toBe(false);
  });

  it("a super admin passes everything, even with an empty permission map", () => {
    const sa: AdminViewer = { role: "super_admin", isSuperAdmin: true, perms: {} };
    for (const policy of ROUTE_POLICIES) {
      expect(canAccessRoute(sa, policy.id), policy.id).toBe(true);
    }
    for (const action of Object.keys(ACTION_POLICIES)) {
      expect(canPerform(sa, action), action).toBe(true);
    }
  });
});

describe("BUG #3 — read is access, write is not merely visibility", () => {
  it("read opens every read-level route for its resource", () => {
    const viewer = withPerms("staff", { research: "read", publications: "read", posts: "read" });
    expect(canAccessRoute(viewer, "theses.manage")).toBe(true);
    expect(canAccessRoute(viewer, "publications.manage")).toBe(true);
    expect(canAccessRoute(viewer, "posts.manage")).toBe(true);
  });

  it("read never satisfies a write requirement", () => {
    const viewer = withPerms("staff", { research: "read", publications: "read", posts: "read" });
    for (const id of ["theses.create", "publications.create", "posts.create"]) {
      expect(canAccessRoute(viewer, id), id).toBe(false);
    }
  });

  it("write satisfies read as well — it is a superset, not a sibling", () => {
    for (const resource of ALL_RESOURCE_KEYS) {
      const viewer = withPerms("staff", { [resource]: "write" });
      expect(canRead(viewer, resource), resource).toBe(true);
      expect(canWrite(viewer, resource), resource).toBe(true);
    }
  });

  it("none satisfies neither", () => {
    for (const resource of ALL_RESOURCE_KEYS) {
      const viewer = withPerms("staff", { [resource]: "none" });
      expect(canRead(viewer, resource), resource).toBe(false);
      expect(canWrite(viewer, resource), resource).toBe(false);
    }
  });

  it("an unknown resource is denied, not defaulted", () => {
    const viewer = as("admin");
    expect(canRead(viewer, "resource_that_does_not_exist")).toBe(false);
  });

  it("an unknown policy id is denied rather than treated as unguarded", () => {
    expect(canAccessRoute(as("super_admin"), "not.a.policy")).toBe(false);
    expect(canPerform(as("super_admin"), "not.an.action")).toBe(false);
  });
});

// ── Sidebar ↔ route agreement ───────────────────────────────────────────────

describe("the sidebar and the route guards cannot disagree", () => {
  it("the sidebar asks the registry by policy id and holds no rules of its own", () => {
    const sidebar = read("components/admin/AdminSidebar.tsx");
    expect(sidebar).toContain("canAccessRoute(viewer, policyId)");
    // The old shape: a private `perm(perms, resource, level)` helper that
    // reimplemented the permission comparison next to a hard-coded href.
    expect(sidebar).not.toMatch(/function perm\(\s*perms/);
    expect(sidebar).not.toMatch(/perm\(p,\s*"/);
  });

  it("every href the sidebar links to is a route this registry knows", () => {
    const sidebar = read("components/admin/AdminSidebar.tsx");
    const hrefs = [...sidebar.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(8);
    for (const href of hrefs) {
      expect(resolveRoutePolicy(href), `no policy governs ${href}`).toBeDefined();
    }
  });

  it("the command palette gates its shortcuts on the same ids", () => {
    const sidebar = read("components/admin/AdminSidebar.tsx");
    for (const id of ["books.upload", "theses.create", "publications.create", "posts.create"]) {
      expect(sidebar).toContain(`reach("${id}")`);
    }
  });
});

// ── Every admin page declares its access ────────────────────────────────────

function adminPageFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "page.tsx") out.push(relative(process.cwd(), full));
    }
  };
  walk(join(process.cwd(), ADMIN_ROOT));
  return out.sort();
}

describe("every admin page declares a route policy", () => {
  const files = adminPageFiles();

  it("finds the admin page tree", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files)("%s is guarded or is a pure redirect", (file) => {
    const source = read(file);
    // A page whose entire body is `redirect(...)` to another admin route needs
    // no guard of its own — the destination runs one, and adding a second here
    // would 403 a legacy URL before it could forward.
    const isPureRedirect =
      /redirect\(/.test(source) && !/from "@\/lib\/supabase\/server"/.test(source);
    if (isPureRedirect) return;
    expect(source, `${file} has no requireRouteAccess()`).toMatch(/requireRouteAccess\("[^"]+"\)/);
  });

  it("every declared policy id exists in the registry", () => {
    for (const file of files) {
      for (const m of read(file).matchAll(/requireRouteAccess\("([^"]+)"\)/g)) {
        expect(routePolicy(m[1]), `${file} declares unknown policy ${m[1]}`).toBeDefined();
      }
    }
  });

  it("every route policy points at a page that exists", () => {
    for (const policy of ROUTE_POLICIES) {
      const segment = policy.route.replace(/^\/admin\/?/, "");
      const dir = join(process.cwd(), ADMIN_ROOT, segment);
      expect(existsSync(join(dir, "page.tsx")), `${policy.id} → ${policy.route}`).toBe(true);
    }
  });

  it("no admin page still routes a denial to a silent redirect", () => {
    // The old shape: try { await requirePermission(...) } catch { redirect("/admin") }.
    // It sent a blocked administrator to the dashboard with no explanation, and
    // the same catch swallowed 500s from the permission source.
    for (const file of files) {
      expect(read(file), file).not.toMatch(
        /catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,160}err\.status === 403[\s\S]{0,80}redirect\(/,
      );
    }
  });
});

// ── Route resolution ────────────────────────────────────────────────────────

describe("resolveRoutePolicy", () => {
  it("prefers the most specific pattern", () => {
    expect(resolveRoutePolicy("/admin/books")?.id).toBe("books.manage");
    expect(resolveRoutePolicy("/admin/books/upload")?.id).toBe("books.upload");
    expect(resolveRoutePolicy("/admin/books/duplicates")?.id).toBe("books.duplicates");
  });

  it("prefers a static segment over a dynamic one at the same depth", () => {
    expect(resolveRoutePolicy("/admin/announcements/new")?.id).toBe("announcements.create");
    expect(resolveRoutePolicy("/admin/announcements/templates")?.id).toBe("announcements.templates");
    expect(resolveRoutePolicy("/admin/announcements/abc-123")?.id).toBe("announcements.detail");
    expect(resolveRoutePolicy("/admin/announcements/abc-123/edit")?.id).toBe("announcements.edit");
  });

  it("matches dynamic segments", () => {
    expect(resolveRoutePolicy("/admin/theses/edit/42")?.id).toBe("theses.edit");
    expect(resolveRoutePolicy("/admin/team/9/edit")?.id).toBe("team.edit");
  });

  it("tolerates a trailing slash and a query string", () => {
    expect(resolveRoutePolicy("/admin/books/")?.id).toBe("books.manage");
    expect(resolveRoutePolicy("/admin/books?q=math")?.id).toBe("books.manage");
  });

  it("returns undefined for a route it does not govern", () => {
    expect(resolveRoutePolicy("/admin/not-a-page")).toBeUndefined();
  });

  it("has no duplicate ids or duplicate routes", () => {
    expect(new Set(ROUTE_POLICIES.map((p) => p.id)).size).toBe(ROUTE_POLICIES.length);
    expect(new Set(ROUTE_POLICIES.map((p) => p.route)).size).toBe(ROUTE_POLICIES.length);
  });
});

// ── Denial description ──────────────────────────────────────────────────────

describe("a denial describes itself without leaking anything", () => {
  it("reports the resource, what is required and what the viewer holds", () => {
    const policy = routePolicy("books.upload")!;
    const denial = describeDenial(as("staff"), policy.requires, {
      policyId: policy.id,
      backTo: policy.backTo,
    });
    expect(denial).toMatchObject({
      resource: "books",
      requiredLevel: "write",
      currentLevel: "read",
      backTo: "/admin/books",
    });
  });

  it("reports required roles when the requirement is role-based", () => {
    const policy = routePolicy("security.console")!;
    const denial = describeDenial(as("staff"), policy.requires, { policyId: policy.id });
    expect(denial.requiredRoles).toEqual(ADMIN_ROLES);
    expect(denial.resource).toBeUndefined();
  });

  it("reports the resource for a delegable admin surface", () => {
    // /admin/roles moved from a role list to a permission, so its denial now
    // names the row an administrator would have to grant.
    const policy = routePolicy("roles.manage")!;
    const denial = describeDenial(as("admin"), policy.requires, { policyId: policy.id });
    expect(denial).toMatchObject({ resource: "roles", requiredLevel: "write", currentLevel: "none" });
  });

  it("carries no message, digest, stack or query", () => {
    const denial = describeDenial(as("staff"), routePolicy("books.upload")!.requires, {});
    expect(Object.keys(denial).sort()).toEqual(
      ["backTo", "currentLevel", "policyId", "requiredLevel", "resource"].sort(),
    );
  });

  it("never offers a back link the viewer also cannot reach", () => {
    // A `books: none` account denied the upload page must not be handed
    // /admin/books — that is a second 403 and a dead end.
    const blocked = withPerms("staff", { books: "none" });
    expect(reachableFallback(blocked, routePolicy("books.upload")!)).toBe("/admin");
    expect(reachableFallback(as("staff"), routePolicy("books.upload")!)).toBe("/admin/books");
  });

  it("every backTo target is itself a governed route", () => {
    for (const policy of ROUTE_POLICIES) {
      if (!policy.backTo) continue;
      expect(resolveRoutePolicy(policy.backTo), `${policy.id} → ${policy.backTo}`).toBeDefined();
    }
  });
});

// ── The registry's own shape ────────────────────────────────────────────────

describe("registry integrity", () => {
  it("every perm-based requirement names a resource the matrix can actually set", () => {
    const known = new Set(ALL_RESOURCE_KEYS);
    for (const policy of ROUTE_POLICIES) {
      if (policy.requires.kind !== "perm") continue;
      expect(known.has(policy.requires.resource), `${policy.id} → ${policy.requires.resource}`).toBe(true);
    }
    for (const [id, req] of Object.entries(ACTION_POLICIES)) {
      if (req.kind !== "perm") continue;
      expect(known.has(req.resource), `${id} → ${req.resource}`).toBe(true);
    }
  });

  it("every action policy requires write, or is an explicitly read-level view", () => {
    for (const [id, req] of Object.entries(ACTION_POLICIES)) {
      if (req.kind !== "perm") continue;
      if (req.level === "read") {
        expect(id, `${id} is read-level`).toMatch(/\.view$/);
      }
    }
  });

  it("resourceCapabilities is derived, so it can never contradict the tables", () => {
    const books = resourceCapabilities("books");
    expect(books.readRoutes).toContain("/admin/books");
    expect(books.readRoutes).toContain("/admin/review");
    expect(books.writeRoutes).toContain("/admin/books/upload");
    expect(books.writeRoutes).not.toContain("/admin/books");
    expect(books.writeActions).toContain("books.review.approve");
  });

  it("`roles` is delegable through the matrix, page and save agreeing", () => {
    // Page and mutation carry the same requirement. A page and its save
    // disagreeing is how "you can open the editor but not save" happens.
    expect(routePolicy("roles.manage")!.requires).toEqual({
      kind: "perm",
      resource: "roles",
      level: "write",
    });
    expect(ACTION_POLICIES["roles.save"]).toEqual({
      kind: "perm",
      resource: "roles",
      level: "write",
    });
    expect(read("app/(admin)/admin/(protected)/roles/actions.ts")).toContain(
      'requireAction("roles.save")',
    );
  });

  it("delegation changes nothing for the five shipped roles", () => {
    // The whole point of a safe delegation: `roles` defaults to write for
    // super_admin and none for everyone else, so replacing the hardcoded
    // super-admin check with a permission produces the identical answer until
    // a super admin deliberately delegates.
    for (const role of ALL_ROLES) {
      expect(canAccessRoute(as(role), "roles.manage"), role).toBe(role === "super_admin");
      expect(canPerform(as(role), "roles.save"), role).toBe(role === "super_admin");
    }
  });

  it("an admin granted `roles: write` can reach the page and the save", () => {
    const delegate = withPerms("admin", { roles: "write" });
    expect(canAccessRoute(delegate, "roles.manage")).toBe(true);
    expect(canPerform(delegate, "roles.save")).toBe(true);
  });

  it("`roles` is flagged elevated, and the rules that bound it are named", () => {
    expect(isElevatedResource("roles")).toBe(true);
    // Nothing else claims elevated status — the flag drives a warning the
    // editor reads before handing over every other permission.
    expect(ALL_RESOURCE_KEYS.filter(isElevatedResource)).toEqual(["roles"]);
    expect(Object.keys(ROLES_DELEGATION_RULES).sort()).toEqual([
      "rolesRowSuperAdminOnly",
      "superAdminRowImmutable",
      "wellFormedChange",
    ]);
  });

  it("the save action implements every delegation rule", () => {
    // Source scan: the rules are only real if the one write path applies them.
    const source = read("app/(admin)/admin/(protected)/roles/actions.ts");
    // superAdminRowImmutable
    expect(source).toMatch(/c\.role === "super_admin"/);
    // rolesRowSuperAdminOnly — checked per cell, so bulk paths are covered too
    expect(source).toMatch(/isElevatedResource\(c\.resource\) && !editorIsSuperAdmin/);
    // wellFormedChange
    expect(source).toContain("VALID_RESOURCES.has");
    expect(source).toContain("VALID_LEVELS.has");
  });

  it("no bulk helper silently exempts the roles row any more", () => {
    // It used to, while `roles` was un-editable. Now that a super admin may
    // legitimately move it, the exemption would hide their own bulk edit from
    // them — and the server, not the shape helpers, holds the line.
    expect(read("lib/admin/roles-shared.ts")).not.toContain("isFixedResource");
  });

  it("satisfies() is total over every role and requirement", () => {
    for (const role of ALL_ROLES) {
      for (const policy of ROUTE_POLICIES) {
        expect(typeof satisfies(as(role), policy.requires)).toBe("boolean");
      }
    }
  });
});

// ── Default-role snapshot ───────────────────────────────────────────────────

describe("what each default role can reach", () => {
  const reachable = (role: AppRole) =>
    ROUTE_POLICIES.filter((p) => canAccessRoute(as(role), p.id)).map((p) => p.id);

  it("staff gets every read hub and no write route", () => {
    const ids = reachable("staff");
    expect(ids).toContain("books.manage");
    expect(ids).toContain("books.review");
    expect(ids).toContain("catalog.manage");
    expect(ids).toContain("theses.manage");
    expect(ids).toContain("publications.manage");
    expect(ids).toContain("posts.manage"); // staff holds posts: write
    for (const denied of [
      "books.upload",
      "books.duplicates",
      "books.edit",
      "catalog.create",
      "theses.create",
      "publications.create",
      "users.manage",
      "roles.manage",
      "settings.manage",
      "security.console",
      "logs.activity",
    ]) {
      expect(ids, `staff should not reach ${denied}`).not.toContain(denied);
    }
  });

  it("librarian gets the library write routes but not administration", () => {
    const ids = reachable("librarian");
    expect(ids).toContain("books.upload");
    expect(ids).toContain("catalog.create");
    expect(ids).toContain("theses.create");
    expect(ids).not.toContain("users.manage");
    expect(ids).not.toContain("roles.manage");
    expect(ids).not.toContain("settings.manage");
  });

  it("librarian reads posts and announcements but cannot write them", () => {
    expect(canAccessRoute(as("librarian"), "posts.manage")).toBe(true);
    expect(canAccessRoute(as("librarian"), "posts.create")).toBe(false);
    expect(canAccessRoute(as("librarian"), "announcements.manage")).toBe(true);
    expect(canAccessRoute(as("librarian"), "announcements.create")).toBe(false);
  });

  it("admin gets everything except role management", () => {
    const ids = reachable("admin");
    expect(ids).toContain("users.manage");
    expect(ids).toContain("settings.manage");
    expect(ids).toContain("security.console");
    expect(ids).not.toContain("roles.manage");
  });

  it("super_admin reaches every route", () => {
    expect(reachable("super_admin")).toHaveLength(ROUTE_POLICIES.length);
  });

  it("the dashboard is reachable by every panel role — a 403 on sign-in is a lockout", () => {
    for (const role of ["staff", "librarian", "admin", "super_admin"] as const) {
      expect(canAccessRoute(as(role), "dashboard"), role).toBe(true);
      expect(canAccessRoute(as(role), "profile"), role).toBe(true);
    }
  });
});
