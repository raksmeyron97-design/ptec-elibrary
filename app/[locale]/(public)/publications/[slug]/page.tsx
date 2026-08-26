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
import ContentLanguageNotice from "@/components/ui/publications/ContentLanguageNotice";
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
import { getRelatedPublications, getLibraryFallbackBooks } from "@/lib/publications/related";
import { publicationMetrics } from "@/lib/publications/integrity";
import { reviewsEnabled, aggregateRatingAllowed } from "@/lib/reviews/policy";
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
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";

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
  const base = buildPublicationMetadata(
    toPublicationSeoInput(pub),
    locale,
    { seoTitle: pub.seo_title, seoDescription: pub.seo_description, ogImage: pub.og_image },
    await getOrgIdentity(),
  );
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

  // Reader reviews are disabled for publications (lib/reviews/policy.ts), so
  // the rating query is skipped entirely rather than fetched and discarded.
  const showReviews = reviewsEnabled("publication");

  // Admin check, affiliations, rating stats and related content are all
  // independent — run them concurrently instead of stacking round-trips.
  const [isAdmin, affiliations, ratingStats, relatedItems, libraryBooks] = await Promise.all([
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
    showReviews
      ? getPublicationRatingStats(pub.id)
      : Promise.resolve({ average: 0, count: 0 }),
    // Fetched here, not inside the rendering components: the page has to know
    // whether the "Keep reading" region will have content BEFORE it emits a
    // nav anchor pointing at it.
    getRelatedPublications({
      currentId: pub.id,
      journalName: pub.journal_name,
      keywords: pub.keywords,
      firstAuthorId: (pub.authorships ?? [])[0]?.author.id ?? null,
    }),
    getLibraryFallbackBooks({ keywords: pub.keywords, subjects: pub.subjects }),
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

  // ── What actually has content ────────────────────────────────────────────
  //
  // Every section below is gated on one of these booleans, and the nav is
  // built from the SAME booleans. That is the whole fix for jump links that
  // landed on a bare heading: a section and its anchor can no longer disagree,
  // because neither is written twice.
  //
  // "Overview" is gone. It was a second name for the abstract, with the
  // subjects and keywords tucked underneath; the abstract keeps the one
  // heading and the taxonomy moved to the sidebar rail as filter links.
  const has = {
    abstract: !!(pub.abstract?.trim() || pub.abstract_km?.trim()),
    toc: pub.table_of_contents.length > 0,
    outcomes: pub.learning_outcomes.length > 0,
    fulltext: !!pub.pdf_url,
    references: pub.references.length > 0,
    authors: authorships.length > 0,
    reviews: showReviews,
    faq: pub.faqs.length > 0,
    // The region renders if EITHER block has something; RelatedPublications
    // and SimilarBooks each return null when empty, so the page can never end
    // on "No related publications found yet".
    related: relatedItems.length > 0 || libraryBooks.books.length > 0,
  };

  const sections: QuickNavSection[] = [
    ...(has.abstract ? [{ id: "abstract", label: t("sectionAbstract") }] : []),
    ...(has.toc ? [{ id: "toc", label: t("sectionToc") }] : []),
    ...(has.outcomes ? [{ id: "outcomes", label: t("sectionOutcomes") }] : []),
    ...(has.fulltext ? [{ id: "fulltext", label: t("sectionFullText") }] : []),
    ...(has.references ? [{ id: "references", label: t("sectionReferences") }] : []),
    ...(has.authors ? [{ id: "authors", label: t("sectionAuthors") }] : []),
    ...(has.reviews ? [{ id: "reviews", label: t("sectionReviews") }] : []),
    ...(has.faq ? [{ id: "faq", label: t("sectionFaq") }] : []),
    { id: "details", label: t("sectionDetails"), track: false },
    { id: "cite-panel", label: t("sectionCitation"), track: false },
    ...(has.related ? [{ id: "related", label: t("sectionRelated") }] : []),
  ];

  // One derivation of every number on the page — masthead and rail both read
  // this object, and the reference count comes from the array the References
  // section itself renders.
  const metrics = publicationMetrics(pub, year);

  // ── JSON-LD (ScholarlyArticle) ────────────────────────────────────────────
  // Validated identifiers, verified-license-only, locale-correct URLs, and no
  // "Unknown Author" fabrication — see lib/seo/publication-seo.ts.
  const scholarlyArticleSchema = publicationJsonLd(
    toPublicationSeoInput(pub),
    locale,
    // An aggregateRating may only be emitted where the rating is actually
    // shown. Publications have reviews disabled, so no rating goes into the
    // structured data either — a rating that appears nowhere on the page is a
    // structured-data mismatch.
    aggregateRatingAllowed("publication") && ratingStats.count > 0
      ? { ratingValue: ratingStats.average, reviewCount: ratingStats.count }
      : null,
    await getOrgIdentity(),
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

  // Mirrors the visible trail, journal level included. The journal is only
  // hidden by CSS on narrow screens — it is still part of the hierarchy.
  const pubBreadcrumbSchema = breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Publications", path: "/publications" },
    ...(pub.journal_name
      ? [
          {
            name: pub.journal_name,
            path: `/publications?journal=${encodeURIComponent(pub.journal_name)}`,
          },
        ]
      : []),
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
            {/* The journal is a real level of the hierarchy, but it is the
                first thing worth dropping on a narrow screen — the title must
                keep its room. Hidden below sm, chevron and all. */}
            {pub.journal_name && (
              <span className="hidden items-center gap-1.5 sm:inline-flex sm:gap-2">
                <Icon name="chevron-right" className="text-[16px] text-divider" />
                <Link
                  href={`/publications?journal=${encodeURIComponent(pub.journal_name)}`}
                  className="max-w-[220px] truncate transition-colors hover:text-brand"
                  title={pub.journal_name}
                >
                  {pub.journal_name}
                </Link>
              </span>
            )}
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

        {/* ── Masthead ── */}
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
          metrics={metrics}
        />

        {/* ── Sticky section nav ── */}
        <SectionQuickNav sections={sections} label={t("sectionNavLabel")} />

        {/* ── Body: stacked sections + sidebar ── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-10">
            {/* Says plainly that the full text is not in the reader's
                language, instead of leaving them to assume a broken page. */}
            <ContentLanguageNotice contentLanguage={pub.language} locale={locale} />

            {has.abstract && (
              <section id="abstract" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="abstract-heading">
                <PublicationAbstractSection
                  abstract={pub.abstract || ""}
                  abstractKm={pub.abstract_km}
                  references={pub.references}
                  heading={t("sectionAbstract")}
                  publicationTitle={locale === "km" && pub.title_km ? pub.title_km : pub.title}
                  locale={locale}
                />
              </section>
            )}

            {has.toc && (
              <section id="toc" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="toc-heading">
                <h2 id="toc-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionToc")}
                </h2>
                <TableOfContentsSection entries={pub.table_of_contents} />
              </section>
            )}

            {has.outcomes && (
              <section id="outcomes" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="outcomes-heading">
                <h2 id="outcomes-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionOutcomes")}
                </h2>
                <LearningOutcomesSection outcomes={pub.learning_outcomes} intro={t("outcomesIntro")} />
              </section>
            )}

            {/* Renders only when a file exists. When it doesn't, the masthead's
                action buttons already say so — no empty section is needed to
                carry that message. */}
            {has.fulltext && (
              <section id="fulltext" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="fulltext-heading">
                <h2 id="fulltext-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionFullText")}
                </h2>
                <PDFPreviewSection
                  title={pub.title}
                  pdfUrl={fileHref}
                  fileHref={fileHref}
                  publicationId={pub.id}
                  hasFile
                  reportEmail={(await getSiteConfig()).email}
                />
              </section>
            )}

            {has.references && (
              <section id="references" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="references-heading">
                <h2 id="references-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionReferences")}
                  <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-brand">
                    {pub.references.length}
                  </span>
                </h2>
                <ReferencesSection references={pub.references} occurrences={citationOccurrences} />
              </section>
            )}

            {has.authors && (
              <section id="authors" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="authors-heading">
                <h2 id="authors-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionAuthors")}
                </h2>
                <AuthorBiosSection authorships={authorships} affiliations={affiliations} />
              </section>
            )}

            {has.reviews && (
              <section id="reviews" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="reviews-heading">
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
            )}

            {has.faq && (
              <section id="faq" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="faq-heading">
                <h2 id="faq-heading" className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {t("sectionFaq")}
                </h2>
                <PublicationFAQ faqs={pub.faqs} />
              </section>
            )}
          </div>

          {/* Sidebar rail: metrics, cite, access, subjects. On mobile it
              follows the article body in source order. */}
          <PublicationSidebar
            pub={pub}
            fileHref={fileHref}
            shareUrl={shareUrl}
            publishedOn={publishedOn}
            year={year}
            metrics={metrics}
          />
        </div>

        {/* ── More from this journal / author ── */}
        <MoreFromJournal currentId={pub.id} journalName={pub.journal_name} />
        {primaryAuthor && <MoreFromAuthor currentId={pub.id} author={primaryAuthor} />}

        {/* ── Keep reading ──────────────────────────────────────────────────
            One region behind one anchor. Related publications lead when they
            exist; library books follow, or stand alone under an honest
            heading. If neither has content the whole region — and its nav
            entry — is absent. */}
        {has.related && (
          <section id="related" className="mt-16 scroll-mt-24 lg:scroll-mt-36">
            <h2 className="sr-only">{t("sectionRelated")}</h2>
            <RelatedPublications items={relatedItems} />
            <SimilarBooks
              books={libraryBooks.books}
              matchedOnTopic={libraryBooks.matchedOnTopic}
              standalone={relatedItems.length === 0}
            />
          </section>
        )}
      </div>
    </section>
  );
}
