import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import SecurityLogsClient from "./SecurityLogsClient";
import { queryActivity, type ActivityFilters } from "@/lib/admin/activity-log";
import {
  RESOURCE_TYPES,
  maskEmail,
  type ActivityTab,
  type EventStatus,
  type RangePreset,
  type ResourceType,
} from "@/lib/admin/activity-log-shared";
import type { Metadata } from "next";

// Logs are session-dependent + contain personal data: never prerender or cache.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Activity & Security Logs - PTEC Library",
  robots: { index: false, follow: false },
};

const TABS: ActivityTab[] = ["all", "downloads", "views", "security", "account", "admin"];
const RANGES: RangePreset[] = ["24h", "7d", "30d", "90d", "custom"];
const STATUSES: EventStatus[] = ["authorized", "denied", "failed", "success"];
const PAGE_SIZE = 20;

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const identity = await getAdminIdentity();
  const canSeePersonal = identity.isSuperAdmin || identity.role === "super_admin";

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;

  const filters: ActivityFilters = {
    range: pick<RangePreset>(one("range"), RANGES, "24h"),
    customStart: one("start") ?? null,
    customEnd: one("end") ?? null,
    tab: pick<ActivityTab>(one("tab"), TABS, "all"),
    resourceType: pick<ResourceType | "all">(one("resource"), ["all", ...RESOURCE_TYPES], "all"),
    status: pick<EventStatus | "all">(one("status"), ["all", ...STATUSES], "all"),
    search: (one("q") ?? "").slice(0, 120),
    page: Math.max(0, parseInt(one("page") ?? "0", 10) || 0),
    pageSize: PAGE_SIZE,
  };

  const result = await queryActivity(filters);

  // Never ship raw personal data to admins who lack the reveal privilege — mask
  // the email at the server boundary so it isn't even present in the payload.
  if (!canSeePersonal) {
    result.events = result.events.map((e) => ({ ...e, actorEmail: maskEmail(e.actorEmail) }));
  }

  return (
    <SecurityLogsClient
      result={result}
      filters={{
        range: filters.range,
        tab: filters.tab,
        resourceType: filters.resourceType,
        status: filters.status,
        search: filters.search,
        customStart: filters.customStart ?? null,
        customEnd: filters.customEnd ?? null,
      }}
      canSeePersonal={canSeePersonal}
    />
  );
}
