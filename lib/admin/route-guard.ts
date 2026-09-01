import "server-only";

import { cache } from "react";
import { forbidden, redirect, unauthorized } from "next/navigation";

import {
  ACTION_POLICIES,
  canAccessRoute,
  canPerform,
  canRead,
  canWrite,
  describeDenial,
  reachableFallback,
  routePolicy,
  satisfies,
  type AccessDenial,
  type AdminViewer,
  type Requirement,
} from "@/lib/admin/access-policy";
import {
  AdminAuthError,
  isAdminAuthError,
  resolveAdminPermissions,
  type RequiredAdmin,
} from "@/lib/auth/requireAdmin";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * The server half of the authorization system: it turns a policy id from
 * `lib/admin/access-policy.ts` into a decision about the *actual* authenticated
 * user, and — when the answer is no — into a 403 that carries enough context to
 * explain itself.
 *
 * Two things this file is careful about.
 *
 * **A 403 is not an application error.** Route denials used to surface as a
 * thrown `AdminAuthError` that landed in `error.tsx`, which then tried to
 * recognise it by string-matching `error.message`. That cannot work in
 * production: React redacts server error messages before they reach a client
 * error boundary, replacing them with a digest. Every authorization failure
 * therefore rendered the red "Something went wrong!" screen with a minified
 * error — bug #2, and unfixable at the boundary. `forbidden()` throws a
 * distinct HTTP interrupt (`NEXT_HTTP_ERROR_FALLBACK;403`) that Next routes to
 * `forbidden.tsx` instead of `error.tsx`, deterministically, with a real 403
 * status and an injected `noindex`. No string is parsed anywhere.
 *
 * **The 403 page takes no props**, so the context travels two ways, both cheap:
 * a request-scoped record written just before the interrupt, and — if that
 * scope does not survive into the boundary render — the pathname, from which
 * the policy table reconstructs exactly the same answer. Neither carries a
 * message, a digest or a stack.
 */

// ── Request-scoped denial record ────────────────────────────────────────────

type DenialSlot = { current: AccessDenial | null };

/** One mutable slot per request (React `cache()` is request-scoped). */
const denialSlot = cache((): DenialSlot => ({ current: null }));

export function recordDenial(denial: AccessDenial): void {
  denialSlot().current = denial;
}

export function readRecordedDenial(): AccessDenial | null {
  return denialSlot().current;
}

// ── The viewer ──────────────────────────────────────────────────────────────

/**
 * The authenticated admin as the policy table sees them.
 *
 * Resolved through `resolveAdminPermissions()`, i.e. the same
 * auth + MFA + lockdown + `role_permissions` path the enforcement guards run,
 * and request-deduped at both levels — so asking "can they upload?" after
 * "can they open this page?" costs nothing.
 */
export const getAdminViewer = cache(async (): Promise<AdminViewer> => {
  const { role, isSuperAdmin, perms } = await resolveAdminPermissions();
  return { role, isSuperAdmin, perms };
});

// ── Translating an auth failure into the right interrupt ────────────────────

/**
 * Never let an authorization outcome reach the generic error boundary, and
 * never let a genuine 500 be reported as a 403.
 */
function raise(error: unknown, where: string): never {
  if (!isAdminAuthError(error)) throw error;
  const authError: AdminAuthError = error;

  // MFA enrolment / verification: a redirect, not a denial. The user is
  // authorized, they just have a step left.
  if (authError.redirectTo) redirect(authError.redirectTo);

  if (authError.status === 401) unauthorized();

  if (authError.status === 403) {
    // Emergency lockdown, or a role check inside the shared verifier.
    recordDenial({ backTo: "/admin" });
    forbidden();
  }

  // 500 — the permission source itself is broken. That IS an application
  // error, and must keep looking like one.
  throw new Error(`Authorization could not be resolved (${where})`);
}

// ── Route guards ────────────────────────────────────────────────────────────

export type RouteAccess = RequiredAdmin & {
  viewer: AdminViewer;
  /** Can the viewer perform this named mutation? The question a button asks. */
  can: (actionId: string) => boolean;
  /** Shorthand for the page's own resource. */
  canRead: (resource: string) => boolean;
  canWrite: (resource: string) => boolean;
};

/**
 * Declare and enforce a page's required access, in one line at the top of the
 * page component.
 *
 *     const { can } = await requireRouteAccess("books.manage");
 *
 * On success it hands back the service client and the viewer, so the page never
 * needs a second auth round-trip to decide which controls to render. On failure
 * it does not return: the request ends as a 403 (or 401, or an MFA redirect).
 *
 * This is the authorization boundary for the route. It is not weakened by, and
 * does not replace, the guard on every Server Action the page can invoke.
 */
export async function requireRouteAccess(policyId: string): Promise<RouteAccess> {
  const policy = routePolicy(policyId);
  if (!policy) {
    // Fail closed and loudly: an unknown id means a page declared a policy that
    // does not exist, which must never degrade into "allow".
    throw new Error(`Unknown admin route policy: ${policyId}`);
  }

  let resolved: Awaited<ReturnType<typeof resolveAdminPermissions>>;
  try {
    resolved = await resolveAdminPermissions();
  } catch (error) {
    raise(error, `route:${policyId}`);
  }

  const viewer: AdminViewer = {
    role: resolved.role,
    isSuperAdmin: resolved.isSuperAdmin,
    perms: resolved.perms,
  };

  if (!satisfies(viewer, policy.requires)) {
    logSecurityEvent({
      type: "auth_forbidden",
      where: `route:${policyId}`,
      userId: resolved.userId,
    });
    recordDenial(
      describeDenial(viewer, policy.requires, {
        policyId,
        backTo: reachableFallback(viewer, policy),
      }),
    );
    forbidden();
  }

  return {
    supabase: resolved.supabase,
    user: resolved.user,
    userId: resolved.userId,
    role: resolved.role,
    viewer,
    can: (actionId: string) => canPerform(viewer, actionId),
    canRead: (resource: string) => canRead(viewer, resource),
    canWrite: (resource: string) => canWrite(viewer, resource),
  };
}

/**
 * Non-throwing capability question for a server component that is already past
 * its route guard: "should this control exist?".
 *
 * Rendering needs the question, not the guard — a control the viewer cannot use
 * has to be *absent*, and a page that threw for the answer would take the whole
 * route down. What this hides is exactly what `requireActionAccess` refuses.
 */
export async function canDo(actionId: string): Promise<boolean> {
  return canPerform(await getAdminViewer(), actionId);
}

/**
 * "Would `requireRouteAccess(policyId)` let this viewer through?" — for a link
 * or a workspace tab that points at another admin route. Asking the destination
 * rather than re-deriving its rule is what keeps a link from ever pointing at a
 * 403.
 */
export async function canRoute(policyId: string): Promise<boolean> {
  return canAccessRoute(await getAdminViewer(), policyId);
}

/** Same question, phrased against a resource rather than a named action. */
export async function canAccess(
  resource: string,
  level: "read" | "write" = "read",
): Promise<boolean> {
  const viewer = await getAdminViewer();
  return level === "write" ? canWrite(viewer, resource) : canRead(viewer, resource);
}

// ── Action guards ───────────────────────────────────────────────────────────

/**
 * Enforce a named mutation policy inside a Server Action or Route Handler.
 *
 * Deliberately NOT an HTTP interrupt: an action returns a result to the caller
 * that invoked it, and `forbidden()` there would replace the page the user is
 * standing on. It throws `AdminAuthError(403)`, which every existing action
 * already knows how to turn into `{ error }` — so hidden buttons stay a UX
 * nicety and this stays the boundary.
 */
export async function requireAction(actionId: string): Promise<RequiredAdmin> {
  const requirement: Requirement | undefined = ACTION_POLICIES[actionId];
  if (!requirement) throw new Error(`Unknown admin action policy: ${actionId}`);

  const resolved = await resolveAdminPermissions();
  const viewer: AdminViewer = {
    role: resolved.role,
    isSuperAdmin: resolved.isSuperAdmin,
    perms: resolved.perms,
  };

  if (!satisfies(viewer, requirement)) {
    logSecurityEvent({
      type: "auth_forbidden",
      where: `action:${actionId}`,
      userId: resolved.userId,
    });
    throw new AdminAuthError("Forbidden", 403);
  }

  return {
    supabase: resolved.supabase,
    user: resolved.user,
    userId: resolved.userId,
    role: resolved.role,
  };
}
