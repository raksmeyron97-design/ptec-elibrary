"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Layers, Clock, Signal, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import type { LearningPathSummary, PathProgressRecord } from "@/app/actions/learning-paths";
import { progressState, progressPercent } from "@/lib/learning-paths/format";
import { formatDuration } from "./format-duration";
import PathCoverFallback from "./PathCoverFallback";

/** A path counts as new for two weeks after its last edit. */
const NEW_FOR_DAYS = 14;

function isNewlyUpdated(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) / 86_400_000 <= NEW_FOR_DAYS;
}

/**
 * Compact completion dial shown on the cover corner once a learner has
 * started. `aria-hidden` because the same percentage is announced by the
 * labelled progress bar in the card body — without that the card would read
 * its progress out twice.
 */
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

/**
 * A learning path as a grid cell. Presentational + accessible: the whole card
 * is a single link (no nested interactive elements) with a visible text CTA.
 *
 * Layout decisions worth keeping:
 *
 * • The cover is 2:1, not the 16:6 letterbox it was. At 16:6 a real cover was
 *   cropped to a strip too shallow to read as a picture, and the fallback
 *   hatch had no room to look deliberate.
 *
 * • Audience and difficulty moved OFF the cover and into the body. Pills
 *   floated over an arbitrary photograph need a scrim to stay legible, and
 *   that scrim was the only reason the cover carried a gradient overlay at
 *   all; as body text they are higher contrast and cost nothing. The cover
 *   now carries only the two things that are genuinely about the image's
 *   corner — "new", and how far you are.
 *
 * • The CTA is pinned to the bottom with `mt-auto` above a hairline. Cards in
 *   a row hold different amounts of text, and before this the CTA sat at a
 *   different height in every one of them.
 *
 * • Free-text tags are gone. The card already states audience, level, step
 *   count and duration; tags added a fifth metadata row that pushed the CTA
 *   down, and — being inside the card's own link — could not be clicked to
 *   filter by, so they were decoration. They remain fully searchable: the
 *   explorer's query still matches against them.
 */
export default function PathCard({
  path,
  progress,
  index = 0,
}: {
  path: LearningPathSummary;
  progress?: PathProgressRecord | null;
  /** Position in the grid — drives the entrance stagger only. */
  index?: number;
}) {
  const t = useTranslations("paths");
  const locale = useLocale();

  const title = locale === "km" && path.title_km ? path.title_km : path.title;
  const description = locale === "km" && path.description_km ? path.description_km : path.description;
  const duration = formatDuration(path.durationMinutes, t);

  const state = progressState(progress);
  const pct = progress ? progressPercent(progress.completedSteps, progress.totalSteps) : 0;
  const started = !!progress && state !== "not-started";

  const cta =
    state === "completed" ? t("cardReview") : state === "in-progress" ? t("cardContinue") : t("cardStart");
  // A cover_url can point at a file that has since been deleted from storage
  // (one of these 404s today). Without this the card renders the browser's
  // broken-image glyph, which looks like a bug in the page rather than a
  // missing asset — fall back to the same pattern an uncovered path gets.
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = !!path.cover_url && !coverFailed;
  const isNew = isNewlyUpdated(path.updated_at);
  // Capped so a late card in a long list is not held back for a full second.
  const stagger = `${Math.min(index, 7) * 45}ms`;

  return (
    <Link
      href={`/paths/${path.slug}`}
      aria-label={`${title} — ${cta}`}
      className="paths-card-enter group relative flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:border-brand/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-body motion-safe:hover:-translate-y-0.5"
      style={{ animationDelay: stagger }}
    >
      {/* Cover */}
      <div className="relative aspect-[2/1] w-full overflow-hidden bg-gradient-to-br from-brand/12 via-brand/6 to-paper">
        {showCover ? (
          <Image
            src={path.cover_url!}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
            onError={() => setCoverFailed(true)}
            className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
          />
        ) : (
          <PathCoverFallback />
        )}

        {isNew && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {t("badgeNew")}
          </span>
        )}

        {started && (
          <span className="absolute right-3 top-3 rounded-full bg-bg-surface/95 p-1 shadow-sm backdrop-blur">
            <ProgressDial pct={pct} done={state === "completed"} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {path.audience && (
          <p className="mb-2 truncate text-[11px] font-bold uppercase tracking-[0.13em] text-brand">
            {path.audience}
          </p>
        )}

        <h3 className="line-clamp-2 text-[16.5px] font-bold leading-snug text-text-heading">{title}</h3>

        {description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-muted">{description}</p>
        )}

        {/* Meta. Module count is deliberately absent: "4 modules · 12 steps"
            is one granularity more than a browsing decision needs, and steps
            is the number that maps to effort. Modules are shown on the detail
            page, where the curriculum is the point. */}
        <ul className="mt-3 flex list-none flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] font-medium text-text-muted">
          {path.difficulty && (
            <li className="inline-flex items-center gap-1">
              <Signal className="h-3.5 w-3.5" aria-hidden="true" />
              {t(`difficulty.${path.difficulty}`)}
            </li>
          )}
          <li className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {t("steps", { count: path.stepCount })}
          </li>
          {duration && (
            <li className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {duration}
            </li>
          )}
        </ul>

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
                className={`h-full rounded-full transition-all duration-500 ${state === "completed" ? "bg-emerald-600" : "bg-brand"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer. `mt-auto` is what aligns the CTA across a row of cards
            whose titles and descriptions run to different lengths. */}
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
