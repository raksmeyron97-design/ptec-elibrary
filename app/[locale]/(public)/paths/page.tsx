import type { Metadata } from "next";
import { Suspense } from "react";
import { GraduationCap, Layers, Clock, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getPublishedPaths, getFeaturedPath, getPathBySlug } from "@/app/actions/learning-paths";
import { getCollectionStats } from "@/lib/collection-stats";
import JsonLd from "@/components/seo/JsonLd";
import PathsExplorer from "./_components/PathsExplorer";
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
    <div className="min-h-screen bg-bg-body">
      {paths.length > 0 && <JsonLd data={collectionSchema} />}
      <div className="mx-auto max-w-[1180px] px-4 py-8 md:px-8 md:py-10">
        {/* ── Compact hero ── */}
        <header className="mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
            {t("eyebrow")}
          </span>
          <h1 className="mt-3 font-khmer-serif text-[clamp(24px,4vw,38px)] font-bold leading-[1.15] text-text-heading">
            {t("h1")}
          </h1>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-text-muted">{t("intro")}</p>

          {paths.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-semibold text-text-muted">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <GraduationCap className="h-4 w-4 text-brand" aria-hidden="true" />
                {t("pathCount", { count: pathTotal })}
              </span>
              {totalResources > 0 && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Layers className="h-4 w-4 text-brand" aria-hidden="true" />
                  {t("resourceCount", { count: totalResources })}
                </span>
              )}
              {totalHours > 0 && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Clock className="h-4 w-4 text-brand" aria-hidden="true" />
                  {t("hoursCount", { count: totalHours })}
                </span>
              )}
            </div>
          )}

          {paths.length > 0 && (
            <div className="mt-5">
              <a
                href="#paths-catalogue"
                className="inline-flex items-center gap-2 rounded-xl border border-brand/25 bg-brand/8 px-4 py-2.5 text-[14px] font-bold text-brand transition hover:bg-brand/12"
              >
                {t("explore")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </header>

        {paths.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 text-text-muted/40" aria-hidden="true" />
            <p className="text-[14px] font-semibold text-text-heading">{t("emptyTitle")}</p>
            <p className="mt-1 text-[12.5px] text-text-muted">{t("emptyHint")}</p>
          </div>
        ) : (
          <div id="paths-catalogue" className="scroll-mt-6">
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
      <div className="mb-5 h-11 w-full animate-pulse rounded-xl bg-bg-surface" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[320px] animate-pulse rounded-2xl border border-divider bg-bg-surface" />
        ))}
      </div>
    </div>
  );
}
