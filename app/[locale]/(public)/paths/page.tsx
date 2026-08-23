import type { Metadata } from "next";
import { Suspense } from "react";
import { GraduationCap, Layers, Clock, ArrowRight } from "lucide-react";
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

  return (
    <div className="paths-page min-h-screen bg-bg-body">
      {paths.length > 0 && <JsonLd data={collectionSchema} />}
      <div className="mx-auto max-w-[1180px] px-4 py-8 md:px-8 md:py-10">
        {/* ── Hero ──
            Two columns on desktop, stacked on mobile. Everything here is
            server-rendered: the figure's motion is CSS, and the stats come
            from data already fetched above, so the hero adds no client JS and
            no extra round-trip to an ISR page. */}
        <header className="mb-10 border-b border-divider pb-9">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/8 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-brand">
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
                {t("eyebrow")}
              </span>

              <h1 className="mt-4 font-khmer-serif text-[clamp(27px,4.4vw,42px)] font-bold leading-[1.18] text-text-heading">
                {t("h1")}
              </h1>

              <p className="mt-3 max-w-[58ch] text-[15.5px] leading-[1.75] text-text-body">
                {t("heroValueProp")}
              </p>

              {paths.length > 0 && (
                <ul className="mt-6 flex list-none flex-wrap gap-2.5">
                  {[
                    { icon: <GraduationCap className="h-4 w-4" aria-hidden="true" />, value: pathTotal, label: t("statPaths") },
                    { icon: <Layers className="h-4 w-4" aria-hidden="true" />, value: totalResources, label: t("statResources") },
                    { icon: <Clock className="h-4 w-4" aria-hidden="true" />, value: totalHours, label: t("statHours") },
                  ]
                    .filter((s) => s.value > 0)
                    .map((s) => (
                      <li
                        key={s.label}
                        className="inline-flex items-center gap-2.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2.5 shadow-sm"
                      >
                        <span className="text-brand">{s.icon}</span>
                        <span className="text-[17px] font-bold tabular-nums leading-none text-text-heading">
                          {s.value.toLocaleString()}
                        </span>
                        <span className="text-[12.5px] leading-none text-text-muted">{s.label}</span>
                      </li>
                    ))}
                </ul>
              )}

              {paths.length > 0 && (
                <div className="mt-6">
                  <a
                    href="#paths-catalogue"
                    className="inline-flex items-center gap-2 rounded-xl border border-brand/25 bg-brand/8 px-4 py-2.5 text-[14px] font-bold text-brand transition hover:bg-brand/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-body"
                  >
                    {t("explore")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>

            {/* The figure is decorative-but-explanatory; it is hidden below lg
                rather than stacked, because on a phone it would push the
                catalogue an entire screen down for no added meaning. */}
            <div className="hidden lg:block">
              <PathJourneyVisual />
            </div>
          </div>
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

function CatalogueSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="paths-skeleton mb-4 h-12 w-full rounded-xl" />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="paths-skeleton h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PathCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
