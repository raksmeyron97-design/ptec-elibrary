// components/ui/home/TrendingResearch.tsx
// Homepage — ranked top-5 theses by real reader behavior (views + weighted
// downloads). A numbered <ol>, not a card grid: rank is the information, and
// usage numbers beside each row are the social proof (IEEE "most popular").
import { Link } from "@/i18n/navigation";
import { getTrendingThesesCached } from "@/lib/home-data";
import ResourceMetrics from "@/components/ui/core/ResourceMetrics";
import { getTranslations } from "next-intl/server";
import { HomeSection, SectionHeader, SectionMobileLink } from "./HomeSection";

const formatCount = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : String(n);

export default async function TrendingResearch() {
  const theses = await getTrendingThesesCached();
  // A "trending" list of one or two rows reads as emptiness, not popularity —
  // hide the section until there is a real ranking to show.
  if (theses.length < 3) return null;

  const t = await getTranslations("home");
  const viewAll = { href: "/theses", label: t("trendingResearchViewAll") };

  return (
    <HomeSection surface="surface" labelledBy="trending-research-title">
      <SectionHeader
        id="trending-research-title"
        tone="accent"
        eyebrow={t("trendingResearchEyebrow")}
        title={t("trendingResearchTitle")}
        action={viewAll}
      />

        {/* ── Ranked list ── */}
        <ol className="divide-y divide-divider rounded-2xl border border-divider bg-paper">
          {theses.map((thesis, i) => {
            const views = thesis.view_count ?? 0;
            const downloads = thesis.download_count ?? 0;
            return (
              <li key={thesis.id} className="relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-brand/[0.03] sm:gap-6 sm:px-7">
                {/* Ordinal */}
                <span
                  className="w-8 shrink-0 text-center font-serif text-[22px] font-bold text-brand/35 tabular-nums sm:text-[26px]"
                  aria-hidden
                >
                  {i + 1}
                </span>

                {/* Title + meta */}
                <div className="min-w-0 flex-1 py-0.5">
                  <h3 className="font-khmer-serif text-[15px] font-bold leading-snug text-text-heading line-clamp-2 sm:text-[16px]">
                    <Link
                      href={`/theses/${thesis.slug ?? thesis.id}`}
                      className="after:absolute after:inset-0 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
                    >
                      {thesis.title}
                    </Link>
                  </h3>
                  <p className="mt-1 text-[12.5px] text-text-muted line-clamp-1">
                    {[thesis.author_names, thesis.cohort].filter(Boolean).join(" · ")}
                  </p>
                </div>

                {/* Usage stats */}
                <ResourceMetrics
                  views={views}
                  downloads={downloads}
                  size="md"
                  className="hidden shrink-0 font-semibold sm:flex"
                />

                {/* Compact mobile stat */}
                <span
                  className="shrink-0 text-[12px] font-semibold text-text-muted tabular-nums sm:hidden"
                  title={t("trendingResearchViews", { count: views })}
                >
                  <span aria-hidden="true">
                    {formatCount(views)} {t("trendingResearchReads")}
                  </span>
                  <span className="sr-only">{t("trendingResearchViews", { count: views })}</span>
                </span>
              </li>
            );
          })}
        </ol>

      <SectionMobileLink {...viewAll} />
    </HomeSection>
  );
}
