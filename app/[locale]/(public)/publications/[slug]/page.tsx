import { Suspense, cache } from "react";
import { decodeSlugParam } from "@/lib/slug";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import { getPublicationBySlug } from "@/app/actions/publications";
import type { PublicationAffiliation } from "@/lib/publications";
import { toCitationLine, citationYear, authorList } from "@/lib/citations";
import PublicationViewPing from "@/components/ui/publications/PublicationViewPing";
import PublicationHero from "@/components/ui/publications/PublicationHero";
import PublicationSidebar from "@/components/ui/publications/PublicationSidebar";
import PDFPreviewSection from "@/components/ui/publications/PDFPreviewSection";
import ReferencesSection from "@/components/ui/publications/ReferencesSection";
import RelatedPublications from "@/components/ui/publications/RelatedPublications";
import MoreFromJournal from "@/components/ui/publications/MoreFromJournal";
import MoreFromAuthor from "@/components/ui/publications/MoreFromAuthor";
import TableOfContentsSection from "@/components/ui/publications/TableOfContentsSection";
import LearningOutcomesSection from "@/components/ui/publications/LearningOutcomesSection";
import AuthorBiosSection from "@/components/ui/publications/AuthorBiosSection";
import PublicationFAQ from "@/components/ui/publications/PublicationFAQ";
import SimilarBooks from "@/components/ui/publications/SimilarBooks";
import PublicationReviewsSection from "@/components/ui/publications/PublicationReviewsSection";
import { getPublicationRatingStats } from "@/app/actions/publication-reviews";
import PublicationAbstractSection from "@/components/ui/publications/PublicationAbstractSection";
import {
  academicTextToPlainText,
  collectCitationOccurrences,
} from "@/lib/publications/citations";
import KeywordList from "@/components/ui/detail/KeywordList";
import ReadingProgress from "@/components/ui/detail/ReadingProgress";
import SectionQuickNav, { type QuickNavSection } from "@/components/ui/detail/SectionQuickNav";
import Icon from "@/components/ui/core/Icon";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { publicationScholarMeta } from "@/lib/seo/citation";
import {
  buildPublicationMetadata,
  publicationJsonLd,
  type PublicationSeoInput,
} from "@/lib/seo/publication-seo";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { SITE_URL } from "@/lib/seo/site";
import { Pencil } from "lucide-react";

/** Adapt a Publication row into the typed, browser-safe SEO input. */
function toPublicationSeoInput(pub: import("@/lib/publications").Publication): PublicationSeoInput {
  return {
    slug: pub.slug,
    title: pub.title,
    titleKm: pub.title_km,
    abstractText: academicTextToPlainText(pub.abstract, pub.references),
    authors: authorList(pub),
    journalName: pub.journal_name,
    volume: pub.volume,
    issue: pub.issue_no,
    pageStart: pub.page_start,
    pageEnd: pub.page_end,
    doi: pub.doi,
    issn: pub.issn,
    // The article's OWN date — never the repository import timestamp (created_at).
    publicationDate: pub.publication_date ?? pub.published_at,
    keywords: pub.keywords,
    subjects: pub.subjects,
    publisher: pub.publisher,
    license: pub.license,
    copyright: pub.copyright,
    language: pub.language,
    coverUrl: pub.cover_url,
  };
}

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

// generateMetadata and the page render both need the publication;
// React cache() collapses them into one query per request.
const getPublicationOnce = cache(getPublicationBySlug);

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const { data: pub } = await getPublicationOnce(slug);

  if (!pub) {
    return { title: "Publication not found" };
  }

  // Typed, localized metadata (validated identifiers, Khmer-aware). Google
  // Scholar citation_* tags are merged in via `other`.
  const base = buildPublicationMetadata(toPublicationSeoInput(pub), locale);
  return { ...base, other: publicationScholarMeta(pub) };
}

export default async function PublicationDetailPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const { data: pub, error } = await getPublicationOnce(slug);

  if (error || !pub) {
    notFound();
  }

  const t = await getTranslations("publicationDetail");
  const supabase = await createClient();

  const authorships = pub.authorships ?? [];
  const affiliationIds = [...new Set(authorships.flatMap((a) => a.affiliation_ids))];

  // Admin check, affiliations and rating stats are independent — run them
  // concurrently instead of stacking three sequential DB round-trips.
  const [isAdmin, affiliations, ratingStats] = await Promise.all([
    // Admin-only edit link — best-effort, non-blocking
    (async () => {
      try {
        const user = await getSessionUser();
        if (!user) return false;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        return ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);
      } catch {
        return false; // non-fatal
      }
    })(),
    // ── Affiliations for superscript markers ────────────────────────────
    (async (): Promise<PublicationAffiliation[]> => {
      if (affiliationIds.length === 0) return [];
      const { data: affRows } = await supabase
        .from("publication_affiliations")
        .select("id, name, name_km, city, country")
        .in("id", affiliationIds);
      return (affRows ?? []) as PublicationAffiliation[];
    })(),
    getPublicationRatingStats(pub.id),
  ]);

  // Stable superscript numbering: order of first appearance in the byline
  const markerFor = new Map<string, number>();
  for (const a of authorships) {
    for (const affId of a.affiliation_ids) {
      if (!markerFor.has(affId)) markerFor.set(affId, markerFor.size + 1);
    }
  }
  const orderedAffiliations = [...markerFor.entries()]
    .map(([id, marker]) => ({ marker, affiliation: affiliations.find((x) => x.id === id) }))
    .filter((x): x is { marker: number; affiliation: PublicationAffiliation } => !!x.affiliation);
  const correspondingAuthors = authorships.filter((a) => a.is_corresponding);
  const primaryAuthor = authorships[0]?.author ?? null;
  const citationLine = toCitationLine(pub);
  const publishedOn = formatDate(pub.publication_date ?? pub.published_at);
  const fileHref = `/api/publications/${slug}/file`;
  const shareUrl = `${SITE_URL}/publications/${slug}`;
  const year = citationYear(pub);

  // Inline-citation anchors rendered inside the abstracts, used by the
  // References section to link each entry back into the text.
  const citationOccurrences = collectCitationOccurrences(
    [
      { id: "abstract-en", text: pub.abstract },
      { id: "abstract-km", text: pub.abstract_km },
    ],
    pub.references,
  );

  const sections: QuickNavSection[] = [
    { id: "overview", label: t("sectionOverview") },
    { id: "abstract", label: t("sectionAbstract") },
    ...(pub.table_of_contents.length > 0 ? [{ id: "toc", label: t("sectionToc") }] : []),
    ...(pub.learning_outcomes.length > 0 ? [{ id: "outcomes", label: t("sectionOutcomes") }] : []),
    ...(pub.pdf_url ? [{ id: "fulltext", label: t("sectionFullText") }] : []),
    { id: "references", label: t("sectionReferences") },
    ...(authorships.length > 0 ? [{ id: "authors", label: t("sectionAuthors") }] : []),
    { id: "reviews", label: t("sectionReviews") },
    ...(pub.faqs.length > 0 ? [{ id: "faq", label: t("sectionFaq") }] : []),
    { id: "cite-panel", label: t("sectionCitation"), track: false },
    { id: "related", label: t("sectionRelated") },
  ];

  // ── JSON-LD (ScholarlyArticle) ────────────────────────────────────────────
  // Validated identifiers, verified-license-only, locale-correct URLs, and no
  // "Unknown Author" fabrication — see lib/seo/publication-seo.ts.
  const scholarlyArticleSchema = publicationJsonLd(
    toPublicationSeoInput(pub),
    locale,
    ratingStats.count > 0
      ? { ratingValue: ratingStats.average, reviewCount: ratingStats.count }
      : null,
  );

  const faqSchema =
    pub.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: pub.faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  const pubBreadcrumbSchema = breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Publications", path: "/publications" },
    { name: pub.title },
  ]);

  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={scholarlyArticleSchema} />
      <JsonLd data={pubBreadcrumbSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}
      <PublicationViewPing id={pub.id} />
      <ReadingProgress />
      <div className="mx-auto max-w-[1200px]">
        {/* ── Breadcrumb + admin ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1.5 overflow-hidden text-[13px] font-medium text-text-muted sm:gap-2 sm:text-[14.5px]"
          >
            <Link href="/" className="transition-colors hover:text-brand">{t("breadcrumbHome")}</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <Link href="/publications" className="transition-colors hover:text-brand">{t("breadcrumbPublications")}</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <span className="max-w-[200px] truncate font-semibold text-text-heading sm:max-w-[340px]" title={pub.title}>
              {pub.title}
            </span>
          </nav>
          {isAdmin && (
            <NextLink
              href={`/admin/publications/edit/${pub.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-brand hover:text-brand"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("editPublication")}
            </NextLink>
          )}
        </div>

        {/* ── Hero ── */}
        <PublicationHero
          pub={pub}
          authorships={authorships}
          markerFor={markerFor}
          orderedAffiliations={orderedAffiliations}
          correspondingAuthors={correspondingAuthors}
          citationLine={citationLine}
          publishedOn={publishedOn}
          fileHref={fileHref}
          shareUrl={shareUrl}
        />

        {/* ── Sticky section nav ── */}
        <SectionQuickNav sections={sections} />

        {/* ── Body: stacked sections + sidebar ── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-10">
            <section id="overview" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="overview-heading">
              <h2 id="overview-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                {t("sectionOverview")}
              </h2>
              {pub.subjects.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-[13px] font-semibold text-text-body">{t("subjectsHeading")}</h3>
                  <div className="flex flex-wrap gap-2">
                    {pub.subjects.map((subject) => (
                      <span
                        key={subject}
                        className="inline-flex items-center rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[12.5px] font-medium text-brand"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {pub.keywords.length > 0 ? (
                <KeywordList keywords={pub.keywords} basePath="/publications" heading={t("researchAreasKeywords")} />
              ) : pub.subjects.length === 0 ? (
                <p className="text-[13.5px] text-text-muted">{t("noKeywordsProvided")}</p>
              ) : null}
            </section>

            <section id="abstract" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="abstract-heading">
              <PublicationAbstractSection
                abstract={pub.abstract || ""}
                abstractKm={pub.abstract_km}
                references={pub.references}
                heading={t("sectionAbstract")}
                publicationTitle={locale === "km" && pub.title_km ? pub.title_km : pub.title}
                locale={locale}
              />
            </section>

            {pub.table_of_contents.length > 0 && (
              <section id="toc" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="toc-heading">
                <h2 id="toc-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionToc")}
                </h2>
                <TableOfContentsSection entries={pub.table_of_contents} />
              </section>
            )}

            {pub.learning_outcomes.length > 0 && (
              <section id="outcomes" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="outcomes-heading">
                <h2 id="outcomes-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionOutcomes")}
                </h2>
                <LearningOutcomesSection outcomes={pub.learning_outcomes} intro={t("outcomesIntro")} />
              </section>
            )}

            <section id="fulltext" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="fulltext-heading">
              <h2 id="fulltext-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                {t("sectionFullText")}
              </h2>
              <PDFPreviewSection
                title={pub.title}
                pdfUrl={fileHref}
                fileHref={fileHref}
                publicationId={pub.id}
                hasFile={!!pub.pdf_url}
              />
            </section>

            <section id="references" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="references-heading">
              <h2 id="references-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                {t("sectionReferences")}
                {pub.references.length > 0 && (
                  <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-brand">
                    {pub.references.length}
                  </span>
                )}
              </h2>
              <ReferencesSection references={pub.references} occurrences={citationOccurrences} />
            </section>

            {authorships.length > 0 && (
              <section id="authors" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="authors-heading">
                <h2 id="authors-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionAuthors")}
                </h2>
                <AuthorBiosSection authorships={authorships} affiliations={affiliations} />
              </section>
            )}

            <section id="reviews" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="reviews-heading">
              <h2 id="reviews-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                {t("sectionReviews")}
                {ratingStats.count > 0 && (
                  <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-brand">
                    {ratingStats.average.toFixed(1)} ★ · {ratingStats.count}
                  </span>
                )}
              </h2>
              <Suspense
                fallback={
                  <div className="h-48 animate-pulse rounded-2xl border border-divider bg-bg-surface" />
                }
              >
                <PublicationReviewsSection publicationId={pub.id} slug={slug} />
              </Suspense>
            </section>

            {pub.faqs.length > 0 && (
              <section id="faq" className="scroll-mt-20 lg:scroll-mt-32" aria-labelledby="faq-heading">
                <h2 id="faq-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionFaq")}
                </h2>
                <PublicationFAQ faqs={pub.faqs} />
              </section>
            )}
          </div>

          {/* Sidebar */}
          <PublicationSidebar pub={pub} fileHref={fileHref} shareUrl={shareUrl} publishedOn={publishedOn} year={year} />
        </div>

        {/* ── More from this journal ── */}
        <MoreFromJournal currentId={pub.id} journalName={pub.journal_name} />

        {/* ── More from this author ── */}
        {primaryAuthor && <MoreFromAuthor currentId={pub.id} author={primaryAuthor} />}

        {/* ── Related publications ── */}
        <RelatedPublications
          currentId={pub.id}
          journalName={pub.journal_name}
          keywords={pub.keywords}
          firstAuthorId={primaryAuthor?.id ?? null}
        />

        {/* ── Similar books / recommended reading from the library ── */}
        <SimilarBooks keywords={pub.keywords} subjects={pub.subjects} />
      </div>
    </section>
  );
}
