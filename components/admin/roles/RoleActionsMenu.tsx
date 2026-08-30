"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Copy, MinusCircle, RotateCcw } from "lucide-react";
import type { AppRole } from "@/lib/types/roles";
import { isLockedRole, type BulkIntent } from "@/lib/admin/roles-shared";
import { ROLE_ICON } from "./icons";

/**
 * Whole-role bulk operations, in one menu beside the pane's save cluster.
 *
 * These exist because the three most common edits on this page were each
 * thirteen clicks: "give this role the same access as that one", "put it back
 * to what shipped", "take everything away". Thirteen clicks is not just slow —
 * it is thirteen chances to leave a role half-changed, and the matrix looks
 * plausible in every intermediate state.
 *
 * Nothing here writes anything on its own: the menu only reports an intent, and
 * the workspace answers it with a confirmation naming how many of the role's
 * permissions would actually move. That count is the point — "copy Admin onto
 * Staff" reads harmless until you are told it rewrites nine of thirteen rows.
 * Even then it lands in the draft, so it still has to clear Review & save.
 */
export default function RoleActionsMenu({
  role,
  allRoles,
  onIntent,
}: {
  role: AppRole;
  allRoles: AppRole[];
  /** Reported, not applied — the workspace confirms before touching the draft. */
  onIntent: (intent: BulkIntent) => void;
}) {
  const t = useTranslations("adminRoles.bulk");
  const tRoles = useTranslations("adminUsers.roles");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sources = allRoles.filter((r) => r !== role);
  const ITEM =
    "focus-field flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-body transition hover:bg-paper";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="focus-field inline-flex h-9 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 text-sm font-semibold text-text-body transition hover:bg-paper"
      >
        {t("menu")}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-divider bg-bg-surface py-1 shadow-lg"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            {t("copyFrom")}
          </p>
          {sources.map((source) => {
            const Icon = ROLE_ICON[source];
            return (
              <button
                key={source}
                type="button"
                role="menuitem"
                onClick={() => {
                  onIntent({ kind: "copy", source });
                  setOpen(false);
                }}
                className={ITEM}
              >
                <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="truncate">{tRoles(source)}</span>
                {isLockedRole(source) && (
                  <span className="ml-auto shrink-0 text-[11px] text-text-muted">
                    {t("fullAccess")}
                  </span>
                )}
              </button>
            );
          })}

          <div className="my-1 h-px bg-divider" aria-hidden="true" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onIntent({ kind: "defaults" });
              setOpen(false);
            }}
            className={ITEM}
          >
            <RotateCcw className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            {t("resetDefaults")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onIntent({ kind: "clear" });
              setOpen(false);
            }}
            className={`${ITEM} text-danger-text`}
          >
            <MinusCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("clearAll")}
          </button>

          <p className="border-t border-divider px-3 py-2 text-[11px] leading-snug text-text-muted">
            <Copy className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
            {t("draftOnly")}
          </p>
        </div>
      )}
    </div>
  );
}
