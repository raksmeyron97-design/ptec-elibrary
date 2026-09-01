import { headers } from "next/headers";

import AccessDenied from "@/components/admin/access/AccessDenied";
import { getAdminViewer, readRecordedDenial } from "@/lib/admin/route-guard";
import {
  describeDenial,
  reachableFallback,
  resolveRoutePolicy,
  type AccessDenial,
} from "@/lib/admin/access-policy";

/**
 * The admin panel's 403.
 *
 * Next's `forbidden.js` convention passes no props, so the context is recovered
 * two ways, in order of directness:
 *
 *  1. The record `requireRouteAccess()` wrote immediately before it threw the
 *     interrupt. Same request, same render — normally this is what renders.
 *  2. The pathname (set on the request by `middleware.ts` for `/admin` only)
 *     resolved against the policy table. This is not a guess: it reads the very
 *     same registry entry the guard enforced, so it produces the same two
 *     levels. It exists because a boundary render is not contractually in the
 *     same React cache scope as the render that threw.
 *
 * If neither yields a resource — a role-gated surface, or a `forbidden()` from
 * somewhere with no route policy — the panel still renders, minus the
 * comparison. It never falls through to a generic error.
 */
export default async function AdminForbidden() {
  const recorded = readRecordedDenial();
  if (recorded) return <AccessDenied denial={recorded} />;

  const pathname = (await headers()).get("x-pathname") ?? "";
  const policy = resolveRoutePolicy(pathname);

  let denial: AccessDenial = { backTo: "/admin" };
  if (policy) {
    try {
      const viewer = await getAdminViewer();
      denial = describeDenial(viewer, policy.requires, {
        policyId: policy.id,
        backTo: reachableFallback(viewer, policy),
      });
    } catch {
      // Identity could not be resolved while rendering the denial page. Show
      // the panel without the comparison rather than turning a 403 into a 500.
      denial = { backTo: "/admin" };
    }
  }

  return <AccessDenied denial={denial} />;
}
