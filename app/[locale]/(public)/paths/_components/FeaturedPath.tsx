"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight, CheckCircle2, Clock, GraduationCap, Layers, Signal, Sparkles,
} from "lucide-react";
import type { LearningPathDetail, PathProgressRecord } from "@/app/actions/learning-paths";
import { progressState } from "@/lib/learning-paths/format";
import { formatDuration } from "./format-duration";
import PathCoverFallback from "./PathCoverFallback";

/**
 * The lead item of the catalogue: one path given more room than a grid cell,
 * so a first-time visitor has an obvious place to start.
 *
 * This is deliberately a LEAD CARD, not the mini detail page it used to be.
 * The previous version carried the eyebrow, title, description, a five-item
 * meta row, three outcomes, a numbered module preview, a resource-type tag
 * row, a primary CTA and a Share button — roughly 500px of committed vertical
 * space asking a visitor to evaluate a path they had not chosen yet, before
 * they had seen that any others existed.
 *
 * What stayed is what actually helps someone decide: the title, the promise
 * ("what you'll learn"), the shape of the commitment (level, steps, duration)
 * and one way in. What went:
 *
 * • The module preview — curriculum belongs on the detail page, and it said
 *   the same thing as the step count in five times the space.
 * • The resource-type tags — an inventory of formats is not a reason to start.
 * • Share — sharing a path you have not opened is a rare intent, and it was
 *   the only reason this component needed clipboard/`navigator.share` handling
 *   and a live-region toast. The detail page shares.
 */
export default function FeaturedPath({
  detail,
  progress,
}: {
  detail: LearningPathDetail;
  progress: PathProgressRecord | null;
}) {
  const t = useTranslations("paths");
  const locale = useLocale();

  const title = locale === "km" && detail.title_km ? detail.title_km : detail.title;
  const description = locale === "km" && detail.description_km ? detail.description_km : detail.description;
  const duration = formatDuration(detail.durationMinutes, t);
  const state = progressState(progress);
  const cta =
    state === "completed" ? t("cardReview") : state === "in-progress" ? t("cardContinue") : t("featuredStart");
  const outcomes = detail.outcomes.slice(0, 3);

  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <section
      aria-labelledby="featured-heading"
      className="mb-6 overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/[0.07] via-bg-surface to-bg-surface shadow-sm"
    >
      {/* Image first in the DOM but placed second on desktop, so a screen
          reader and a narrow viewport both meet the words before the picture. */}
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="p-6 sm:p-7">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t("featuredEyebrow")}
          </span>

          <h2
            id="featured-heading"
            className="mt-3 font-khmer-serif text-[clamp(20px,3vw,27px)] font-bold leading-[1.2] text-text-heading"
          >
            {title}
          </h2>

          {description && (
            <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-text-muted">{description}</p>
          )}

          <ul className="mt-3.5 flex list-none flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] font-medium text-text-muted">
            {detail.audience && (
              <li className="inline-flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                {detail.audience}
              </li>
            )}
            {detail.difficulty && (
              <li className="inline-flex items-center gap-1">
                <Signal className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`difficulty.${detail.difficulty}`)}
              </li>
            )}
            <li className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              {t("steps", { count: detail.stepCount })}
            </li>
            {duration && (
              <li className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {duration}
              </li>
            )}
          </ul>

          {outcomes.length > 0 && (
            <>
              <h3 className="mt-5 text-[11.5px] font-bold uppercase tracking-[0.13em] text-text-muted">
                {t("outcomesHeading")}
              </h3>
              <ul className="mt-2 list-none space-y-1.5">
                {outcomes.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-text-body">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                    <span>{locale === "km" && o.km ? o.km : o.en || o.km}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Link
            href={`/paths/${detail.slug}`}
            className="btn-brand-gradient mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white shadow-lg shadow-brand/25 transition-shadow hover:shadow-xl hover:shadow-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            {cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="relative hidden min-h-[240px] md:block">
          {detail.cover_url && !coverFailed ? (
            <Image
              src={detail.cover_url}
              alt=""
              fill
              priority
              sizes="340px"
              onError={() => setCoverFailed(true)}
              className="object-cover"
            />
          ) : (
            /* Same graceful degradation as the cards, and the same panel: a
               deleted storage object must not leave a broken-image glyph
               across the lead card. */
            <PathCoverFallback size="lead" />
          )}
        </div>
      </div>
    </section>
  );
}
