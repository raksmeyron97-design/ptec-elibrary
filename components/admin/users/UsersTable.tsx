"use client";

import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import { formatDate, formatRelative, type UserRow } from "@/lib/admin/users-shared";
import { RoleBadge, StatusBadge } from "@/components/admin/users/badges";
import UserActionsMenu, { type UserActionIntent } from "@/components/admin/users/UserActionsMenu";

export default function UsersTable({
  rows,
  selectedIds,
  allSelected,
  busyId,
  currentUserId,
  callerCanAssignAdmin,
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
  onIntent,
}: {
  rows: UserRow[];
  selectedIds: Set<string>;
  allSelected: boolean;
  busyId: string | null;
  currentUserId: string;
  callerCanAssignAdmin: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpen: (user: UserRow) => void;
  onIntent: (user: UserRow, intent: UserActionIntent) => void;
}) {
  const t = useTranslations("adminUsers.table");
  const tTime = useTranslations("adminUsers.time");
  const th = "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted";

  return (
    <div className="hidden rounded-2xl border border-divider bg-bg-surface shadow-sm md:block">
      <div className="">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-divider bg-paper [&>th:first-child]:rounded-tl-2xl [&>th:last-child]:rounded-tr-2xl">
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  aria-label={t("selectAll")}
                  className="h-4 w-4 rounded border-slate-300 text-brand focus-visible:ring-2 focus-visible:ring-focus-ring/40"
                />
              </th>
              <th scope="col" className={th}>{t("user")}</th>
              <th scope="col" className={th}>{t("role")}</th>
              <th scope="col" className={th}>{t("status")}</th>
              <th scope="col" className={`${th} hidden lg:table-cell`}>{t("joined")}</th>
              <th scope="col" className={`${th} hidden xl:table-cell`}>{t("lastLogin")}</th>
              <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">{t("actions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((u) => {
              const isMe = u.id === currentUserId;
              const targetIsSuperAdmin = u.isSuperAdmin || u.role === "super_admin";
              const canManage = !isMe && (!targetIsSuperAdmin || callerCanAssignAdmin);
              const isBusy = busyId === u.id;
              const selected = selectedIds.has(u.id);

              return (
                <tr
                  key={u.id}
                  className={`group cursor-pointer transition-colors hover:bg-paper/70 ${selected ? "bg-brand/[0.04]" : ""} ${isBusy ? "opacity-50" : ""}`}
                  onClick={() => onOpen(u)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect(u.id)}
                      aria-label={t("selectUser", { name: u.fullName ?? u.email })}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus-visible:ring-2 focus-visible:ring-focus-ring/40"
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar url={u.avatarUrl ?? null} name={u.fullName} email={u.email} size={38} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-semibold leading-tight text-text-heading">
                          <span className="truncate">{u.fullName ?? <span className="italic text-text-muted">{t("noName")}</span>}</span>
                          {isMe && <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700">{t("you")}</span>}
                        </p>
                        <p className="truncate text-xs text-text-muted">{u.email || "—"}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3"><RoleBadge role={u.role} isSuperAdmin={u.isSuperAdmin} /></td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  <td className="hidden px-4 py-3 text-xs tabular-nums text-text-muted lg:table-cell">{formatDate(u.createdAt)}</td>
                  <td className="hidden px-4 py-3 text-xs text-text-muted xl:table-cell">{formatRelative(u.lastLoginAt, tTime)}</td>

                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <UserActionsMenu
                      user={u}
                      busy={isBusy}
                      canManage={canManage}
                      onIntent={(intent) => onIntent(u, intent)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
