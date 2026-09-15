"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Layers, Clock, ArrowRight, CheckCircle2, BookOpen } from "lucide-react";
import type { LearningPathSummary, PathProgressRecord } from "@/app/actions/learning-paths";
import { progressState, progressPercent } from "@/lib/learning-paths/format";
import { deriveScope, scopeLabelKeys } from "@/lib/learning-paths/taxonomy";
import { LangText } from "@/components/ui/core/LangText";
import { Badge } from "@/components/ui/core/Badge";
import { formatDuration } from "./format-duration";
import PathCoverFallback from "./PathCoverFallback";

function ProgressDial({ pct, done }: { pct: number; done: boolean }) {
  const r = 9;
  const circumference = 2 * Math.PI * r;
  return (
    <span
      aria-hidden="true"
      className={`relative flex h-7 w-7 items-center justify-center ${done ? "text-emerald-600" : "text-brand"}`}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
        <circle cx="14" cy="14" r={r} fill="none" stroke="currentColor" strokeWidth="3" opacity="0.18" />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
        />
      </svg>
      {done && <CheckCircle2 className="absolute h-3.5 w-3.5" />}
    </span>
  );
}

function getCategoryMarkerColor(subjectOrTrack?: string | null): string {
  const s = (subjectOrTrack ?? "").toLowerCase();
  if (s.includes("math") || s.includes("គណិត")) return "text-brand";
  if (s.includes("read") || s.includes("អំណាន") || s.includes("ភាសា")) return "text-accent-text";
  if (s.includes("sci") || s.includes("វិទ្យា")) return "text-success";
  return "text-info";
}

export default function PathCard({
  path,
  progress,
  index = 0,
  isNew = false,
}: {
  path: LearningPathSummary;
  progress?: PathProgressRecord | null;
  index?: number;
  isNew?: boolean;
}) {
  const t = useTranslations("paths");
  const locale = useLocale();

  const title = locale === "km" && path.title_km ? path.title_km : path.title;
  const description = locale === "km" && path.description_km ? path.description_km : path.description;
  const duration = formatDuration(path.durationMinutes, t);

  const state = progressState(progress);
  const pct = progress ? progressPercent(progress.completedSteps, progress.totalSteps) : 0;
  const started = !!progress && state !== "not-started";

  let cta = t("cardStart");
  if (state === "completed") {
    cta = t("cardReview");
  } else if (state === "in-progress") {
    cta = t("cardContinuePct", { pct });
  }

  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = !!path.cover_url && !coverFailed;

  const scope = deriveScope(path);
  const scopeKeys = scopeLabelKeys(scope);
  const scopeLabel = scopeKeys.length > 0 ? scopeKeys.map((k) => t(k)).join(" · ") : null;
  const categoryLabel = path.subject || scopeLabel || t("categoryLabel");

  const resourceCount =
    path.stepResources && path.stepResources.length > 0
      ? new Set(path.stepResources.map((r) => r.key)).size
      : path.stepCount;

  const difficultyVariant =
    path.difficulty === "beginner"
      ? "success"
      : path.difficulty === "advanced"
        ? "warning"
        : "brand";

  const stagger = `${Math.min(index, 7) * 45}ms`;

  return (
    <Link
      href={`/paths/${path.slug}`}
      aria-label={`${title} — ${cta}`}
      className="paths-card-enter focus-field group relative flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:border-brand/40 hover:shadow-lg motion-safe:hover:-translate-y-0.5"
      style={{ animationDelay: stagger }}
    >
      {/* Cover (16:9) */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-brand/12 via-brand/6 to-paper">
        {showCover ? (
          <Image
            src={path.cover_url!}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
            onError={() => setCoverFailed(true)}
            className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
          />
        ) : (
          <PathCoverFallback />
        )}

        {started && (
          <span className="absolute right-3 top-3 rounded-full bg-bg-surface/95 p-1 shadow-sm backdrop-blur">
            <ProgressDial pct={pct} done={state === "completed"} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {/* Category with color marker and Level badge */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center text-xs font-semibold text-text-muted">
            <span
              className={`mr-1.5 text-xs ${getCategoryMarkerColor(path.subject || scope.track)}`}
              aria-hidden="true"
            >
              ●
            </span>
            <span>{categoryLabel}</span>
          </span>

          <div className="flex items-center gap-1.5">
            {isNew && (
              <span className="inline-flex items-center rounded-full bg-amber-600 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                {t("badgeNew")}
              </span>
            )}
            {path.difficulty && (
              <Badge variant={difficultyVariant} className="text-[11px] font-semibold">
                {t(`difficulty.${path.difficulty}`)}
              </Badge>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-text-heading group-hover:text-brand">
          <LangText text={title} locale={locale} />
        </h3>

        {/* One-line description */}
        {description && (
          <LangText
            as="p"
            text={description}
            locale={locale}
            className="mt-1.5 line-clamp-1 text-[13px] leading-relaxed text-text-muted"
          />
        )}

        {/* Metadata row: Steps, Resources, Duration */}
        <ul className="mt-3 flex list-none flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] font-medium text-text-muted">
          <li className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {t("steps", { count: path.stepCount })}
          </li>
          <li className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {t("resourceCount", { count: resourceCount })}
          </li>
          {duration && (
            <li className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {duration}
            </li>
          )}
        </ul>

        {/* Progress bar: only real progress (never 0% for anonymous) */}
        {started && (
          <div className="mt-3.5">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold tabular-nums text-text-muted">
              <span>{t("stepsOf", { done: progress!.completedSteps, total: progress!.totalSteps })}</span>
              <span>{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("yourProgress")}
              className="h-1.5 w-full overflow-hidden rounded-full bg-paper"
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  state === "completed" ? "bg-emerald-600" : "bg-brand"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-auto pt-4">
          <div className="flex items-center gap-1.5 border-t border-divider pt-3.5 text-[13px] font-bold text-brand">
            {cta}
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
