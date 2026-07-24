import type { Metadata } from "next";
import { decodeSlugParam } from "@/lib/slug";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { notFound } from "next/navigation";
import { GraduationCap, Layers, Clock, BookMarked, Signal, CheckCircle2, ListChecks, Globe } from "lucide-react";
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
  if (!path) return {};
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

  // Recommendations: other published paths, same audience first, max 3.
  const recommendations = allPaths
    .filter((p) => p.id !== path.id)
    .sort((a, b) => Number(b.audience === path.audience) - Number(a.audience === path.audience) || a.position - b.position)
    .slice(0, 3);

  const pathBreadcrumb = breadcrumbSchema([
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbPaths"), path: "/paths" },
    { name: title },
  ]);
  const courseSchema = pathCourseJsonLd(seoInput, locale, await getOrgIdentity());

  return (
    <div className="min-h-screen bg-bg-body">
      <JsonLd data={pathBreadcrumb} />
      <JsonLd data={courseSchema} />
      <div className="mx-auto max-w-[920px] px-4 py-8 md:px-10 md:py-12">
        {/* ── Breadcrumb ── */}
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-muted">
          <Link href="/" className="hover:text-brand">{t("breadcrumbHome")}</Link>
          <span aria-hidden="true">/</span>
          <Link href="/paths" className="hover:text-brand">{t("breadcrumbPaths")}</Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-text-heading">{title}</span>
        </nav>

        {/* ── Hero ── */}
        <header className="gradient-top-border overflow-hidden rounded-[28px] border border-divider bg-bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {path.cover_url && (
              <div className="mx-auto w-[150px] shrink-0 sm:mx-0">
                <div className="overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-md">
                  <div className="relative aspect-[3/4] w-full">
                    <Image src={path.cover_url} alt="" fill sizes="150px" className="object-cover" />
                  </div>
                </div>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {path.audience && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                    <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                    {path.audience}
                  </span>
                )}
                {path.difficulty && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-paper px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                    <Signal className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`difficulty.${path.difficulty}`)}
                  </span>
                )}
                {path.language && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-paper px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`language.${path.language}`)}
                  </span>
                )}
              </div>

              <h1 className="mt-3 font-khmer-serif text-[clamp(22px,4vw,32px)] font-bold leading-[1.2] text-text-heading">
                {title}
              </h1>
              {description && <p className="mt-2 text-[14.5px] leading-relaxed text-text-muted">{description}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] font-semibold text-text-muted">
                <span className="inline-flex items-center gap-1.5"><BookMarked className="h-3.5 w-3.5" aria-hidden="true" />{t("modules", { count: path.moduleCount })}</span>
                <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" aria-hidden="true" />{t("steps", { count: path.stepCount })}</span>
                {duration && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{t("durationTotal", { duration })}</span>}
              </div>

              {/* Prerequisites */}
              {path.prerequisites.length > 0 && (
                <div className="mt-5">
                  <h2 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-text-muted">
                    <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("prerequisitesHeading")}
                  </h2>
                  <ul className="space-y-1">
                    {path.prerequisites.map((p, i) => {
                      const text = (locale === "km" && p.km) || p.en || p.km;
                      return <li key={i} className="text-[13px] text-text-body">• {text}</li>;
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Learning outcomes */}
          {path.outcomes.length > 0 && (
            <div className="mt-6 rounded-2xl border border-divider bg-paper/40 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-text-muted">
                <CheckCircle2 className="h-4 w-4 text-brand" aria-hidden="true" />
                {t("outcomesHeading")}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {path.outcomes.map((o, i) => {
                  const text = (locale === "km" && o.km) || o.en || o.km;
                  return (
                    <li key={i} className="flex items-start gap-2 text-[13.5px] text-text-body">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      <span>{text}</span>
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
