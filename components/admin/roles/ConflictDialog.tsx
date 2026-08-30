"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { ROLE_META } from "@/lib/types/roles";
import type { ConflictChoice, ConflictItem } from "@/lib/admin/roles-shared";
import DialogShell from "./DialogShell";
import { PermPill } from "./PermControl";
import { useResourceText } from "./useResourceText";

/** Stable identity for one conflicted cell. */
export function conflictKey(item: { role: string; resource: string }): string {
  return `${item.role}:${item.resource}`;
}

/**
 * Someone else changed these permissions while this editor was working.
 *
 * The save action has always detected that — it re-reads every affected cell
 * and refuses to clobber a value it did not start from. What it could not do
 * was tell the editor what to do next: the workspace showed one amber sentence
 * ("reload to see the latest values") and left the draft sitting there, so the
 * only way forward was to reload and redo the work, including the parts nobody
 * else had touched.
 *
 * Here each conflicted cell is a two-way choice, the untouched changes are kept
 * either way, and "Save again" re-submits against the values the database
 * actually holds — so the second attempt cannot conflict on the same cells.
 */
export default function ConflictDialog({
  open,
  items,
  choices,
  saving,
  onChoose,
  onChooseAll,
  onClose,
  onSaveAgain,
}: {
  open: boolean;
  items: ConflictItem[];
  choices: Record<string, ConflictChoice>;
  saving: boolean;
  onChoose: (key: string, choice: ConflictChoice) => void;
  onChooseAll: (choice: ConflictChoice) => void;
  onClose: () => void;
  onSaveAgain: () => void;
}) {
  const t = useTranslations("adminRoles.conflict");
  const tLevels = useTranslations("adminRoles.levels");
  const tRoles = useTranslations("adminUsers.roles");
  const res = useResourceText();

  const OPTION =
    "focus-field inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition";

  return (
    <DialogShell
      open={open}
      title={t("title")}
      subtitle={t("summary", { count: items.length })}
      busy={saving}
      onClose={onClose}
      closeLabel={t("close")}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="focus-field inline-flex h-10 items-center rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-40"
          >
            {t("backToEditing")}
          </button>
          <button
            type="button"
            onClick={onSaveAgain}
            disabled={saving}
            className="focus-field inline-flex h-10 items-center gap-2 rounded-lg bg-admin-accent px-5 text-sm font-semibold text-white transition hover:bg-admin-accent-hover disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            )}
            {saving ? t("saving") : t("saveAgain")}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-2.5 border-b border-warning-line bg-warning-soft px-5 py-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-warning-text">{t("explain")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-5 py-2.5">
        <span className="text-xs font-medium text-text-muted">{t("applyToAll")}</span>
        <button
          type="button"
          onClick={() => onChooseAll("mine")}
          className="focus-field rounded-md border border-divider bg-bg-surface px-2.5 py-1 text-xs font-semibold text-text-body transition hover:bg-paper"
        >
          {t("allMine")}
        </button>
        <button
          type="button"
          onClick={() => onChooseAll("theirs")}
          className="focus-field rounded-md border border-divider bg-bg-surface px-2.5 py-1 text-xs font-semibold text-text-body transition hover:bg-paper"
        >
          {t("allTheirs")}
        </button>
      </div>

      <ul className="divide-y divide-divider">
        {items.map((item) => {
          const key = conflictKey(item);
          const choice = choices[key] ?? "theirs";
          return (
            <li key={key} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${ROLE_META[item.role].bgColor} ${ROLE_META[item.role].color} ${ROLE_META[item.role].borderColor}`}
                >
                  {tRoles(item.role)}
                </span>
                <span className="text-sm font-medium text-text-heading">
                  {res.label(item.resource)}
                </span>
              </div>

              <div
                role="radiogroup"
                aria-label={t("choiceFor", {
                  feature: res.label(item.resource),
                  role: tRoles(item.role),
                })}
                className="mt-2.5 flex gap-2"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === "mine"}
                  onClick={() => onChoose(key, "mine")}
                  className={`${OPTION} border ${
                    choice === "mine"
                      ? "border-admin-accent bg-admin-accent-soft text-admin-accent-text"
                      : "border-divider bg-bg-surface text-text-muted hover:bg-paper"
                  }`}
                >
                  {t("keepMine")}
                  <PermPill level={item.mine} />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === "theirs"}
                  onClick={() => onChoose(key, "theirs")}
                  className={`${OPTION} border ${
                    choice === "theirs"
                      ? "border-admin-accent bg-admin-accent-soft text-admin-accent-text"
                      : "border-divider bg-bg-surface text-text-muted hover:bg-paper"
                  }`}
                >
                  {t("takeTheirs")}
                  <PermPill level={item.theirs} />
                </button>
              </div>

              <p className="mt-1.5 text-[11px] text-text-muted">
                {t("startedFrom", { level: tLevels(`${item.was}Short`) })}
              </p>
            </li>
          );
        })}
      </ul>
    </DialogShell>
  );
}
