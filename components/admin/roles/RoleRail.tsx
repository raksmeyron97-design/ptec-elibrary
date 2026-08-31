"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Columns3, Lock } from "lucide-react";
import type { AppRole } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";
import { accessSummary, isLockedRole, type PermMatrix } from "@/lib/admin/roles-shared";
import { ROLE_ICON } from "./icons";

/**
 * The workspace selector: "Compare all roles" plus one entry per role.
 *
 * It replaces the five large overview cards that used to sit above the matrix.
 * Those carried the same facts (user count, share, access mix) but cost ~320px
 * of vertical space before the actual work began, and they re-flowed between
 * two rows depending on how many roles happened to have users — so the target
 * an admin was reaching for moved as the data changed. As a rail the facts stay
 * legible, the order is fixed, and the selected role is visible while you edit
 * it.
 *
 * Desktop: a sticky vertical list. Below `lg`: a horizontal scroller of the
 * same entries, so the mental model does not change with the viewport.
 */

/** Selection: the compare view, or one role's pane. */
export type RailSelection = "compare" | AppRole;

/** The one place role identity resolves to a solid fill (rail dot + share bar). */
const ACCENT: Record<AppRole, string> = {
  reader: "bg-slate-500",
  staff: "bg-blue-500",
  librarian: "bg-emerald-500",
  admin: "bg-amber-500",
  super_admin: "bg-purple-600",
};

function RailEntry({
  role,
  count,
  totalUsers,
  matrix,
  selected,
  pending,
  onSelect,
}: {
  role: AppRole;
  count: number;
  totalUsers: number;
  matrix: PermMatrix;
  selected: boolean;
  pending: number;
  onSelect: () => void;
}) {
  const t = useTranslations("adminRoles.overview");
  const tRail = useTranslations("adminRoles.rail");
  const tRoles = useTranslations("adminUsers.roles");
  const meta = ROLE_META[role];
  const Icon = ROLE_ICON[role];
  const locked = isLockedRole(role);
  const { write, read } = accessSummary(matrix, role);
  const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`focus-field w-full shrink-0 rounded-xl border p-3 text-left transition-colors ${
        selected
          ? "border-admin-accent bg-admin-accent-soft"
          : "border-divider bg-bg-surface hover:bg-paper"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${meta.bgColor} ${meta.color} ${meta.borderColor}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-text-heading">{tRoles(role)}</span>
            {locked && <Lock className="h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />}
          </span>
          <span className="block text-xs text-text-muted">
            {count === 0 ? tRail("noUsers") : t("userCount", { count })}
          </span>
        </span>

        {pending > 0 && (
          <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-gold-800 ring-1 ring-inset ring-gold-300">
            {pending}
          </span>
        )}
      </span>

      {/* Two facts, one line: how much of the org holds this role, and how much
          of the system it can reach. */}
      <span className="mt-2.5 block">
        <span className="block h-1 w-full overflow-hidden rounded-full bg-divider">
          <span
            className={`block h-full rounded-full opacity-80 ${ACCENT[role]}`}
            style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
          />
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[11px] text-text-muted">
          <span className="font-medium text-success-text">{t("fullCount", { count: write })}</span>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-info-text">{t("readCount", { count: read })}</span>
        </span>
      </span>
    </button>
  );
}

export default function RoleRail({
  allRoles,
  roleCounts,
  totalUsers,
  matrix,
  selection,
  pendingByRole,
  onSelect,
}: {
  allRoles: AppRole[];
  roleCounts: Record<AppRole, number>;
  totalUsers: number;
  matrix: PermMatrix;
  selection: RailSelection;
  /** role → number of unsaved changes, so the rail shows where the work is. */
  pendingByRole: Partial<Record<AppRole, number>>;
  onSelect: (next: RailSelection) => void;
}) {
  // Named `tRail` to match RailEntry above, where plain `t` is the *overview*
  // namespace: two components in one file, each with a `t` bound to a different
  // namespace, is a rename waiting to go wrong.
  const tRail = useTranslations("adminRoles.rail");

  return (
    <nav aria-label={tRail("aria")} className="lg:sticky lg:top-6">
      <h2 className="mb-2 hidden text-xs font-semibold uppercase tracking-wider text-text-muted lg:block">
        {tRail("heading")}
      </h2>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {allRoles.map((role) => (
          <div key={role} className="w-56 shrink-0 lg:w-full">
            <RailEntry
              role={role}
              count={roleCounts[role] ?? 0}
              totalUsers={totalUsers}
              matrix={matrix}
              selected={selection === role}
              pending={pendingByRole[role] ?? 0}
              onSelect={() => onSelect(role)}
            />
          </div>
        ))}

        {/* Comparison sits after the roles and reads quieter than them: it is
            the advanced view, and leading with it made the page's answer to
            "what am I looking at?" a spreadsheet rather than a role. */}
        <button
          type="button"
          onClick={() => onSelect("compare")}
          aria-pressed={selection === "compare"}
          className={`focus-field flex w-56 shrink-0 items-center gap-2.5 rounded-xl border border-dashed p-3 text-left transition-colors lg:mt-1 lg:w-full ${
            selection === "compare"
              ? "border-solid border-admin-accent bg-admin-accent-soft"
              : "border-divider hover:bg-paper"
          }`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper text-text-muted ring-1 ring-inset ring-divider">
            <Columns3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-text-body">
              {tRail("compare")}
            </span>
            <span className="block text-xs text-text-muted">{tRail("compareHint")}</span>
          </span>
        </button>
      </div>

      <Link
        href="/admin/users"
        className="focus-field mt-3 hidden items-center gap-1.5 rounded px-1 text-xs font-semibold text-admin-accent-text hover:underline lg:inline-flex"
      >
        {tRail("assignUsers")}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </nav>
  );
}
