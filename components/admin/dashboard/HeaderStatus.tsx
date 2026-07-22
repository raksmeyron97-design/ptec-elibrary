import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import type { HealthLevel } from "@/lib/admin/dashboard-shared";
import { dateTimeFormat } from "./formatters";

const LEVEL_DOT: Record<HealthLevel, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  critical: "bg-rose-500",
  unknown: "bg-slate-400",
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
          className={`inline-flex items-center gap-1.5 rounded-md px-1 font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
            level === "critical" ? "text-rose-700" : "text-amber-700"
          }`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[level]}`} />
          <span aria-hidden="true" className="text-[9px]">
            {LEVEL_GLYPH[level]}
          </span>
          {label}
          <span className="font-normal">{t("failingChecks", { count: failing })}</span>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[level]}`} />
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
