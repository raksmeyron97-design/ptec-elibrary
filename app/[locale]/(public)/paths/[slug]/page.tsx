import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { notFound } from "next/navigation";
import { GraduationCap, Layers, Clock, ExternalLink, BookOpen, ScrollText, Library } from "lucide-react";
import { getPathBySlug, getUserPathProgress } from "@/app/actions/learning-paths";
import { createClient } from "@/lib/supabase/server";
import EnrollButton from "@/components/ui/paths/EnrollButton";
import StepCheckbox from "@/components/ui/paths/StepCheckbox";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL, PTEC_NAME, PTEC_LIBRARY_NAME } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import type { StepResourceType } from "@/app/actions/learning-paths";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const path = await getPathBySlug(slug);
  if (!path) return {};

  const description = path.description ?? `A curated learning path from ${PTEC_LIBRARY_NAME}.`;
  const alternates = localeAlternates(`/paths/${slug}`, locale);
  const canonicalUrl = alternates.canonical;

  return {
    title: path.title,
    description,
    alternates,
    openGraph: {
      title: path.title,
      description,
      type: "article",
      url: canonicalUrl,
      siteName: PTEC_LIBRARY_NAME,
      images: path.cover_url ? [{ url: path.cover_url, alt: path.title }] : [],
    },
  };
}

const RESOURCE_ICON: Record<StepResourceType, typeof BookOpen> = {
  book: BookOpen,
  research: GraduationCap,
  catalog: Library,
  external: ExternalLink,
};

export default async function LearningPathDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const path = await getPathBySlug(slug);
  if (!path) notFound();

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const isLoggedIn = !!user;

  const progress = await getUserPathProgress(path.id);
  const completedSet = new Set(progress.completedStepIds);
  const progressPct = path.stepCount > 0 ? Math.round((completedSet.size / path.stepCount) * 100) : 0;

  const pathBreadcrumb = breadcrumbSchema([
    { name: "Home", path: "/home" },
    { name: "Learning Paths", path: "/paths" },
    { name: path.title },
  ]);

  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: path.title,
    description: path.description ?? undefined,
    provider: { "@type": "EducationalOrganization", name: PTEC_NAME, sameAs: SITE_URL },
    url: `${SITE_URL}/paths/${slug}`,
  };

  return (
    <div className="min-h-screen bg-bg-body">
      <JsonLd data={pathBreadcrumb} />
      <JsonLd data={courseSchema} />
      <div className="mx-auto max-w-[900px] px-4 py-8 md:px-10 md:py-12">
        {/* ── Breadcrumb ── */}
        <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-[13px] font-medium text-text-muted">
          <Link href="/home" className="hover:text-brand">Home</Link>
          <span>/</span>
          <Link href="/paths" className="hover:text-brand">Learning Paths</Link>
        </nav>

        {/* ── Hero ── */}
        <header className="gradient-top-border overflow-hidden rounded-[28px] border border-divider bg-bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {path.cover_url && (
              <div className="mx-auto w-[140px] shrink-0 sm:mx-0">
                <div className="overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-md">
                  <div className="relative aspect-[3/4] w-full">
                    <Image src={path.cover_url} alt={path.title} fill sizes="140px" className="object-cover" />
                  </div>
                </div>
              </div>
            )}
            <div className="min-w-0 flex-1">
              {path.audience && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {path.audience}
                </span>
              )}
              <h1 className="mt-3 font-khmer-serif text-[clamp(22px,4vw,32px)] font-bold leading-[1.25] text-text-heading">
                {path.title}
              </h1>
              {path.description && (
                <p className="mt-2 text-[14.5px] leading-relaxed text-text-muted">{path.description}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted">
                  <Layers className="h-3.5 w-3.5" />
                  {path.modules.length} {path.modules.length === 1 ? "module" : "modules"} · {path.stepCount} {path.stepCount === 1 ? "step" : "steps"}
                </span>
              </div>

              {progress.enrolled && (
                <div className="mt-4 max-w-xs">
                  <div className="mb-1 flex items-center justify-between text-[11.5px] font-semibold text-text-muted">
                    <span>Your progress</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}

              <div className="mt-5">
                <EnrollButton pathId={path.id} pathSlug={path.slug} initialEnrolled={progress.enrolled} isLoggedIn={isLoggedIn} />
              </div>
            </div>
          </div>
        </header>

        {/* ── Modules ── */}
        <div className="mt-8 space-y-6">
          {path.modules.map((mod, mi) => (
            <section key={mod.id} className="rounded-2xl border border-divider bg-bg-surface p-5 sm:p-6">
              <h2 className="mb-4 flex items-center gap-2.5 text-[16px] font-bold text-text-heading">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[13px] font-bold text-brand">
                  {mi + 1}
                </span>
                {mod.title}
              </h2>

              <ol className="space-y-3">
                {mod.steps.map((step) => {
                  const Icon = RESOURCE_ICON[step.resource_type];
                  const title = step.resource_title ?? "Resource unavailable";
                  const isCompleted = completedSet.has(step.id);

                  return (
                    <li
                      key={step.id}
                      className="flex items-start gap-3 rounded-xl border border-divider bg-paper/60 p-3.5 sm:p-4"
                    >
                      <div className="pt-0.5">
                        <StepCheckbox
                          stepId={step.id}
                          pathId={path.id}
                          pathSlug={path.slug}
                          initialCompleted={isCompleted}
                          isLoggedIn={isLoggedIn}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                          <Icon className="h-3.5 w-3.5" />
                          {step.resource_type === "external" ? "Link" : step.resource_type === "research" ? "Thesis" : step.resource_type === "catalog" ? "Physical Copy" : "E-Book"}
                          {step.est_minutes && (
                            <span className="ml-1 inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {step.est_minutes} min
                            </span>
                          )}
                        </div>
                        {step.url ? (
                          <Link
                            href={step.url}
                            target={step.resource_type === "external" ? "_blank" : undefined}
                            rel={step.resource_type === "external" ? "noopener noreferrer" : undefined}
                            className={`mt-0.5 block text-[14.5px] font-semibold leading-snug hover:text-brand hover:underline ${isCompleted ? "text-text-muted line-through" : "text-text-heading"}`}
                          >
                            {title}
                          </Link>
                        ) : (
                          <p className={`mt-0.5 text-[14.5px] font-semibold leading-snug ${isCompleted ? "text-text-muted line-through" : "text-text-heading"}`}>
                            {title}
                          </p>
                        )}
                        {step.instruction && (
                          <p className="mt-1 text-[13px] text-text-muted">{step.instruction}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>

        {path.modules.length === 0 && (
          <div className="mt-8 rounded-2xl border border-divider bg-bg-surface py-16 text-center">
            <ScrollText className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
            <p className="text-[14px] font-semibold text-text-muted">This path has no content yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
