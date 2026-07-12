"use client";

import Avatar from "@/components/ui/Avatar";
import { formatDate, formatRelative, type UserRow } from "@/lib/admin/users-shared";
import { RoleBadge, StatusBadge } from "@/components/admin/users/badges";
import UserActionsMenu, { type UserActionIntent } from "@/components/admin/users/UserActionsMenu";

export default function UserMobileCard({
  rows,
  selectedIds,
  busyId,
  currentUserId,
  callerCanAssignAdmin,
  onToggleSelect,
  onOpen,
  onIntent,
}: {
  rows: UserRow[];
  selectedIds: Set<string>;
  busyId: string | null;
  currentUserId: string;
  callerCanAssignAdmin: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (user: UserRow) => void;
  onIntent: (user: UserRow, intent: UserActionIntent) => void;
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((u) => {
        const isMe = u.id === currentUserId;
        const targetIsSuperAdmin = u.isSuperAdmin || u.role === "super_admin";
        const canManage = !isMe && (!targetIsSuperAdmin || callerCanAssignAdmin);
        const selected = selectedIds.has(u.id);

        return (
          <li
            key={u.id}
            className={`rounded-2xl border bg-bg-surface p-4 shadow-sm transition ${selected ? "border-brand/40 ring-1 ring-brand/20" : "border-divider"} ${busyId === u.id ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(u.id)}
                aria-label={`Select ${u.fullName ?? u.email}`}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus-visible:ring-2 focus-visible:ring-focus-ring/40"
              />
              <button type="button" onClick={() => onOpen(u)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar url={u.avatarUrl ?? null} name={u.fullName} email={u.email} size={40} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold leading-tight text-text-heading">
                    <span className="truncate">{u.fullName ?? <span className="italic text-text-muted">No name</span>}</span>
                    {isMe && <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700">YOU</span>}
                  </p>
                  <p className="truncate text-xs text-text-muted">{u.email || "—"}</p>
                </div>
              </button>
              <UserActionsMenu
                user={u}
                busy={busyId === u.id}
                canManage={canManage}
                onIntent={(intent) => onIntent(u, intent)}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RoleBadge role={u.role} isSuperAdmin={u.isSuperAdmin} />
              <StatusBadge status={u.status} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-divider pt-3 text-[11px] text-text-muted">
              <div>
                <div className="font-semibold uppercase tracking-wide">Joined</div>
                <div className="mt-0.5 text-text-body">{formatDate(u.createdAt)}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wide">Last login</div>
                <div className="mt-0.5 text-text-body">{formatRelative(u.lastLoginAt)}</div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
