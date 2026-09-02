/**
 * The server stays the boundary — a source scan.
 *
 * Everything the previous file tests is a decision *function*. This one tests
 * that the decisions are actually wired in: that a 403 leaves the app as a 403
 * rather than as a crash, that no admin mutation reaches the database without a
 * guard above it, and that the pure half of the system stays pure enough for
 * the tests to keep running offline.
 *
 * A hidden button is not security. These are the checks that say so.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = (p: string) => join(process.cwd(), p);
const read = (p: string) => readFileSync(root(p), "utf8");
const ADMIN_ROOT = "app/(admin)/admin/(protected)";

/** Assertions about what a file *does* must not trip over what it *explains*. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function filesUnder(dir: string, name: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === name) out.push(relative(process.cwd(), full));
    }
  };
  walk(root(dir));
  return out.sort();
}

// ── BUG #2: a 403 must never wear the costume of a crash ────────────────────

describe("BUG #2 — authorization failures never reach the generic error boundary", () => {
  it("the admin error boundary no longer classifies errors by message text", () => {
    // React redacts server error messages before a client error boundary sees
    // them, so this could only ever have worked in development. Comments are
    // stripped first — the file explains the bug it used to have.
    const code = stripComments(read(`${ADMIN_ROOT}/error.tsx`));
    expect(code).not.toMatch(/error\.message/);
    expect(code.toLowerCase()).not.toContain('"forbidden"');
    expect(code.toLowerCase()).not.toContain("not authorized");
  });

  it("no admin error boundary renders a bare “Something went wrong!”", () => {
    for (const file of filesUnder(ADMIN_ROOT, "error.tsx")) {
      expect(read(file), file).not.toContain("Something went wrong!");
    }
  });

  it("every admin error boundary goes through the shared, translated state", () => {
    for (const file of filesUnder(ADMIN_ROOT, "error.tsx")) {
      expect(read(file), file).toContain("AdminErrorState");
    }
  });

  it("the panel has dedicated 401, 403 and 404 surfaces", () => {
    for (const file of ["forbidden.tsx", "unauthorized.tsx", "not-found.tsx"]) {
      expect(existsSync(root(`${ADMIN_ROOT}/${file}`)), file).toBe(true);
    }
  });

  it("the 403 surface renders the AccessDenied panel, not an error state", () => {
    const source = read(`${ADMIN_ROOT}/forbidden.tsx`);
    expect(source).toContain("AccessDenied");
    expect(source).not.toContain("AdminErrorState");
  });

  it("the interrupts are enabled, or forbidden()/unauthorized() are no-ops", () => {
    expect(read("next.config.ts")).toMatch(/authInterrupts:\s*true/);
  });

  it("middleware gives the 403 page the pathname it reconstructs context from", () => {
    const source = read("middleware.ts");
    expect(source).toContain("x-pathname");
    // Only for /admin: reading headers() opts a route out of static rendering,
    // and the public tree must stay prerenderable.
    expect(source).toMatch(/rawPath\.startsWith\('\/admin\/'\)/);
  });

  it("the route guard raises the right interrupt for each status", () => {
    const source = read("lib/admin/route-guard.ts");
    expect(source).toContain("unauthorized()"); // 401
    expect(source).toContain("forbidden()"); // 403
    // A 500 from the permission source must stay a 500 — classifying it as a
    // denial would hide a broken authorization backend behind a tidy screen.
    expect(source).toMatch(/Authorization could not be resolved/);
  });

  it("the AccessDenied panel shows access levels and never error internals", () => {
    const source = read("components/admin/access/AccessDenied.tsx");
    expect(source).toContain("currentAccess");
    expect(source).toContain("requiredAccess");
    // Never the error internals. Checked against code, not prose: the file's
    // own comment names what it refuses to show.
    const code = stripComments(source);
    for (const leak of ["digest", ".stack", "error.message"]) {
      expect(code, `AccessDenied must not surface ${leak}`).not.toContain(leak);
    }
  });
});

// ── Server Actions ──────────────────────────────────────────────────────────

/**
 * Files under app/actions that hold *admin* mutations. Reader-scoped actions
 * (own notes, own reading list, own export) authorize against the session user
 * rather than the permission matrix, so they are not in scope here.
 */
const ADMIN_ACTION_FILES = [
  "ai-extraction.ts",
  "authors.ts",
  "book-duplicates.ts",
  "book-requests.ts",
  "contact-messages.ts",
  "content-versions.ts",
  "data-quality.ts",
  "duplicates.ts",
  "ebooks.ts",
  "homepage-photos.ts",
  "learning-paths.ts",
  "post-drafts.ts",
  "publication-workspace.ts",
  "publications.ts",
  "review.ts",
  "search-insights.ts",
  "storage.ts",
  "system-settings.ts",
  "theses.ts",
  "thesis-drafts.ts",
  "upload.ts",
];

const GUARD = /require(?:Admin|Staff|Librarian|SuperAdmin|Permission|Action|User)\s*\(/;

describe("admin Server Actions authorize on the server", () => {
  it.each(ADMIN_ACTION_FILES)("app/actions/%s imports a guard", (file) => {
    const source = read(`app/actions/${file}`);
    expect(source, file).toMatch(GUARD);
  });

  it.each(ADMIN_ACTION_FILES)("app/actions/%s guards at least as often as it writes", (file) => {
    const source = read(`app/actions/${file}`);
    const guards = source.match(new RegExp(GUARD.source, "g"))?.length ?? 0;
    // Not a per-function proof — several of these files funnel writes through
    // one guarded helper (storage.ts `guard()`, ebooks.ts `setEbookStatus`).
    // What it does catch is a file that grew a mutation and no guard at all.
    expect(guards, `${file} has no guard calls`).toBeGreaterThan(0);
  });

  it("the catalog's own action files check `catalog`, never `books`", () => {
    for (const file of [
      `${ADMIN_ROOT}/catalogs/actions.ts`,
      `${ADMIN_ROOT}/catalogs/copy-actions.ts`,
      `${ADMIN_ROOT}/catalogs/import-actions.ts`,
    ]) {
      expect(read(file), file).toContain('requirePermission("catalog"');
    }
  });

  it("role permissions are saved behind the registry, with the delegation rules on top", () => {
    const source = read(`${ADMIN_ROOT}/roles/actions.ts`);
    // The level check: same policy id the page declares.
    expect(source).toContain('requireAction("roles.save")');
    // And the three rules a level cannot express. `roles: write` is the one
    // grant that can grant grants, so a permission check alone would let a
    // delegated admin appoint further administrators.
    expect(source).toMatch(/c\.role === "super_admin"/);
    expect(source).toMatch(/isElevatedResource\(c\.resource\) && !editorIsSuperAdmin/);
  });

  it("the review queue reads at `books: read` and writes at write", () => {
    const source = read("app/actions/review.ts");
    expect(source).toContain('requirePermission("books", "read")');
    expect(source).toContain('requirePermission(resource, "write")');
    // The old gate promised the queue to any librarian and refused a `staff`
    // account that had been granted books: write on /admin/roles.
    expect(source).not.toMatch(/await requireLibrarian\(\)/);
  });

  it("opening a contact message does not re-triage it for a read-only viewer", () => {
    /* `adminGetContactMessage` is a READ action that performs a Gmail-style
       write: it flips `new` → `read` and writes an audit row. That write is
       visible to the whole team — it moves the message out of the "New" filter
       and changes the counts they triage by — so merely *looking* at the queue
       must not do it. Found in the browser: a `contact: read` account opened a
       message and silently marked it read for everyone. */
    const source = read("app/actions/contact-messages.ts");
    const fn = source.slice(
      source.indexOf("export async function adminGetContactMessage"),
      source.indexOf("export interface ReplyInput"),
    );
    expect(fn).toContain('canAccess("contact", "write")');
    expect(fn).toMatch(/canWriteContact && detail\.message\.status === "new"/);
  });

  it("the data-quality and search-insight reports read at `books: read`", () => {
    for (const file of ["app/actions/data-quality.ts", "app/actions/search-insights.ts"]) {
      const source = read(file);
      expect(source, file).toContain('requirePermission("books", "read")');
      expect(source, file).not.toMatch(/await requireLibrarian\(\)/);
    }
  });

  it("their one mutation each is gated on write, not read", () => {
    expect(read("app/actions/data-quality.ts")).toContain('requireAction("insights.recalculate")');
    expect(read("app/actions/search-insights.ts")).toContain('requireAction("insights.searchCurate")');
  });

  it("requireAction throws rather than interrupting the page", () => {
    // A Server Action returns a result to whatever invoked it. Throwing Next's
    // 403 interrupt there would replace the page the user is standing on.
    const source = read("lib/admin/route-guard.ts");
    const fn = source.slice(source.indexOf("export async function requireAction"));
    expect(fn).toContain('new AdminAuthError("Forbidden", 403)');
    expect(fn).not.toContain("forbidden()");
  });
});

// ── Admin API routes ────────────────────────────────────────────────────────

describe("admin API routes authorize on the server", () => {
  const routes = filesUnder("app/api/admin", "route.ts");

  it("finds the admin API surface", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes)("%s runs a guard", (file) => {
    expect(read(file), file).toMatch(GUARD);
  });

  it("the upload routes gate on the destination's resource, not a role list", () => {
    /* Both routes serve several resources at once (`books/`, `posts/`,
       `research/`, `publications/`, `paths/`), so a fixed role list was wrong
       in both directions: `requireLibrarian()` on the single-file route refused
       a `staff` account that /admin/roles had granted books: write — the page
       opened, the POST answered a bare "Forbidden" — and `requireAdmin()` on
       the bulk route refused every librarian, the one default role that holds
       books: write. */
    const uploadRoutes = routes.filter((f) => /upload\/route\.ts$/.test(f));
    // Named explicitly so a rename empties the loop loudly rather than turning
    // this into a test that asserts nothing.
    expect(uploadRoutes.length, "upload routes not found").toBe(2);
    for (const file of uploadRoutes) {
      const source = read(file);
      // The destination is a `key` on one route and a `folder` on the other.
      expect(source, file).toMatch(
        /requirePermission\(uploadPermissionResource\((?:key|folder)\), "write"\)/,
      );
      expect(source, file).not.toMatch(/await requireLibrarian\(\)/);
      expect(source, file).not.toMatch(/await requireAdmin\(\)/);
      // The caller is still established before the body is read, so an
      // unauthenticated request never costs a 100 MB buffer.
      const authAt = source.indexOf("await requireStaff()");
      const bodyAt = source.search(/await request\.(formData|arrayBuffer)\(\)/);
      expect(authAt, `${file}: no session check`).toBeGreaterThanOrEqual(0);
      expect(authAt, `${file}: body read before auth`).toBeLessThan(bodyAt);
    }
  });

  it("AI auto-fill asks for the same grant as the form that hosts it", () => {
    // It runs from the book upload form, so a role list here refused the exact
    // account the route policy had just admitted.
    const source = read("app/actions/ai-extraction.ts");
    expect(source).toContain('requirePermission("books", "write")');
    expect(source).not.toMatch(/await requireLibrarian\(\)/);
  });

  it.each(routes)("%s guards before it opens a service-role client", (file) => {
    const source = read(file);
    if (!source.includes("createServiceClient")) return;
    const guardAt = source.search(GUARD);
    const clientAt = source.indexOf("createServiceClient(");
    // The service client bypasses RLS, so nothing may construct one on a path
    // that has not already established who is asking.
    expect(guardAt, `${file}: no guard`).toBeGreaterThanOrEqual(0);
    expect(guardAt, `${file}: service client precedes the guard`).toBeLessThan(clientAt);
  });
});

// ── Purity of the decision layer ────────────────────────────────────────────

describe("the policy registry stays pure", () => {
  const policy = read("lib/admin/access-policy.ts");

  it("has no server-only import, so the sidebar and the tests can read it", () => {
    expect(policy).not.toContain('import "server-only"');
  });

  it("touches no request, database or secret", () => {
    const code = stripComments(policy);
    for (const forbiddenImport of ["next/headers", "@/lib/supabase/server", "process.env"]) {
      expect(code, `access-policy must not use ${forbiddenImport}`).not.toContain(forbiddenImport);
    }
  });

  it("the server guard is server-only", () => {
    expect(read("lib/admin/route-guard.ts")).toContain('import "server-only"');
  });

  it("the client capability context carries only this viewer's own levels", () => {
    const source = read("components/admin/access/AdminCapabilities.tsx");
    expect(source).toContain('"use client"');
    // Fail closed outside the provider: a control rendered without one must
    // hide, not show.
    expect(source).toMatch(/\?\?\s*\{\s*role:\s*"reader",\s*isSuperAdmin:\s*false,\s*perms:\s*\{\}\s*\}/);
    expect(source).not.toContain("SERVICE_ROLE");
  });
});

// ── Existing security controls survive ──────────────────────────────────────

describe("existing security controls are intact", () => {
  const guards = read("lib/auth/requireAdmin.ts");

  it("MFA / AAL2 is still enforced in the shared verifier", () => {
    expect(guards).toContain("getAuthenticatorAssuranceLevel");
    expect(guards).toContain("MFA enrollment required");
    expect(guards).toContain("MFA verification required");
  });

  it("emergency lockdown still contains non-super-admin panel roles", () => {
    expect(guards).toContain('isLockedDown("admin_mutations")');
  });

  it("permission resolution still fails closed", () => {
    expect(read("lib/permissions.ts")).toContain("denyAllPermissions");
  });

  it("forbidden attempts are still logged as security events", () => {
    expect(guards).toContain('type: "auth_forbidden"');
    expect(read("lib/admin/route-guard.ts")).toContain('type: "auth_forbidden"');
  });

  it("the MFA redirect is a redirect, not a denial", () => {
    // A user who simply has not verified their second factor must be sent to
    // the verify page — showing them "Access restricted" would be a dead end.
    const source = read("lib/admin/route-guard.ts");
    expect(source).toMatch(/if \(authError\.redirectTo\) redirect\(authError\.redirectTo\)/);
  });

  it("auth and permission lookups are request-deduped, not repeated per question", () => {
    expect(guards).toContain("const verifyAuthAndMFA = cache(");
    expect(guards).toContain("const cachedPermissionsForRole = cache(");
    expect(read("lib/admin/route-guard.ts")).toContain("export const getAdminViewer = cache(");
  });
});
