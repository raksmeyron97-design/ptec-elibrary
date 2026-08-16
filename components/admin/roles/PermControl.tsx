"use client";

import { useTranslations } from "next-intl";
import type { PermLevel } from "@/lib/types/roles";
import { LEVEL_ORDER } from "@/lib/admin/roles-shared";
import Badge, { type BadgeTone } from "@/components/admin/kit/Badge";
import { LEVEL_ICON } from "./icons";

/**
 * Level → kit badge tone. Going through the shared `Badge` (rather than a
 * fourth hand-written `bg-… text-… border-…` triplet) is what guarantees the
 * brief's rule structurally: all three levels get identical padding, radius,
 * font size and height, and only the colour differs. Every tone resolves
 * through the `--ptec-{success,info}-{soft,line,text}` tokens.
 */
const TONE: Record<PermLevel, BadgeTone> = {
  write: "success",
  read: "info",
  none: "neutral",
};

const SELECTED_STYLE: Record<PermLevel, string> = {
  write: "bg-emerald-600 text-white shadow-sm",
  read: "bg-blue-600 text-white shadow-sm",
  none: "bg-slate-600 text-white shadow-sm",
};

/**
 * Read-only badge shown in view mode and for the locked super_admin column.
 * `compact` drops the icon and fills its cell — the mobile card list labels
 * columns with role initials and has no width to spare.
 */
export function PermPill({
  level,
  locked,
  compact = false,
}: {
  level: PermLevel;
  locked?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("adminRoles.levels");
  return (
    <Badge
      tone={TONE[level]}
      icon={compact ? undefined : LEVEL_ICON[level]}
      title={t(`${level}Description`)}
      className={
        compact
          ? "w-full justify-center"
          : `transition-shadow group-hover/row:shadow-sm ${locked ? "opacity-90" : ""}`
      }
    >
      {t(`${level}Short`)}
    </Badge>
  );
}

/**
 * Editable segmented control: None · Read · Write.
 * A radiogroup so keyboard + screen-reader users can operate it. `showLabels`
 * reveals the selected segment's text on wide screens; narrow contexts degrade
 * to icon-only segments (still named via aria-label + title).
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
            title={t(`${level}Description`)}
            onClick={() => onChange(level)}
            className={`inline-flex h-6 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition-all ${
              selected ? SELECTED_STYLE[level] : "text-slate-400 hover:bg-white hover:text-slate-700"
            }`}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" strokeWidth={2.5} />
            {/* Only the selected segment shows its text label — compact, yet the
                current level is always legible without relying on colour. */}
            {showLabels && selected && <span>{t(`${level}Short`)}</span>}
          </button>
        );
      })}
    </div>
  );
}
