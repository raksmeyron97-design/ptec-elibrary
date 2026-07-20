"use client";

import { useTranslations } from "next-intl";
import type { PermLevel } from "@/lib/types/roles";
import { LEVEL_ORDER } from "@/lib/admin/roles-shared";
import { LEVEL_ICON } from "./icons";

// Level → static colour tokens. Every state also carries a distinct icon and
// text label, so the control is legible without relying on colour perception.
const PILL_STYLE: Record<PermLevel, string> = {
  write: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  read: "bg-blue-50 text-blue-700 ring-blue-200",
  none: "bg-slate-50 text-slate-500 ring-slate-200",
};

const SELECTED_STYLE: Record<PermLevel, string> = {
  write: "bg-emerald-600 text-white shadow-sm",
  read: "bg-blue-600 text-white shadow-sm",
  none: "bg-slate-600 text-white shadow-sm",
};

/** Read-only badge shown in view mode and for the locked super_admin row. */
export function PermPill({ level, locked }: { level: PermLevel; locked?: boolean }) {
  const t = useTranslations("adminRoles.levels");
  const Icon = LEVEL_ICON[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${PILL_STYLE[level]} ${locked ? "opacity-90" : ""}`}
      title={t(`${level}Description`)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" strokeWidth={2.5} />
      <span>{t(`${level}Short`)}</span>
    </span>
  );
}

/**
 * Editable segmented control: None · Read · Write.
 * Rendered as a radiogroup so keyboard + screen-reader users can operate it.
 * `showLabels` reveals the text on wide screens; on tablet it degrades to
 * icon-only segments (still labelled via aria + title).
 */
export function PermSegmented({
  value,
  onChange,
  dirty,
  ariaLabel,
  showLabels = true,
}: {
  value: PermLevel;
  onChange: (level: PermLevel) => void;
  dirty?: boolean;
  ariaLabel: string;
  showLabels?: boolean;
}) {
  const t = useTranslations("adminRoles.levels");
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 rounded-lg border p-0.5 transition-colors ${
        dirty ? "border-gold-400 bg-gold-50 ring-1 ring-gold-300" : "border-divider bg-paper"
      }`}
    >
      {LEVEL_ORDER.map((level) => {
        const Icon = LEVEL_ICON[level];
        const selected = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(level)}
            title={t(level)}
            onClick={() => onChange(level)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
              selected
                ? SELECTED_STYLE[level]
                : "text-slate-400 hover:bg-white hover:text-slate-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" strokeWidth={2.5} />
            {/* Only the selected segment shows its text label — compact, yet the
                current level is always legible without relying on colour. */}
            {showLabels && selected && <span>{t(`${level}Short`)}</span>}
          </button>
        );
      })}
    </div>
  );
}
