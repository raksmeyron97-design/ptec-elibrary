"use client";

import { useTranslations } from "next-intl";
import type { AppRole } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";
import { ALL_RESOURCE_KEYS, levelAt, type PermMatrix } from "@/lib/admin/roles-shared";
import { ROLE_ICON } from "./icons";
import { Lock, Check } from "lucide-react";

function accessSummary(matrix: PermMatrix, role: AppRole) {
  let write = 0;
  let read = 0;
  for (const key of ALL_RESOURCE_KEYS) {
    const lvl = levelAt(matrix, role, key);
    if (lvl === "write") write++;
    else if (lvl === "read") read++;
  }
  return { write, read };
}

function RoleCard({
  role,
  count,
  totalUsers,
  matrix,
  selected,
  onSelect,
}: {
  role: AppRole;
  count: number;
  totalUsers: number;
  matrix: PermMatrix;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("adminRoles.overview");
  const tRoles = useTranslations("adminUsers.roles");
  const tRoleDesc = useTranslations("adminUsers.roleDescriptions");
  const meta = ROLE_META[role];
  const Icon = ROLE_ICON[role];
  const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
  const { write, read } = accessSummary(matrix, role);
  const barColor = meta.color.replace("text-", "bg-");
  const locked = role === "super_admin";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex flex-col rounded-xl border bg-bg-surface p-4 text-left shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        selected
          ? "border-brand ring-2 ring-brand/30"
          : "border-divider hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
      }`}
    >
      {/* Identity accent bar */}
      <span className={`absolute inset-x-0 top-0 h-1 rounded-t-xl ${barColor}`} aria-hidden="true" />

      <div className="flex items-center justify-between gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ring-1 ring-inset ${meta.bgColor} ${meta.color} ${meta.borderColor}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
        </span>
        {selected ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        ) : locked ? (
          <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-text-heading">{tRoles(role)}</h3>
        <span className="text-lg font-bold tabular-nums text-text-heading">{count}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 min-h-[2.25rem] text-xs leading-snug text-text-muted">
        {tRoleDesc(role)}
      </p>

      {/* User share */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-text-muted">
          <span>{t("userCount", { count })}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper">
          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Access summary */}
      <div className="mt-3 flex items-center gap-3 border-t border-divider pt-2.5 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          {t("fullCount", { count: write })}
        </span>
        <span className="inline-flex items-center gap-1 text-blue-600">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
          {t("readCount", { count: read })}
        </span>
      </div>
    </button>
  );
}

export default function RoleOverview({
  allRoles,
  roleCounts,
  totalUsers,
  matrix,
  selectedRole,
  onSelectRole,
}: {
  allRoles: AppRole[];
  roleCounts: Record<AppRole, number>;
  totalUsers: number;
  matrix: PermMatrix;
  selectedRole: AppRole | null;
  onSelectRole: (role: AppRole | null) => void;
}) {
  const t = useTranslations("adminRoles.overview");
  return (
    <section aria-label={t("aria")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t("heading")}</h2>
        {selectedRole && (
          <button
            type="button"
            onClick={() => onSelectRole(null)}
            className="text-xs font-semibold text-brand hover:underline"
          >
            {t("clearFocus")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {allRoles.map((role) => (
          <RoleCard
            key={role}
            role={role}
            count={roleCounts[role] ?? 0}
            totalUsers={totalUsers}
            matrix={matrix}
            selected={selectedRole === role}
            onSelect={() => onSelectRole(selectedRole === role ? null : role)}
          />
        ))}
      </div>
    </section>
  );
}
