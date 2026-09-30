import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { AlertOctagon, AlertTriangle } from "lucide-react";
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
 * The greeting line's live answers, as chips: "is the library running
 * normally?" and — on the Overview — "is anything waiting on me?", then when
 * the numbers were read.
 *
 * Degraded/critical link straight into the System view; the attention chip
 * jumps to the queue further down the same page. Level is carried by text and
 * glyph as well as colour.
 */
export default async function HeaderStatus({
  level,
  failing,
  generatedAt,
  href,
  attention,
}: {
  level: HealthLevel;
  failing: number;
  generatedAt: string;
  href: string;
  /** Open items in the attention queue, or null when not shown on this view. */
  attention?: { count: number; critical: boolean; href: string } | null;
}) {
  // Independent lookups — resolve together rather than one after the other.
  const [t, tLib, locale] = await Promise.all([
    getTranslations("adminDashboard.status"),
    getTranslations("adminDashboard.library"),
    getLocale(),
  ]);
  const time = dateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(generatedAt));

  const label = t(`level.${level}`);
  const degraded = level === "degraded" || level === "critical";
  const AttentionIcon = attention?.critical ? AlertOctagon : AlertTriangle;

  return (
    <>
      {degraded ? (
        <Link href={href} className={`${LEVEL_STATUS[level]} dash-chip [--focus-ring-offset:1px]`}>
          <span aria-hidden="true" className="dash-dot" />
          <span aria-hidden="true">{LEVEL_GLYPH[level]}</span>
          {label}
          <span className="font-normal">{t("failingChecks", { count: failing })}</span>
        </Link>
      ) : (
        <span className={`${LEVEL_STATUS[level]} dash-chip`}>
          <span aria-hidden="true" className="dash-dot" />
          {label}
        </span>
      )}
      {attention && attention.count > 0 && (
        <a
          href={attention.href}
          className={`${attention.critical ? "dash-status--crit" : "dash-status--warn"} dash-chip [--focus-ring-offset:1px]`}
        >
          <AttentionIcon className="dash-mark h-3.5 w-3.5" aria-hidden="true" />
          {tLib("attention", { count: attention.count })}
        </a>
      )}
      <span className="text-xs text-text-muted">{t("updatedAt", { time })}</span>
    </>
  );
}
