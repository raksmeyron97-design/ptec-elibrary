// Source scan, like the other invariant tests in this repo: a sidebar entry
// whose gate does not match its destination's guard is valid TypeScript,
// renders fine, and shows up in production either as a link that 403s or — the
// worse direction — as a hidden link in front of a route with no guard at all.
// Both existed here before this file did.
//
// Since the authorization registry landed, an entry no longer *has* a gate of
// its own: it names a route policy id, and the destination enforces that same
// id. So what this file checks changed shape — from "do two hand-written rules
// agree?" to "does every entry point at a real policy, and does the page
// actually declare it?".

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BOOKS_NAV, canReachEntry, hrefFor, visibleBooksNav, type BooksNavKey, type NavViewer } from "./books-nav";
import { routePolicy } from "./access-policy";
import { EBOOKS_UPLOAD_PATH } from "./ebooks-url";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { AppRole } from "@/lib/types/roles";

/** The page file that must declare each destination's policy id. */
const ROUTE_FILE: Record<BooksNavKey, string> = {
  manage: "app/(admin)/admin/(protected)/books/page.tsx",
  review: "app/(admin)/admin/(protected)/review/page.tsx",
  requests: "app/(admin)/admin/(protected)/book-requests/page.tsx",
  duplicates: "app/(admin)/admin/(protected)/books/duplicates/page.tsx",
  catalog: "app/(admin)/admin/(protected)/catalogs/page.tsx",
};

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const viewer = (role: AppRole): NavViewer => ({
  role,
  isSuperAdmin: false,
  perms: DEFAULT_PERMISSIONS[role],
});

const keysOf = (v: NavViewer) => visibleBooksNav(v).map((e) => e.key);

describe("Books section shape", () => {
  it("is ordered hub → queues → sweep → physical collection", () => {
    expect(BOOKS_NAV.map((e) => e.key)).toEqual([
      "manage",
      "review",
      "requests",
      "duplicates",
      "catalog",
    ]);
  });

  it("does not offer Upload as a destination", () => {
    // Upload is an action on the collection, reached from the Manage E-books
    // workspace. Its route is unchanged and every other entry point still
    // points at it — only the sidebar entry is gone.
    expect(BOOKS_NAV.map(hrefFor)).not.toContain(EBOOKS_UPLOAD_PATH);
    expect(read("components/admin/ebooks/EbookToolbar.tsx")).toContain("EBOOKS_UPLOAD_PATH");
    expect(read("components/admin/ebooks/BooksWorkspaceNav.tsx")).toContain("EBOOKS_UPLOAD_PATH");
  });

  it("hangs a badge only on the two entries that carry waiting work", () => {
    expect(BOOKS_NAV.filter((e) => e.badge).map((e) => e.key)).toEqual(["review", "requests"]);
  });
});

describe("every entry points at a policy its destination declares", () => {
  it.each(BOOKS_NAV)("$key resolves to a real route policy", (entry) => {
    expect(routePolicy(entry.policyId), `unknown policy ${entry.policyId}`).toBeDefined();
  });

  it.each(BOOKS_NAV)("$key's page declares the same policy id", (entry) => {
    // This is the join that used to be a pair of independently maintained
    // rules. If the page stops declaring the id, the sidebar's gate becomes a
    // guess again — and the test fails instead.
    expect(read(ROUTE_FILE[entry.key])).toContain(`requireRouteAccess("${entry.policyId}")`);
  });

  it("the physical catalog enforces `catalog`, not `books`", () => {
    // The regression this exists for: every catalog action checked `books`,
    // which made the `catalog` row on /admin/roles — labelled "Physical
    // collection and copy records" — decide nothing at all.
    for (const file of [
      "app/(admin)/admin/(protected)/catalogs/actions.ts",
      "app/(admin)/admin/(protected)/catalogs/copy-actions.ts",
      "app/(admin)/admin/(protected)/catalogs/import-actions.ts",
    ]) {
      const source = read(file);
      expect(source).toContain('requirePermission("catalog"');
      expect(source).not.toContain('requirePermission("books"');
    }
  });

  it("no book route hand-rolls its own role check", () => {
    // Two catalog pages used to fetch `profiles.role` and compare it against a
    // local array — a third authorization mechanism that neither the permission
    // table nor `is_super_admin` reached.
    for (const file of [
      "app/(admin)/admin/(protected)/catalogs/add/page.tsx",
      "app/(admin)/admin/(protected)/catalogs/edit/[id]/page.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("requireRouteAccess(");
      expect(source).not.toMatch(/\.from\("profiles"\)[\s\S]{0,80}select\("role"/);
    }
  });
});

describe("what each default role sees", () => {
  it("gives staff every read surface and nothing that mutates", () => {
    // staff: books read, catalog read. The review queue joined this list when
    // it moved from `requireLibrarian()` to `books: read` — reading a backlog
    // is reading. The duplicate sweep is destructive and stays out.
    expect(keysOf(viewer("staff"))).toEqual(["manage", "review", "requests", "catalog"]);
  });

  it("gives librarians and admins the whole section", () => {
    for (const role of ["librarian", "admin", "super_admin"] as const) {
      expect(keysOf(viewer(role))).toEqual([
        "manage",
        "review",
        "requests",
        "duplicates",
        "catalog",
      ]);
    }
  });

  it("shows a super admin everything even with an empty permission map", () => {
    // requirePermission short-circuits for super admins, so the sidebar must
    // not hide what the server would let them through to.
    const sa: NavViewer = { role: "librarian", isSuperAdmin: true, perms: {} };
    expect(keysOf(sa)).toHaveLength(BOOKS_NAV.length);
  });

  it("hides an entry the moment its permission is revoked", () => {
    const restricted: NavViewer = {
      role: "librarian",
      isSuperAdmin: false,
      perms: { ...DEFAULT_PERMISSIONS.librarian, catalog: "none", books: "read" },
    };
    expect(keysOf(restricted)).toEqual(["manage", "review", "requests"]);
  });

  it("hides the whole section from an account with neither collection", () => {
    const none: NavViewer = {
      role: "staff",
      isSuperAdmin: false,
      perms: { books: "none", catalog: "none" },
    };
    expect(keysOf(none)).toEqual([]);
    expect(BOOKS_NAV.every((e) => !canReachEntry(e, none))).toBe(true);
  });
});
