// components/ui/home/ThisWeekAtPtec.tsx
// One editorial band replacing the old "Featured Publications" + "Featured This
// Week" sections (which repeated the browse grid). Four differentiated content
// types, chosen deterministically from existing data:
//   • Editor's pick — most-viewed book NOT already in the hero stack
//   • New publication — latest journal article
//   • Learning path — the top published path
//   • Latest news — newest published post
// Any type with no data is simply omitted; the whole section hides only when
// nothing at all is available.
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { BookMarked, FileText, Route, Newspaper, ArrowRight, type LucideIcon } from "lucide-react";
import {
  getMostViewedBooksCached,
  getFeaturedPublicationsCached,
  getLatestPostCached,
} from "@/lib/home-data";
import type { LearningPathSummary } from "@/app/actions/learning-paths";

function hexOf(cover?: string | null) {
  return cover?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#1E3A8A";
}

function yearOf(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const y = new Date(dateStr).getFullYear();
  return Number.isFinite(y) ? String(y) : null;
}

// Type badge — icon + text label so content type never relies on colour alone.
function TypeBadge({
  Icon,
  label,
  tone,
  eyebrowClass,
}: {
  Icon: LucideIcon;
  label: string;
  tone: string;
  eyebrowClass: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold ${eyebrowClass} ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={2.1} />
      {label}
    </span>
  );
}

export default async function ThisWeekAtPtec({
  paths,
  excludeSlugs = [],
}: {
  paths: LearningPathSummary[];
  excludeSlugs?: string[];
}) {
  const [t, locale, viewed, pubs, post] = await Promise.all([
    getTranslations("home"),
    getLocale(),
    getMostViewedBooksCached(),
    getFeaturedPublicationsCached(),
    getLatestPostCached(),
  ]);

  const exclude = new Set(excludeSlugs);
  const pick = viewed.find((b) => !exclude.has(b.slug)) ?? viewed[0] ?? null;
  const publication = pubs[0] ?? null;
  const path = paths[0] ?? null;

  // Nothing to feature at all → don't render an empty titled section.
  if (!pick && !publication && !path && !post) return null;

  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
  const pubTitle = publication
    ? (locale === "km" && publication.title_km ? publication.title_km : publication.title)
    : null;
  const pubAbstract = publication
    ? (locale === "km" && publication.abstract_km ? publication.abstract_km : publication.abstract)
    : null;
  const pathTitle = path ? (locale === "km" && path.title_km ? path.title_km : path.title) : null;

  return (
    <section className="border-b border-divider/60 bg-bg-surface" aria-labelledby="this-week-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-gold-400 to-brand" aria-hidden />
              <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>{t("weekEyebrow")}</span>
            </div>
            <h2
              id="this-week-title"
              className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
              style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
            >
              {t("weekTitle")}
            </h2>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          {/* ── Editor's pick (lead, with cover) ── */}
          {pick && (
            <Link
              href={`/books/${pick.slug}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-divider bg-paper shadow-[0_2px_8px_rgba(11,21,53,0.06)] transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_12px_36px_rgba(11,21,53,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex-row lg:col-span-5 lg:flex-col"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-auto sm:w-[42%] lg:aspect-[16/9] lg:w-full">
                {pick.coverUrl ? (
                  <Image
                    src={pick.coverUrl}
                    alt={`Cover of ${pick.title}`}
                    fill
                    sizes="(max-width:1024px) 100vw, 460px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div
                    className="flex h-full w-full flex-col justify-end p-5"
                    style={{ background: `linear-gradient(135deg, ${hexOf(pick.cover)} 0%, ${hexOf(pick.cover)}bb 100%)` }}
                  >
                    <p className="line-clamp-3 font-khmer-serif text-[17px] font-bold leading-snug text-white">{pick.title}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <TypeBadge Icon={BookMarked} label={t("weekPick")} tone="text-brand" eyebrowClass={latinEyebrow} />
                <h3 className="mt-2.5 font-khmer-serif text-[18px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand line-clamp-2">
                  {pick.title}
                </h3>
                <p className="mt-1.5 text-[13px] font-medium text-text-muted line-clamp-1">{pick.author}</p>
                <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand">
                  {t("weekReadNow")}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </div>
            </Link>
          )}

          {/* ── Right column: publication / path / post ── */}
          <div className="flex flex-col gap-4 lg:col-span-7">
            {publication && (
              <Link
                href={`/publications/${publication.slug}`}
                className="group flex flex-col rounded-2xl border border-divider bg-paper p-5 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_8px_28px_-10px_rgba(11,21,53,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-6"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <TypeBadge Icon={FileText} label={t("weekPublication")} tone="text-accent-text" eyebrowClass={latinEyebrow} />
                  {publication.journal_name && (
                    <span className="text-[12px] font-medium text-text-muted">
                      {publication.journal_name}
                      {yearOf(publication.publication_date) && <> · {yearOf(publication.publication_date)}</>}
                    </span>
                  )}
                </div>
                <h3 className="mt-2.5 font-khmer-serif text-[16.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand line-clamp-2">
                  {pubTitle}
                </h3>
                {publication.author_names && (
                  <p className="mt-1 text-[12.5px] text-text-muted line-clamp-1">{publication.author_names}</p>
                )}
                {pubAbstract && (
                  <p className="mt-2 text-[13px] leading-relaxed text-text-body line-clamp-2">{pubAbstract}</p>
                )}
                <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
                  {t("weekReadArticle")}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {path && (
                <Link
                  href={`/paths/${path.slug}`}
                  className="group flex flex-col rounded-2xl border border-divider bg-paper p-5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_8px_28px_-10px_rgba(11,21,53,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <TypeBadge Icon={Route} label={t("weekPath")} tone="text-cyan-700 dark:text-cyan-300" eyebrowClass={latinEyebrow} />
                  <h3 className="mt-2.5 font-khmer-serif text-[15.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand line-clamp-2">
                    {pathTitle}
                  </h3>
                  {path.stepCount > 0 && (
                    <p className="mt-1 text-[12.5px] text-text-muted">
                      {path.stepCount} {locale === "km" ? "ជំហាន" : path.stepCount === 1 ? "step" : "steps"}
                    </p>
                  )}
                  <span className="mt-auto pt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
                    {t("weekOpenPath")}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              )}

              {post && (
                <Link
                  href={`/posts/${post.slug}`}
                  className="group flex flex-col rounded-2xl border border-divider bg-paper p-5 transition-all hover:-translate-y-0.5 hover:border-gold-400/50 hover:shadow-[0_8px_28px_-10px_rgba(11,21,53,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <TypeBadge Icon={Newspaper} label={t("weekPost")} tone="text-gold-700 dark:text-gold-300" eyebrowClass={latinEyebrow} />
                  <h3 className="mt-2.5 font-khmer-serif text-[15.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand line-clamp-2">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted line-clamp-2">{post.excerpt}</p>
                  )}
                  <span className="mt-auto pt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
                    {t("weekViewPost")}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
