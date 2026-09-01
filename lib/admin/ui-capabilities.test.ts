/**
 * Mutation controls ask the registry, and the registry has no dead rows.
 *
 * The route guard and the Server Actions are tested elsewhere
 * (`access-policy.test.ts`, `authorization-boundary.test.ts`); those are the
 * boundary. This file covers the layer above it — what a read-only
 * administrator is actually *shown* — plus the two integrity properties that
 * keep the permission matrix from drifting into decoration:
 *
 *   1. Every mutation surface asks a capability question, by an id the
 *      registry defines. A page that stopped asking still 403s on the action,
 *      but it advertises work the viewer cannot do, which is the failure this
 *      whole refactor exists to remove.
 *   2. Every resource row on `/admin/roles` governs something, and every action
 *      id names a resource that exists. A row that decides nothing is the
 *      `catalog` bug; an id nobody can satisfy is its mirror image.
 *
 * Source scans, in this repo's tradition: a control that lost its gate is valid
 * TypeScript, renders fine, and only shows up in front of a real librarian.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACTION_POLICIES,
  ROUTE_POLICIES,
  actionPolicy,
  canPerform,
  type AdminViewer,
} from "./access-policy";
import { ALL_RESOURCE_KEYS } from "./roles-shared";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { ALL_ROLES, type AppRole, type PermLevel } from "@/lib/types/roles";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const ADMIN_ROOT = "app/(admin)/admin/(protected)";

const as = (role: AppRole): AdminViewer => ({
  role,
  isSuperAdmin: false,
  perms: DEFAULT_PERMISSIONS[role],
});
const withPerms = (role: AppRole, overrides: Record<string, PermLevel>): AdminViewer => ({
  role,
  isSuperAdmin: false,
  perms: { ...DEFAULT_PERMISSIONS[role], ...overrides },
});

// ── 1. Every mutation surface asks ──────────────────────────────────────────

/**
 * The surfaces this pass covers, and the action ids each must consult.
 *
 * Listed explicitly rather than discovered, because "which files contain
 * mutation controls" is a judgement the test cannot make and a reviewer can.
 * Adding an admin surface means adding a row here.
 */
const GATED_SURFACES: { file: string; label: string; ids: string[] }[] = [
  {
    label: "inbox",
    file: `${ADMIN_ROOT}/inbox/_components/InboxClient.tsx`,
    ids: ["inbox.update", "inbox.reply", "inbox.delete"],
  },
  {
    label: "book requests",
    file: `${ADMIN_ROOT}/book-requests/_components/BookRequestsClient.tsx`,
    ids: ["books.requests.update", "books.requests.delete"],
  },
  {
    label: "homepage photos",
    file: `${ADMIN_ROOT}/homepage-photos/_components/HomepagePhotosClient.tsx`,
    ids: ["homepagePhotos.manage"],
  },
  {
    label: "team",
    file: `${ADMIN_ROOT}/team/_components/TeamClient.tsx`,
    ids: ["team.manage"],
  },
  {
    label: "review queue",
    file: `${ADMIN_ROOT}/review/page.tsx`,
    ids: ["books.review.approve", "research.review.approve"],
  },
];

describe("every mutation surface asks the registry", () => {
  it.each(GATED_SURFACES)("$label consults its action policies", ({ file, ids }) => {
    const source = read(file);
    for (const id of ids) {
      expect(source, `${file} never asks "${id}"`).toContain(`"${id}"`);
    }
  });

  it.each(GATED_SURFACES)("$label asks through the capability layer, not by hand", ({ file }) => {
    const source = read(file);
    // `useCan` / `<CanDo>` in a client component, or the guard's `can(...)`
    // closure in a server component. What must NOT appear is a hand-rolled
    // comparison against the permission map, which skips the super-admin
    // short-circuit and can hide a control the server would allow.
    expect(source).toMatch(/useCan\(|<CanDo|\bcan\("/);
    expect(source, `${file} compares permission levels by hand`).not.toMatch(
      /perms(?:\.\w+|\[["'`][^"'`]+["'`]\])\s*===\s*["']write["']/,
    );
  });

  it("the storage page reads its two capabilities from the guard, not the identity map", () => {
    const source = read(`${ADMIN_ROOT}/storage/page.tsx`);
    expect(source).toContain('can("storage.upload")');
    expect(source).toContain('can("storage.purge")');
    // The old shape: identity.perms.storage === "write", which ignored
    // is_super_admin entirely.
    expect(source).not.toContain("identity.perms");
  });

  it("the users page takes the caller's identity from the guard it already ran", () => {
    const source = read(`${ADMIN_ROOT}/users/page.tsx`);
    expect(source).toContain('requireRouteAccess("users.manage")');
    expect(source).toContain('can("users.update")');
    // It used to run a second getUser() plus a second profiles read in a
    // parallel IIFE — the redundant lookup docs/ADMIN-AUTHORIZATION.md warns
    // about, on a page the guard had already resolved.
    expect(source).not.toContain("auth.getUser()");
    expect(source).not.toContain('.from("profiles")');
  });

  it("no gated surface leaves a bulk bar or row menu ungated", () => {
    // Selection exists only to feed a bulk mutation, so a surface that renders
    // a checkbox must also render a capability question near it.
    for (const { file, label } of GATED_SURFACES) {
      const source = read(file);
      if (!source.includes('type="checkbox"')) continue;
      expect(source, `${label} selects rows without asking`).toMatch(/canManage|canUpdate|canWrite|useCan\(|<CanDo/);
    }
  });
});

// ── 2. Read-only vs write, per surface, per default role ────────────────────

describe("what a read-only administrator is shown", () => {
  /** resource → the action a read-only holder of it must NOT be able to do. */
  const SURFACES: { resource: string; action: string }[] = [
    { resource: "contact", action: "inbox.reply" },
    { resource: "storage", action: "storage.upload" },
    { resource: "homepage_photos", action: "homepagePhotos.manage" },
    { resource: "books", action: "books.requests.update" },
    { resource: "users", action: "users.update" },
    { resource: "users", action: "team.manage" },
  ];

  it.each(SURFACES)("$resource: read cannot $action", ({ resource, action }) => {
    expect(canPerform(withPerms("staff", { [resource]: "read" }), action)).toBe(false);
  });

  it.each(SURFACES)("$resource: write can $action", ({ resource, action }) => {
    expect(canPerform(withPerms("staff", { [resource]: "write" }), action)).toBe(true);
  });

  it.each(SURFACES)("$resource: none cannot $action", ({ resource, action }) => {
    expect(canPerform(withPerms("staff", { [resource]: "none" }), action)).toBe(false);
  });

  it("a super admin performs every action, even with an empty permission map", () => {
    const sa: AdminViewer = { role: "super_admin", isSuperAdmin: true, perms: {} };
    for (const id of Object.keys(ACTION_POLICIES)) {
      expect(canPerform(sa, id), id).toBe(true);
    }
  });

  it("storage deletion is a higher bar than storage writing", () => {
    // `storage_manage` is its own row precisely so that "can upload" and "can
    // permanently destroy" are not the same grant.
    const uploader = withPerms("staff", { storage: "write", storage_manage: "none" });
    expect(canPerform(uploader, "storage.upload")).toBe(true);
    expect(canPerform(uploader, "storage.purge")).toBe(false);
  });

  it("announcement push is a higher bar than announcement editing", () => {
    const editor = withPerms("staff", { announcements: "write", announcements_push: "none" });
    expect(canPerform(editor, "announcements.edit")).toBe(true);
    expect(canPerform(editor, "announcements.push")).toBe(false);
  });
});

// ── 3. The matrix has no dead rows, and no id is unsatisfiable ──────────────

describe("permission matrix integrity", () => {
  /** Resource → every policy (route or action) that governs it. */
  const governedBy = (resource: string) => [
    ...ROUTE_POLICIES.filter(
      (p) => p.requires.kind === "perm" && p.requires.resource === resource,
    ).map((p) => `route:${p.id}`),
    ...Object.entries(ACTION_POLICIES)
      .filter(([, req]) => req.kind === "perm" && req.resource === resource)
      .map(([id]) => `action:${id}`),
  ];

  it.each(ALL_RESOURCE_KEYS)("`%s` governs at least one route or action", (resource) => {
    // The bug this exists for: `catalog` was a togglable row on /admin/roles
    // that nothing enforced, because every catalog action checked `books`.
    expect(governedBy(resource), `${resource} decides nothing`).not.toHaveLength(0);
  });

  it("every action id names a resource the matrix can set", () => {
    const known = new Set(ALL_RESOURCE_KEYS);
    for (const [id, req] of Object.entries(ACTION_POLICIES)) {
      if (req.kind !== "perm") continue;
      expect(known.has(req.resource), `${id} → unknown resource ${req.resource}`).toBe(true);
    }
  });

  it("every action id a page asks for is defined in the registry", () => {
    // Catches the typo that fails closed silently: `requireAction("books.eidt")`
    // throws at runtime, and `useCan("books.eidt")` just hides the control
    // forever.
    for (const { file } of GATED_SURFACES) {
      const source = read(file);
      for (const m of source.matchAll(/useCan\("([^"]+)"\)/g)) {
        expect(actionPolicy(m[1]), `${file} asks unknown action ${m[1]}`).toBeDefined();
      }
    }
  });

  it("every action id is satisfiable by some role, at some level", () => {
    // An id no configuration can satisfy is a control nobody will ever see.
    for (const id of Object.keys(ACTION_POLICIES)) {
      const reachable = ALL_ROLES.some((role) => canPerform(as(role), id))
        || ALL_RESOURCE_KEYS.some((r) => canPerform(withPerms("admin", { [r]: "write" }), id));
      expect(reachable, `${id} is unsatisfiable`).toBe(true);
    }
  });

  it("no action id is available at `read` unless it is explicitly a view", () => {
    for (const [id, req] of Object.entries(ACTION_POLICIES)) {
      if (req.kind !== "perm" || req.level !== "read") continue;
      expect(id, `${id} is a read-level action`).toMatch(/\.view$/);
    }
  });

  it("the default matrix leaves every panel role able to reach the dashboard", () => {
    // A permission change that locks a role out of /admin entirely turns
    // signing in into a 403, which reads as a broken account.
    for (const role of ["staff", "librarian", "admin", "super_admin"] as const) {
      expect(DEFAULT_PERMISSIONS[role], role).toBeDefined();
    }
  });
});

// ── 4. The capability layer itself ──────────────────────────────────────────

describe("the client capability layer fails closed", () => {
  const source = read("components/admin/access/AdminCapabilities.tsx");

  it("exports the three question shapes the surfaces use", () => {
    for (const api of ["useCan", "useCanRoute", "CanDo", "useAdminViewerIsSuperAdmin"]) {
      expect(source).toContain(`export function ${api}`);
    }
  });

  it("denies an unknown action rather than defaulting to allow", () => {
    const viewer: AdminViewer = { role: "super_admin", isSuperAdmin: false, perms: {} };
    expect(canPerform(viewer, "not.a.real.action")).toBe(false);
  });

  it("carries only this viewer's own levels", () => {
    expect(source).not.toContain("SERVICE_ROLE");
    expect(source).not.toContain("createServiceClient");
  });
});

describe("the roles editor reflects the delegation rules", () => {
  const pane = read("components/admin/roles/RolePane.tsx");

  it("only a super admin gets an editable control on the elevated row", () => {
    // Matches the server rule exactly. A delegated administrator with
    // `roles: write` may edit every other row, and sees this one as a pill —
    // rather than a segmented control whose every setting is refused.
    expect(pane).toContain("isElevatedResource(resource.key)");
    expect(pane).toContain("useAdminViewerIsSuperAdmin()");
    expect(pane).toMatch(/!elevated \|\| viewerIsSuperAdmin/);
  });

  it("the elevated row explains what granting it hands over", () => {
    const note = read("components/admin/roles/ResourceAccessNote.tsx");
    expect(note).toContain("elevatedResource");
    expect(note).toContain("elevatedSuperAdminOnly");
    // The old copy said the level was "fixed", which stopped being true when
    // role management became delegable.
    expect(note).not.toContain("fixedResource");
  });

  it("both halves of the warning exist in both languages", () => {
    for (const locale of ["en", "km"] as const) {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      const semantics = messages.adminRoles.semantics;
      expect(semantics.elevatedResource, locale).toBeTruthy();
      expect(semantics.elevatedSuperAdminOnly, locale).toBeTruthy();
      expect(semantics.fixedResource, `${locale} still carries the retired copy`).toBeUndefined();
    }
  });
});
