import type { Metadata } from "next";
import { decodeSlugParam } from "@/lib/slug";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { notFound } from "next/navigation";
import { GraduationCap, Layers, Clock, BookMarked, Signal, CheckCircle2, ListChecks, Globe, ArrowLeft, Users } from "lucide-react";
import { getPathBySlug, getUserPathProgress, getPublishedPaths } from "@/app/actions/learning-paths";
import type { LearningPathDetail } from "@/app/actions/learning-paths";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import PathExperience from "../_components/PathExperience";
import PathCard from "../_components/PathCard";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import {
  buildPathMetadata,
  pathCourseJsonLd,
  pathLocalizedTitle,
  pathLocalizedDescription,
  type LearningPathSeoInput,
} from "@/lib/seo/learning-path-seo";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { deriveScope, scopeLabelKeys } from "@/lib/learning-paths/taxonomy";
import { Bilingual, LangText } from "@/components/ui/core/LangText";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string; locale: string }> };

/** Adapt a resolved path into the typed SEO input (localized + module-aware). */
function toPathSeoInput(path: LearningPathDetail): LearningPathSeoInput {
  return {
    slug: path.slug,
    title: path.title,
    titleKm: path.title_km,
    description: path.description,
    descriptionKm: path.description_km,
    audience: path.audience,
    coverUrl: path.cover_url,
    modules: path.modules.map((m) => ({
      title: m.title,
      titleKm: m.title_km,
      steps: m.steps.map((s) => ({ title: s.resource_title, url: s.url, estMinutes: s.est_minutes })),
    })),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const path = await getPathBySlug(slug);
  // The edge gate (RESOURCE_GATES.paths) turns an unknown slug into a real 404
  // before this runs, but it FAILS OPEN by design — a Supabase hiccup at the
  // edge lets the request through. Returning {} here inherited the layout's
  // indexable robots value, so the fail-open window served an indexable
  // soft-404. `noindex, follow` is what /subjects/[slug] already returns for
  // the same situation.
  if (!path) return { robots: { index: false, follow: true } };
  return buildPathMetadata(toPathSeoInput(path), locale, await getOrgIdentity());
}

function formatMinutes(total: number | null, t: Awaited<ReturnType<typeof getTranslations>>): string | null {
  if (!total || total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return t("durationHm", { h, m });
  if (h > 0) return t("durationH", { h });
  return t("durationM", { m });
}

export default async function LearningPathDetailPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const [path, t] = await Promise.all([getPathBySlug(slug), getTranslations("paths")]);
  if (!path) notFound();

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const isLoggedIn = !!user;

  const [progress, allPaths] = await Promise.all([
    getUserPathProgress(path.id),
    getPublishedPaths(),
  ]);

  const seoInput = toPathSeoInput(path);
  const title = pathLocalizedTitle(seoInput, locale);
  const description = pathLocalizedDescription(seoInput, locale);
  const duration = formatMinutes(path.durationMinutes, t);
  const scopeLabel = scopeLabelKeys(deriveScope(path)).map((k) => t(k)).join(" · ");

  // Recommendations: other published paths, same audience first, max 3.
  const recommendations = allPaths
    .filter((p) => p.id !== path.id)
    .sort((a, b) => Number(b.audience === path.audience) - Number(a.audience === path.audience) || a.position - b.position)
    .slice(0, 3);

  const pathBreadcrumb = breadcrumbSchema([
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbPaths"), path: "/paths" },
    { name: title },
  ], { locale });
  const courseSchema = pathCourseJsonLd(seoInput, locale, await getOrgIdentity());

  return (
    <div className="paths-page min-h-screen bg-bg-body">
      <JsonLd data={pathBreadcrumb} />
      <JsonLd data={courseSchema} />
      <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-12">
        {/* ── Breadcrumb ──
            On a phone the trail collapses to one "← Learning Paths" link: the
            third crumb is this page's own title, truncated, and a truncated
            heading is no help where a reader is choosing between paths. The
            full trail (and the BreadcrumbList JSON-LD) is unchanged from sm. */}
        <nav aria-label="Breadcrumb" className="mb-4 text-[13px] font-medium text-text-muted sm:mb-5">
          <Link
            href="/paths"
            className="inline-flex min-h-11 items-center gap-1.5 hover:text-brand sm:hidden"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToPaths")}
          </Link>
          <ol className="hidden flex-wrap items-center gap-1.5 sm:flex">
            <li><Link href="/" className="hover:text-brand">{t("breadcrumbHome")}</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/paths" className="hover:text-brand">{t("breadcrumbPaths")}</Link></li>
            <li aria-hidden="true">/</li>
            <li className="min-w-0 truncate text-text-heading" aria-current="page"><LangText text={title} locale={locale} /></li>
          </ol>
        </nav>

        {/* ── Hero ──
            Order is what a reader arriving from a shared link needs, in the
            order they need it: what this is (scope + title), how big it is
            (modules · steps · hours), what it says about itself, THEN the
            picture. The cover used to lead the phone screen as a 148×197
            portrait crop of a 16:9 artwork — cut straight through its own
            Khmer title — followed by three lines of uppercase audience string,
            and the first action was ~1,900px down. The primary action now
            docks along the bottom edge on phones (PathExperience). */}
        <header className="gradient-top-border overflow-hidden rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-8">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)] sm:items-start sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {scopeLabel && (
                  <span className="paths-eyebrow inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold text-brand">
                    <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                    {scopeLabel}
                  </span>
                )}
                {path.difficulty && (
                  <span className="paths-eyebrow inline-flex items-center gap-1.5 rounded-full border border-divider bg-paper px-3 py-1 text-[11px] font-bold text-text-body">
                    <Signal className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`difficulty.${path.difficulty}`)}
                  </span>
                )}
                {path.language && (
                  <span className="paths-eyebrow inline-flex items-center gap-1.5 rounded-full border border-divider bg-paper px-3 py-1 text-[11px] font-bold text-text-body">
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`language.${path.language}`)}
                  </span>
                )}
              </div>

              <h1 className="mt-3 font-khmer-serif text-[clamp(22px,4vw,32px)] font-bold leading-[1.3] text-text-heading">
                <LangText text={title} locale={locale} />
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] font-semibold text-text-body">
                <span className="inline-flex items-center gap-1.5"><BookMarked className="h-3.5 w-3.5" aria-hidden="true" />{t("modules", { count: path.moduleCount })}</span>
                <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" aria-hidden="true" />{t("steps", { count: path.stepCount })}</span>
                {duration && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{t("durationTotal", { duration })}</span>}
              </div>

              {description && (
                <LangText as="p" text={description} locale={locale} className="mt-3 text-[14.5px] leading-relaxed text-text-muted" />
              )}
            </div>

            {path.cover_url && (
              /* 16:9 like the artwork, requested at the width it is drawn. */
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-md">
                <Image
                  src={path.cover_url}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 300px, 420px"
                  className="object-cover"
                />
              </div>
            )}
          </div>

          {/* Who it's for — the audience string, in sentence case, each half in
              its own language. It used to be the eyebrow chip: uppercased,
              letter-spaced (which pulls Khmer subscripts off their bases) and
              wrapping to three lines above the title on a phone. */}
          {(path.audience || path.prerequisites.length > 0) && (
            <dl className="mt-5 grid gap-4 border-t border-divider pt-5 sm:grid-cols-2">
              {path.audience && (
                <div>
                  <dt className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-text-body">
                    <Users className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                    {t("whoItsFor")}
                  </dt>
                  <dd className="text-[13.5px] leading-relaxed text-text-body">
                    <Bilingual value={path.audience} locale={locale} separator={<br />} />
                  </dd>
                </div>
              )}
              {path.prerequisites.length > 0 && (
                <div>
                  <dt className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-text-body">
                    <ListChecks className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                    {t("prerequisitesHeading")}
                  </dt>
                  <dd>
                    <ul className="space-y-1">
                      {path.prerequisites.map((p, i) => {
                        const text = (locale === "km" && p.km) || p.en || p.km;
                        return (
                          <li key={i} className="text-[13.5px] leading-relaxed text-text-body">
                            • <LangText text={text} locale={locale} />
                          </li>
                        );
                      })}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          )}

          {/* Learning outcomes */}
          {path.outcomes.length > 0 && (
            <div className="mt-6 rounded-2xl border border-divider bg-paper/40 p-5">
              <h2 className="paths-eyebrow mb-3 flex items-center gap-2 text-[13px] font-bold text-text-body">
                <CheckCircle2 className="h-4 w-4 text-brand" aria-hidden="true" />
                {t("outcomesHeading")}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {path.outcomes.map((o, i) => {
                  const text = (locale === "km" && o.km) || o.en || o.km;
                  return (
                    <li key={i} className="flex items-start gap-2 text-[13.5px] text-text-body">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      <LangText text={text} locale={locale} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </header>

        {/* ── Curriculum + progress ── */}
        {path.modules.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-divider bg-bg-surface py-16 text-center">
            <Layers className="mx-auto mb-3 h-10 w-10 text-text-muted/40" aria-hidden="true" />
            <p className="text-[14px] font-semibold text-text-muted">{t("noContent")}</p>
          </div>
        ) : (
          <div className="mt-8">
            <PathExperience
              path={path}
              initialCompletedStepIds={progress.completedStepIds}
              initialEnrolled={progress.enrolled}
              isLoggedIn={isLoggedIn}
            />
          </div>
        )}

        {/* ── Recommendations ── */}
        {recommendations.length > 0 && (
          <section aria-labelledby="rec-heading" className="mt-12">
            <h2 id="rec-heading" className="mb-4 text-[16px] font-bold text-text-heading">{t("recommendedHeading")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recommendations.map((p) => (
                <PathCard key={p.id} path={p} progress={null} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
