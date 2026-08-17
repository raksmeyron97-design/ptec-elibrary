"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Lock } from "lucide-react";
import type { AppRole } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";
import { ALL_RESOURCE_KEYS, levelAt, type PermMatrix } from "@/lib/admin/roles-shared";
import { ROLE_ICON } from "./icons";

/**
 * Identity accent per role — the 3px cap and the share bar. Kept here rather
 * than in ROLE_META because these are solid fills, while ROLE_META carries the
 * tinted text/background/border trio the icon well and chips use.
 */
const ACCENT: Record<AppRole, string> = {
  reader: "bg-slate-500",
  staff: "bg-blue-500",
  librarian: "bg-emerald-500",
  admin: "bg-amber-500",
  super_admin: "bg-purple-600",
};

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
  const locked = role === "super_admin";
  /** A role nobody holds is dormant, not broken — it reads subdued, never red. */
  const idle = count === 0;

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border p-4 transition-all duration-200 ${
        idle
          ? "border-dashed border-slate-300 bg-paper/50"
          : "bg-bg-surface shadow-sm hover:-translate-y-px hover:shadow-md"
      } ${selected ? "border-brand ring-2 ring-brand/30" : idle ? "" : "border-divider"}`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-[3px] ${idle ? "bg-slate-200" : ACCENT[role]}`}
        aria-hidden="true"
      />

      {/* Stretched hit area: the whole card focuses the matrix on this role.
          Content sits above it but passes clicks through, so the "Assign users"
          link below can opt back in without nesting a link inside a button. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={t("focusRole", { role: tRoles(role) })}
        className="absolute inset-0 z-0 rounded-xl"
      />

      <div className="pointer-events-none relative z-[1] flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`grid h-10 w-10 place-items-center rounded-lg ring-1 ring-inset ${
              idle
                ? "bg-slate-100 text-slate-400 ring-slate-200"
                : `${meta.bgColor} ${meta.color} ${meta.borderColor}`
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>

          <div className="flex items-center gap-2">
            {locked && !selected && (
              <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            )}
            {selected && (
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white"
                aria-hidden="true"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-text-heading">{tRoles(role)}</h3>
          <span
            className={`text-2xl font-bold leading-none tabular-nums ${
              idle ? "text-slate-400" : "text-text-heading"
            }`}
          >
            {count}
          </span>
        </div>

        <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs leading-snug text-text-muted">
          {tRoleDesc(role)}
        </p>

        {idle ? (
          <div className="mt-3">
            <p className="text-xs text-text-muted">{t("noAssignments")}</p>
            <Link
              href="/admin/users"
              className="pointer-events-auto relative z-10 mt-1.5 inline-flex items-center gap-1 rounded text-xs font-medium text-brand hover:underline"
            >
              {t("assignUsers")}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-text-muted">
              <span>{t("userCount", { count })}</span>
              <span className="tabular-nums">{t("shareOfTotal", { pct })}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-divider">
              <div
                className={`h-full rounded-full opacity-80 transition-all ${ACCENT[role]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Permission shape: filled = full access, hollow = read-only. */}
        <div className="mt-3 flex items-center gap-2 border-t border-divider pt-2.5 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="font-medium text-emerald-600">{t("fullCount", { count: write })}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full border border-blue-500" aria-hidden="true" />
            <span className="font-medium text-blue-500">{t("readCount", { count: read })}</span>
          </span>
        </div>
      </div>
    </div>
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

  // Tiered by what the data actually says, not by a fixed 3+2 split: a role
  // promotes itself into the primary row the moment someone is assigned to it.
  const assigned = allRoles.filter((r) => (roleCounts[r] ?? 0) > 0);
  const unassigned = allRoles.filter((r) => (roleCounts[r] ?? 0) === 0);
  const tiers = assigned.length > 0 ? [assigned, unassigned] : [unassigned];

  return (
    <section aria-label={t("aria")} className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("heading")}
        </h2>
        {selectedRole && (
          <button
            type="button"
            onClick={() => onSelectRole(null)}
            className="rounded text-xs font-semibold text-brand hover:underline"
          >
            {t("clearFocus")}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {tiers
          .filter((tier) => tier.length > 0)
          .map((tier) => (
            <div key={tier.join("-")} className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {tier.map((role) => (
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
          ))}
      </div>
    </section>
  );
}
