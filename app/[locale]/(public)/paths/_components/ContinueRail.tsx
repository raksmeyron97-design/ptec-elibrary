"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, GraduationCap, PlayCircle, Trophy } from "lucide-react";
import type { PathProgressRecord } from "@/app/actions/learning-paths";
import { progressPercent } from "@/lib/learning-paths/format";

/**
 * "Pick up where you left off", rendered only from client-fetched progress so
 * nothing here can leak into the ISR shell.
 *
 * The heading is one line, not two. It previously stacked "Welcome back" over
 * "Continue where you left off" — two headings saying the same thing above two
 * cards.
 */
export default function ContinueRail({
  inProgress,
  completed,
}: {
  inProgress: PathProgressRecord[];
  completed: PathProgressRecord[];
}) {
  const t = useTranslations("paths");
  const locale = useLocale();

  if (inProgress.length === 0 && completed.length === 0) return null;

  return (
    <section
      aria-labelledby="continue-heading"
      className="mb-6 rounded-2xl border border-brand/15 border-l-4 border-l-brand bg-brand/[0.03] p-4 sm:p-5"
    >
      <h2
        id="continue-heading"
        className="mb-3.5 flex items-center gap-2 text-[14.5px] font-bold text-text-heading"
      >
        <PlayCircle className="h-[18px] w-[18px] text-brand" aria-hidden="true" />
        {inProgress.length > 0 ? t("continueHeading") : t("welcomeBack")}
      </h2>

      {inProgress.length > 0 && (
        <ul className="grid list-none gap-3 lg:grid-cols-2">
          {inProgress.slice(0, 4).map((p) => (
            <li key={p.pathId}>
              <ContinueCard record={p} />
            </li>
          ))}
        </ul>
      )}

      {completed.length > 0 && (
        <div className={inProgress.length > 0 ? "mt-4 border-t border-brand/12 pt-3.5" : ""}>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-text-muted">
            <Trophy className="h-3.5 w-3.5 text-gold-500" aria-hidden="true" />
            {t("recentlyCompleted")}
          </h3>
          <ul className="flex list-none flex-wrap gap-2">
            {completed.slice(0, 4).map((c) => (
              <li key={c.pathId}>
                <Link
                  href={`/paths/${c.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-600/8 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-600/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="max-w-[22ch] truncate">
                    {locale === "km" && c.title_km ? c.title_km : c.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * A single resume card: horizontal, with the module the learner is inside as
 * context and an explicit Resume affordance.
 *
 * The Resume control is styled as a button but is NOT a button element — the
 * whole card is already one link, and nesting an interactive element inside it
 * would produce the nested-interactive pattern assistive tech cannot resolve.
 */
function ContinueCard({ record }: { record: PathProgressRecord }) {
  const t = useTranslations("paths");
  const locale = useLocale();
  const title = locale === "km" && record.title_km ? record.title_km : record.title;
  const pct = progressPercent(record.completedSteps, record.totalSteps);
  const moduleName =
    record.nextStep &&
    (locale === "km" && record.nextStep.moduleTitleKm
      ? record.nextStep.moduleTitleKm
      : record.nextStep.moduleTitle);

  return (
    <Link
      href={`/paths/${record.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-brand/20 bg-bg-surface p-3 transition-all duration-200 hover:border-brand/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-body motion-safe:hover:-translate-y-px"
    >
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-paper">
        {record.cover_url ? (
          <Image src={record.cover_url} alt="" fill sizes="72px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <GraduationCap className="h-6 w-6 text-brand/40" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-text-heading">{title}</p>

        {moduleName && (
          <p className="mt-0.5 truncate text-[11.5px] text-text-muted">
            {t("continueModule", { module: moduleName })}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("yourProgress")}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper"
          >
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-text-muted">
            {t("stepsOf", { done: record.completedSteps, total: record.totalSteps })}
          </span>
        </div>
      </div>

      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[12px] font-bold text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
      >
        {t("resume")}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/**
 * Reserved space for the rail while progress is in flight.
 *
 * Only rendered for a visitor we have reason to believe HAS progress — see the
 * localStorage hint in PathsExplorer. Showing it unconditionally meant every
 * signed-out visitor (the overwhelming majority on a public library) watched a
 * "Continue learning" panel shimmer at the top of the page and then vanish:
 * a promise the page could not keep, plus a layout shift, in exchange for
 * reserving space that only a signed-in learner would use.
 */
export function ContinueRailSkeleton() {
  return (
    <div
      className="mb-6 rounded-2xl border border-brand/15 border-l-4 border-l-brand bg-brand/[0.03] p-4 sm:p-5"
      aria-hidden="true"
    >
      <div className="paths-skeleton mb-3.5 h-4 w-40 rounded" />
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-brand/20 bg-bg-surface p-3">
            <div className="paths-skeleton h-[72px] w-[72px] shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="paths-skeleton h-3.5 w-3/4 rounded" />
              <div className="paths-skeleton h-2.5 w-1/2 rounded" />
              <div className="paths-skeleton h-1.5 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
