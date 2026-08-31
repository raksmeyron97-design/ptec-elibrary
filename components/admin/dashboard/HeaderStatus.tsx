import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import type { HealthLevel } from "@/lib/admin/dashboard-shared";
import { dateTimeFormat } from "./formatters";

/** Status class per level — the dot reads --dash-status-mark from it, which
 *  is the AA-safe step (≥4.8:1) rather than the palette 500-weight the dots
 *  used to hard-code (amber-500 was 2.15:1 on white, below the 3:1 floor for
 *  a non-text mark). */
const LEVEL_STATUS: Record<HealthLevel, string> = {
  operational: "dash-status--ok",
  degraded: "dash-status--warn",
  critical: "dash-status--crit",
  unknown: "dash-status--neutral",
};

/** Status is never colour-only: each level also has a distinct glyph. */
const LEVEL_GLYPH: Record<HealthLevel, string> = {
  operational: "●",
  degraded: "▲",
  critical: "■",
  unknown: "◌",
};

/**
 * "Operational · Updated 14:02" — the always-visible answer to "is the library
 * running normally?". Degraded/critical states link straight into the System
 * view; the level is carried by text and glyph as well as colour.
 */
export default async function HeaderStatus({
  level,
  failing,
  generatedAt,
  href,
}: {
  level: HealthLevel;
  failing: number;
  generatedAt: string;
  href: string;
}) {
  // Independent lookups — resolve together rather than one after the other.
  const [t, locale] = await Promise.all([getTranslations("adminDashboard.status"), getLocale()]);
  const time = dateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(generatedAt));

  const label = t(`level.${level}`);
  const degraded = level === "degraded" || level === "critical";

  return (
    <>
      <span aria-hidden="true" className="text-divider">
        ·
      </span>
      {degraded ? (
        <Link
          href={href}
          className={`${LEVEL_STATUS[level]} dash-mark inline-flex items-center gap-1.5 rounded-md px-1 font-semibold hover:underline [--focus-ring-offset:1px]`}
        >
          <span aria-hidden="true" className="dash-dot" />
          <span aria-hidden="true" className="text-xs">
            {LEVEL_GLYPH[level]}
          </span>
          {label}
          <span className="font-normal">{t("failingChecks", { count: failing })}</span>
        </Link>
      ) : (
        <span className={`${LEVEL_STATUS[level]} inline-flex items-center gap-1.5`}>
          <span aria-hidden="true" className="dash-dot" />
          {label}
        </span>
      )}
      <span aria-hidden="true" className="text-divider">
        ·
      </span>
      <span>{t("updatedAt", { time })}</span>
    </>
  );
}
