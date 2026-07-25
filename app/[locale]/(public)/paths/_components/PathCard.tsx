"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Layers, Clock, GraduationCap, Signal, ArrowRight, CheckCircle2, BookMarked } from "lucide-react";
import type { LearningPathSummary, PathProgressRecord } from "@/app/actions/learning-paths";
import { progressState, progressPercent } from "@/lib/learning-paths/format";
import { formatDuration } from "./format-duration";

/**
 * Redesigned learning-path card. Presentational + accessible: the whole card is
 * a single link (no nested interactive elements) with a visible text CTA. When a
 * per-user progress record is supplied it shows a progress bar and a
 * Continue / Review CTA; otherwise "Start path".
 */
export default function PathCard({
  path,
  progress,
}: {
  path: LearningPathSummary;
  progress?: PathProgressRecord | null;
}) {
  const t = useTranslations("paths");
  const locale = useLocale();

  const title = locale === "km" && path.title_km ? path.title_km : path.title;
  const description = locale === "km" && path.description_km ? path.description_km : path.description;
  const duration = formatDuration(path.durationMinutes, t);

  const state = progressState(progress);
  const pct = progress ? progressPercent(progress.completedSteps, progress.totalSteps) : 0;

  const cta =
    state === "completed" ? t("cardReview") : state === "in-progress" ? t("cardContinue") : t("cardStart");

  return (
    <Link
      href={`/paths/${path.slug}`}
      aria-label={`${title} — ${cta}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm transition-all hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
    >
      {/* Cover / branded category band */}
      <div className="relative aspect-[16/7] w-full overflow-hidden bg-gradient-to-br from-brand/12 via-brand/6 to-paper">
        {path.cover_url ? (
          <Image
            src={path.cover_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <GraduationCap className="h-10 w-10 text-brand/35" aria-hidden="true" />
          </div>
        )}
        {/* Badges */}
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          {path.audience && (
            <span className="inline-flex items-center rounded-full bg-bg-surface/95 px-2.5 py-0.5 text-[11px] font-semibold text-brand shadow-sm backdrop-blur">
              {path.audience}
            </span>
          )}
          {path.difficulty && (
            <span className="inline-flex items-center gap-1 rounded-full bg-bg-surface/95 px-2.5 py-0.5 text-[11px] font-semibold text-text-muted shadow-sm backdrop-blur">
              <Signal className="h-3 w-3" aria-hidden="true" />
              {t(`difficulty.${path.difficulty}`)}
            </span>
          )}
        </div>
        {state === "completed" && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-600/95 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {t("cardReview")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-text-heading">{title}</h3>
        {description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-muted">{description}</p>
        )}

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] font-medium text-text-muted">
          <span className="inline-flex items-center gap-1">
            <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
            {t("modules", { count: path.moduleCount })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {t("steps", { count: path.stepCount })}
          </span>
          {duration && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {duration}
            </span>
          )}
        </div>

        {/* Progress */}
        {progress && state !== "not-started" && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-text-muted tabular-nums">
              <span>{t("yourProgress")}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper">
              <div
                className={`h-full rounded-full transition-all ${state === "completed" ? "bg-emerald-500" : "bg-brand"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-4 flex items-center gap-1.5 pt-1 text-[13px] font-bold text-brand">
          {cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
