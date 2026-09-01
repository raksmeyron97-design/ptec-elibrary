"use client";

import { useTranslations } from "next-intl";

import { LEVEL_ORDER } from "@/lib/admin/roles-shared";
import { LEVEL_ICON } from "./icons";

/**
 * What None / Read / Write actually mean, stated once at the top of the pane.
 *
 * The three words were the whole explanation before this: "No access",
 * "Read", "Full access" — which leaves the two questions that decide every
 * grant unanswered. Does Read let someone open the page at all? Does Write
 * include Read? Both are answered here, in the same order and the same colours
 * as the segmented control below, so the legend reads as a key to the control
 * rather than as prose about it.
 *
 * The middle card carries the sentence that this whole redesign turns on:
 * read is access, not a lesser kind of nothing.
 */

const TONE: Record<string, string> = {
  none: "border-divider bg-paper",
  read: "border-info-line bg-info-soft/40",
  write: "border-success-line bg-success-soft/40",
};

const ICON_TONE: Record<string, string> = {
  none: "border-divider bg-bg-surface text-text-muted",
  read: "border-info-line bg-bg-surface text-info-text",
  write: "border-success-line bg-bg-surface text-success-text",
};

export default function LevelLegend() {
  const t = useTranslations("adminRoles.semantics");
  const tLevels = useTranslations("adminRoles.levels");

  return (
    <section
      aria-label={t("legendLabel")}
      className="grid gap-3 rounded-xl border border-divider bg-bg-surface p-4 sm:grid-cols-3 sm:p-5"
    >
      {LEVEL_ORDER.map((level) => {
        const Icon = LEVEL_ICON[level];
        return (
          <div key={level} className={`rounded-lg border p-3.5 ${TONE[level]}`}>
            <div className="flex items-center gap-2">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${ICON_TONE[level]}`}
                aria-hidden="true"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <span className="text-sm font-semibold text-text-heading">{tLevels(level)}</span>
            </div>
            <p className="mt-2 text-xs font-semibold leading-snug text-text-body">
              {t(`${level}Headline`)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{t(`${level}Detail`)}</p>
          </div>
        );
      })}
    </section>
  );
}
