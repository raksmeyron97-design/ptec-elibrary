"use client";

import { useTranslations } from "next-intl";
import type { PermLevel } from "@/lib/types/roles";
import { LEVEL_ORDER } from "@/lib/admin/roles-shared";
import Badge, { type BadgeTone } from "@/components/admin/kit/Badge";
import { LEVEL_ICON } from "./icons";

/**
 * Level → kit badge tone. Going through the shared `Badge` (rather than a
 * fourth hand-written `bg-… text-… border-…` triplet) is what guarantees all
 * three levels get identical padding, radius, font size and height, and only
 * the colour differs. Every tone resolves through the
 * `--ptec-{success,warning,danger,info}-{soft,line,text}` tokens.
 */
const TONE: Record<PermLevel, BadgeTone> = {
  write: "success",
  read: "info",
  none: "neutral",
};

/**
 * The selected segment of the editable control. Solid fills, so the current
 * level survives a glance across a long list — and drawn from the solid status
 * tokens (`--ptec-success` / `--ptec-info`) rather than palette literals, so
 * the segmented control and the read-only badge can never drift apart.
 */
export const SELECTED_LEVEL_STYLE: Record<PermLevel, string> = {
  write: "bg-success text-white shadow-sm",
  read: "bg-info text-white shadow-sm",
  none: "bg-text-heading text-white shadow-sm",
};

/**
 * Read-only badge shown in view mode and for the locked super_admin column.
 * `compact` drops the icon and fills its cell — the mobile compare grid labels
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
 * Editable segmented control: None · Read · Full access.
 *
 * A radiogroup so keyboard and screen-reader users can operate it. The
 * role-scoped pane gives every row a full-width control, so all three segments
 * carry their text label there; `showLabels={false}` degrades to icon-only for
 * the narrowest contexts (still named via aria-label + title).
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
      // Full width below `sm`, where the control owns its own row: three 44px
      // touch targets, rather than three 28px ones sized for a mouse.
      className={`inline-flex w-full items-center gap-0.5 rounded-lg border p-0.5 transition-colors sm:w-auto ${
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
            className={`focus-field inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-all sm:h-7 sm:flex-none ${
              selected
                ? SELECTED_LEVEL_STYLE[level]
                : "text-text-muted hover:bg-bg-surface hover:text-text-body"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" strokeWidth={2.5} />
            {showLabels && <span>{t(`${level}Short`)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "was Read" — the level a dirty cell started from, shown beside the control.
 *
 * Without it the only signal that a row is pending is the gold frame, which
 * says *that* something changed but not *what from*; on a page whose whole job
 * is granting and revoking access, that is the half that matters.
 */
export function WasLevel({ level }: { level: PermLevel }) {
  const t = useTranslations("adminRoles.levels");
  const tPane = useTranslations("adminRoles.pane");
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-gold-700">
      {tPane("wasLevel", { level: t(`${level}Short`) })}
    </span>
  );
}
