"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Eye, UserCog, KeyRound, Ban, CircleCheck, Trash2 } from "lucide-react";
import { userLabel, type UserRow } from "@/lib/admin/users-shared";

export type UserActionIntent =
  | "view"
  | "assignRole"
  | "resetPassword"
  | "suspend"
  | "activate"
  | "delete";

/**
 * Keyboard-accessible row action menu (same pattern as EbookActionsMenu — no
 * generic dropdown primitive exists yet). Emits an intent; the list client
 * opens the matching dialog or runs the action.
 */
export default function UserActionsMenu({
  user,
  busy,
  canManage,
  onIntent,
}: {
  user: UserRow;
  busy: boolean;
  /** false when the row is the caller, or a protected super admin. */
  canManage: boolean;
  onIntent: (intent: UserActionIntent) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(intent: UserActionIntent) {
    setOpen(false);
    onIntent(intent);
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40";
  const suspended = user.status === "disabled" || user.status === "blocked";

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${userLabel(user)}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${userLabel(user)}`}
          className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl"
        >
          <button type="button" role="menuitem" className={item} onClick={() => run("view")}>
            <Eye className="h-4 w-4 text-text-muted" /> View profile
          </button>
          <button type="button" role="menuitem" className={item} disabled={!canManage} onClick={() => run("assignRole")}>
            <UserCog className="h-4 w-4 text-text-muted" /> Assign role
          </button>

          <div className="my-1 h-px bg-divider" />

          <button type="button" role="menuitem" className={item} disabled={!canManage} onClick={() => run("resetPassword")}>
            <KeyRound className="h-4 w-4 text-text-muted" /> Reset password
          </button>
          {suspended ? (
            <button type="button" role="menuitem" className={item} disabled={!canManage} onClick={() => run("activate")}>
              <CircleCheck className="h-4 w-4 text-emerald-600" /> Reactivate user
            </button>
          ) : (
            <button type="button" role="menuitem" className={item} disabled={!canManage} onClick={() => run("suspend")}>
              <Ban className="h-4 w-4 text-amber-600" /> Suspend user
            </button>
          )}

          <div className="my-1 h-px bg-divider" />

          <button
            type="button"
            role="menuitem"
            className={`${item} text-red-600 hover:bg-red-50 disabled:text-red-300`}
            disabled={!canManage}
            onClick={() => run("delete")}
          >
            <Trash2 className="h-4 w-4" /> Delete user
          </button>
        </div>
      )}
    </div>
  );
}
