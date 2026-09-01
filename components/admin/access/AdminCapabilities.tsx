"use client";

import { createContext, useContext, useMemo } from "react";

import {
  canAccessRoute,
  canPerform,
  canRead,
  canWrite,
  isSuperAdminViewer,
  type AdminViewer,
} from "@/lib/admin/access-policy";
import type { AppRole, PermLevel } from "@/lib/types/roles";

/**
 * The authenticated admin's capabilities, available to every client component
 * in the panel without threading a prop through five levels of list → table →
 * row → menu.
 *
 * Why a context rather than props: a mutation control is usually four
 * components below the page that knows the permission, and every intermediate
 * component that has to forward `canWrite` is a place where someone adds a new
 * one and forgets. A control that asks for itself cannot be forgotten.
 *
 * Why this is safe to put in the client bundle: it holds the same information
 * the sidebar already renders from — this user's own permission levels — and
 * nothing else. No tokens, no other users, no policy the server does not also
 * hold. And it decides only what to *render*: every action it hides is
 * independently refused by `requireAction()` on the server, so tampering with
 * it in the browser buys nothing but a button that fails.
 */

const AdminCapabilitiesContext = createContext<AdminViewer | null>(null);

export function AdminCapabilitiesProvider({
  role,
  isSuperAdmin,
  perms,
  children,
}: {
  role: AppRole;
  isSuperAdmin: boolean;
  perms: Record<string, PermLevel>;
  children: React.ReactNode;
}) {
  const viewer = useMemo<AdminViewer>(
    () => ({ role, isSuperAdmin, perms }),
    [role, isSuperAdmin, perms],
  );
  return (
    <AdminCapabilitiesContext.Provider value={viewer}>{children}</AdminCapabilitiesContext.Provider>
  );
}

/**
 * The viewer, or a deny-all stand-in outside the provider.
 *
 * Fail-closed by default is deliberate: a component rendered in a context that
 * forgot the provider (a test, a storybook, a future standalone shell) must
 * hide its mutation controls, not show them.
 */
function useViewer(): AdminViewer {
  return useContext(AdminCapabilitiesContext) ?? { role: "reader", isSuperAdmin: false, perms: {} };
}

/** "Should this control exist?" — by named action policy. */
export function useCan(actionId: string): boolean {
  return canPerform(useViewer(), actionId);
}

/** "Would this link open?" — by route policy id. */
export function useCanRoute(policyId: string): boolean {
  return canAccessRoute(useViewer(), policyId);
}

/**
 * Is this viewer a super admin?
 *
 * Needed by exactly one surface — `/admin/roles`, where the `roles` row may be
 * moved only by a super admin (`ROLES_DELEGATION_RULES.rolesRowSuperAdminOnly`).
 * That rule is not a permission level, so it cannot be asked as `useCan`.
 */
export function useAdminViewerIsSuperAdmin(): boolean {
  return isSuperAdminViewer(useViewer());
}

/** Resource-level questions, for controls with no named action of their own. */
export function useCanWrite(resource: string): boolean {
  return canWrite(useViewer(), resource);
}

export function useCanRead(resource: string): boolean {
  return canRead(useViewer(), resource);
}

/**
 * Renders `children` only when the viewer may perform `action` (or reach
 * `route`). The declarative form, for wrapping a block of controls.
 */
export function CanDo({
  action,
  route,
  fallback = null,
  children,
}: {
  action?: string;
  route?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const viewer = useViewer();
  const allowed = action
    ? canPerform(viewer, action)
    : route
      ? canAccessRoute(viewer, route)
      : false;
  return <>{allowed ? children : fallback}</>;
}
