import type { Metadata } from "next";
import { Suspense } from "react";
import { GraduationCap, Layers, Clock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getPublishedPaths, getFeaturedPath, getPathBySlug } from "@/app/actions/learning-paths";
import { getCollectionStats } from "@/lib/collection-stats";
import JsonLd from "@/components/seo/JsonLd";
import PathsExplorer from "./_components/PathsExplorer";
import PathJourneyVisual from "./_components/PathJourneyVisual";
import PathCardSkeleton from "./_components/PathCardSkeleton";
import {
  buildPathsListingMetadata,
  pathsCollectionJsonLd,
  type LearningPathSeoInput,
} from "@/lib/seo/learning-path-seo";
import { getOrgIdentity } from "@/lib/system-settings/config";

// ISR: this page renders no per-visit/per-user data (learner progress is fetched
// client-side inside PathsExplorer, so the shell stays cacheable). getPublished-
// Paths is invalidated by the admin mutations via the "paths" tag.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "paths" });
  return buildPathsListingMetadata(
    locale,
    { title: t("seoTitle"), description: t("seoDescription") },
    await getOrgIdentity(),
  );
}

export default async function LearningPathsPage() {
  const [paths, featuredSummary, locale, t, stats] = await Promise.all([
    getPublishedPaths(),
    getFeaturedPath(),
    getLocale(),
    getTranslations("paths"),
    getCollectionStats(),
  ]);

  // Featured path needs its outcomes + curriculum shape for the hero card.
  const featured = featuredSummary ? await getPathBySlug(featuredSummary.slug) : null;

  const pathTotal = stats?.learningPaths ?? paths.length;
  const totalResources = paths.reduce((sum, p) => sum + p.stepCount, 0);
  const totalMinutes = paths.reduce((sum, p) => sum + (p.durationMinutes ?? 0), 0);
  const totalHours = Math.round(totalMinutes / 60);

  const seoPaths: LearningPathSeoInput[] = paths.map((p) => ({
    slug: p.slug,
    title: p.title,
    titleKm: p.title_km,
    description: p.description,
    descriptionKm: p.description_km,
    audience: p.audience,
    coverUrl: p.cover_url,
  }));

  const collectionSchema = pathsCollectionJsonLd({
    org: await getOrgIdentity(),
    locale,
    name: t("collectionName"),
    description: t("collectionDescription"),
    paths: seoPaths,
  });

  const heroStats = [
    { icon: <GraduationCap className="h-4 w-4" aria-hidden="true" />, value: pathTotal, label: t("statPaths") },
    { icon: <Layers className="h-4 w-4" aria-hidden="true" />, value: totalResources, label: t("statResources") },
    { icon: <Clock className="h-4 w-4" aria-hidden="true" />, value: totalHours, label: t("statHours") },
  ].filter((s) => s.value > 0);

  return (
    <div className="paths-page min-h-screen bg-bg-body">
      {paths.length > 0 && <JsonLd data={collectionSchema} />}
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8 md:py-10">
        {/* ── Hero ──
            Everything here is server-rendered: the figure's motion is CSS, and
            the stats come from data already fetched above, so the hero adds no
            client JS and no extra round-trip to an ISR page.

            It is deliberately SHORT. This is a listing page, and the hero's
            job is to say what a learning path is to someone who has never seen
            one — not to occupy the first screen. Two changes carry that:

            • The figure column is capped at 380px instead of taking a near-even
              split with the copy. It is decorative-but-explanatory, and it was
              claiming as much width as the sentence that actually explains the
              page.

            • The "Explore paths" jump link is gone. A listing page needing a
              button to reach its own listing is a symptom of a hero that is
              too tall, and the cure is the hero, not another control. The
              `#paths-catalogue` anchor stays for inbound deep links. */}
        <header className="mb-8 border-b border-divider pb-7">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-12">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/8 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-brand">
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
                {t("eyebrow")}
              </span>

              <h1 className="mt-4 font-khmer-serif text-[clamp(26px,4.2vw,38px)] font-bold leading-[1.18] text-text-heading">
                {t("h1")}
              </h1>

              <p className="mt-3 max-w-[58ch] text-[15.5px] leading-[1.7] text-text-body">
                {t("heroValueProp")}
              </p>
            </div>

            {/* Hidden below lg rather than stacked: on a phone it would push
                the catalogue an entire screen down for no added meaning. */}
            <div className="hidden lg:block">
              <PathJourneyVisual />
            </div>
          </div>

          {/* Collection figures as one divided strip rather than three bordered
              tiles. Boxing each number made them read as three controls to
              press; unboxed and baseline-aligned they read as one sentence
              about the collection's size, which is what they are. */}
          {heroStats.length > 0 && (
            <ul className="mt-7 flex list-none flex-wrap items-center gap-x-7 gap-y-3">
              {heroStats.map((s) => (
                <li key={s.label} className="inline-flex items-baseline gap-2">
                  <span className="translate-y-[2px] text-brand" aria-hidden="true">
                    {s.icon}
                  </span>
                  <span className="text-[20px] font-bold leading-none tabular-nums text-text-heading">
                    {s.value.toLocaleString()}
                  </span>
                  <span className="text-[12.5px] leading-none text-text-muted">{s.label}</span>
                </li>
              ))}
            </ul>
          )}
        </header>

        {paths.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 text-text-muted/40" aria-hidden="true" />
            <p className="text-[14px] font-semibold text-text-heading">{t("emptyTitle")}</p>
            <p className="mt-1 text-[12.5px] text-text-muted">{t("emptyHint")}</p>
          </div>
        ) : (
          <div id="paths-catalogue" className="scroll-mt-24">
            <Suspense fallback={<CatalogueSkeleton />}>
              <PathsExplorer paths={paths} featured={featured} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shaped like what actually arrives: the goal pills, then the one filter bar,
 * then the grid. It must not reserve a "Continue learning" panel — that band
 * only exists for a signed-in learner, and the explorer decides whether to
 * show it from a device-local hint.
 */
function CatalogueSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-5 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="paths-skeleton h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="paths-skeleton mb-5 h-[68px] w-full rounded-2xl lg:h-[60px]" />
      <div className="paths-skeleton mb-4 h-4 w-40 rounded" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PathCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
