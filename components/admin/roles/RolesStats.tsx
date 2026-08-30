"use client";

import { useTranslations } from "next-intl";
import { Clock, KeyRound, ShieldCheck, Users } from "lucide-react";

/**
 * The four facts that frame the page, as one divided strip rather than four
 * cards.
 *
 * Cards were the obvious move and the wrong one: this is reference data an
 * administrator reads once on arrival, and giving it four bordered, shadowed
 * surfaces would make it compete with the role rail and the permission pane,
 * which are the things they came to use. A single strip states the same numbers
 * at a fraction of the visual weight.
 *
 * "Last updated" lives here rather than under the page title because it is a
 * fact of the same kind as the other three — a property of the permission set,
 * not a subtitle.
 */
export default function RolesStats({
  roleCount,
  permissionCount,
  totalUsers,
  lastUpdatedLabel,
  lastUpdatedBy,
}: {
  roleCount: number;
  permissionCount: number;
  totalUsers: number;
  lastUpdatedLabel: string | null;
  lastUpdatedBy: string | null;
}) {
  const t = useTranslations("adminRoles.stats");
  const tHeader = useTranslations("adminRoles.header");

  const cells = [
    { icon: ShieldCheck, label: t("roles"), value: String(roleCount) },
    { icon: KeyRound, label: t("permissions"), value: String(permissionCount) },
    { icon: Users, label: t("users"), value: String(totalUsers) },
  ];

  return (
    <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-divider bg-divider sm:grid-cols-4">
      {cells.map(({ icon: Icon, label, value }) => (
        <div key={label} className="bg-bg-surface px-4 py-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {label}
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-text-heading">{value}</dd>
        </div>
      ))}

      <div className="bg-bg-surface px-4 py-3">
        <dt className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("lastUpdated")}
        </dt>
        <dd className="mt-1 text-sm font-medium leading-snug text-text-heading">
          {lastUpdatedLabel ? (
            <>
              <time>{lastUpdatedLabel}</time>
              {lastUpdatedBy && (
                <span className="block truncate text-xs font-normal text-text-muted">
                  {tHeader("by")} {lastUpdatedBy}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm font-normal text-text-muted">{tHeader("defaultMatrix")}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
