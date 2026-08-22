"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Layers, Clock, GraduationCap, Signal, ArrowRight, CheckCircle2, BookMarked, Sparkles } from "lucide-react";
import type { LearningPathSummary, PathProgressRecord } from "@/app/actions/learning-paths";
import { progressState, progressPercent } from "@/lib/learning-paths/format";
import { formatDuration } from "./format-duration";

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
 * Stand-in for a missing cover. A tint plus a faint cross-hatch built from two
 * repeating gradients — a plain block with a centred mortarboard made every
 * uncovered path look like the same path in a grid.
 */
function CoverFallback() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent 0 11px, color-mix(in srgb, var(--color-brand) 5%, transparent) 11px 22px)," +
          "repeating-linear-gradient(-45deg, transparent 0 11px, color-mix(in srgb, var(--color-brand) 3%, transparent) 11px 22px)",
      }}
    >
      <GraduationCap
        className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-brand/25"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Redesigned learning-path card. Presentational + accessible: the whole card is
 * a single link (no nested interactive elements) with a visible text CTA. When a
 * per-user progress record is supplied it shows a progress bar and a
 * Continue / Review CTA; otherwise "Start path".
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

  const cta =
    state === "completed" ? t("cardReview") : state === "in-progress" ? t("cardContinue") : t("cardStart");
  // A cover_url can point at a file that has since been deleted from storage
  // (one of these 404s today). Without this the card renders the browser's
  // broken-image glyph, which looks like a bug in the page rather than a
  // missing asset — fall back to the same pattern an uncovered path gets.
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = !!path.cover_url && !coverFailed;
  const isNew = isNewlyUpdated(path.updated_at);
  const tags = (path.tags ?? []).slice(0, 3);
  // Capped so a late card in a long list is not held back for a full second.
  const stagger = `${Math.min(index, 7) * 45}ms`;

  return (
    <Link
      href={`/paths/${path.slug}`}
      aria-label={`${title} — ${cta}`}
      className="paths-card-enter group relative flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-body motion-safe:hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg"
      style={{ animationDelay: stagger }}
    >
      {/* Cover */}
      <div className="relative aspect-[16/6] w-full overflow-hidden bg-gradient-to-br from-brand/12 via-brand/6 to-paper">
        {showCover ? (
          <Image
            src={path.cover_url!}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
            onError={() => setCoverFailed(true)}
            className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
          />
        ) : (
          <CoverFallback />
        )}

        {/* Scrim: keeps the bottom-left difficulty pill legible over any
            photograph, and deepens slightly on hover. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        />

        {/* Top-left: audience + new */}
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          {path.audience && (
            <span className="inline-flex items-center rounded-full bg-bg-surface/95 px-2.5 py-0.5 text-[11px] font-semibold text-brand shadow-sm backdrop-blur">
              {path.audience}
            </span>
          )}
          {isNew && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {t("badgeNew")}
            </span>
          )}
        </div>

        {/* Top-right: completion dial */}
        {progress && state !== "not-started" && (
          <span className="absolute right-3 top-3 rounded-full bg-bg-surface/95 p-1 shadow-sm backdrop-blur">
            <ProgressDial pct={pct} done={state === "completed"} />
          </span>
        )}

        {/* Bottom-left: difficulty, moved off the top row so the two corners
            carry one idea each — what it is, and how far you are. */}
        {path.difficulty && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-bg-surface/95 px-2.5 py-0.5 text-[11px] font-semibold text-text-body shadow-sm backdrop-blur">
            <Signal className="h-3 w-3" aria-hidden="true" />
            {t(`difficulty.${path.difficulty}`)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-text-heading">{title}</h3>
        {description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-muted">{description}</p>
        )}

        {tags.length > 0 && (
          <ul className="mt-2.5 flex list-none flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-text-muted"
              >
                {tag}
              </li>
            ))}
          </ul>
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
              <span>{t("stepsOf", { done: progress.completedSteps, total: progress.totalSteps })}</span>
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

        {/* CTA */}
        <div className="mt-4 flex items-center gap-1.5 pt-1 text-[13px] font-bold text-brand">
          {cta}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
