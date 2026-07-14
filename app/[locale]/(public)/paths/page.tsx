import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { GraduationCap, Layers, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getPublishedPaths } from "@/app/actions/learning-paths";
import JsonLd from "@/components/seo/JsonLd";
import {
  buildPathsListingMetadata,
  pathsCollectionJsonLd,
  pathLocalizedTitle,
  pathLocalizedDescription,
  type LearningPathSeoInput,
} from "@/lib/seo/learning-path-seo";

// This page takes no searchParams and reads no cookies — it was force-dynamic
// for no reason, paying a function invocation per visit to render identical
// markup. Learning paths change rarely; getPublishedPaths() is tagged "paths"
// and invalidated by the admin mutations, so an hour of staleness is a ceiling,
// not a delay.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "paths" });
  return buildPathsListingMetadata(locale, {
    title: t("seoTitle"),
    description: t("seoDescription"),
  });
}

export default async function LearningPathsPage() {
  const [paths, locale, t] = await Promise.all([
    getPublishedPaths(),
    getLocale(),
    getTranslations("paths"),
  ]);

  // Adapt summaries to the SEO input shape (modules aren't needed on the listing).
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
    locale,
    name: t("collectionName"),
    description: t("collectionDescription"),
    paths: seoPaths,
  });

  return (
    <div className="min-h-screen bg-bg-body">
      {paths.length > 0 && <JsonLd data={collectionSchema} />}
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-10 md:py-12">
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
            <GraduationCap className="h-3.5 w-3.5" />
            {t("eyebrow")}
          </span>
          <h1 className="mt-3 font-khmer-serif text-[clamp(24px,4vw,36px)] font-bold leading-[1.2] text-text-heading">
            {t("h1")}
          </h1>
          <p className="mt-2 max-w-[65ch] text-[15px] text-text-muted">{t("intro")}</p>
        </div>

        {paths.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
            <p className="text-[14px] font-semibold text-text-muted">{t("emptyTitle")}</p>
            <p className="mt-1 text-[12.5px] text-text-muted">{t("emptyHint")}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {paths.map((p, i) => {
              const title = pathLocalizedTitle(seoPaths[i], locale);
              const description = pathLocalizedDescription(seoPaths[i], locale);
              return (
                <Link
                  key={p.id}
                  href={`/paths/${p.slug}`}
                  className="group flex flex-col rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm transition-all hover:border-brand/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {p.audience && (
                        <span className="mb-1.5 inline-block rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
                          {p.audience}
                        </span>
                      )}
                      <h2 className="text-[17px] font-bold leading-snug text-text-heading">{title}</h2>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-text-muted/50 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                  {description && (
                    <p className="mt-2 line-clamp-2 text-[13.5px] text-text-muted">{description}</p>
                  )}
                  <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
                    <Layers className="h-3.5 w-3.5" />
                    {t("steps", { count: p.stepCount })}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
