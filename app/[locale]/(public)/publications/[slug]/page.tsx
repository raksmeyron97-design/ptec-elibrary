import { Suspense, cache } from "react";
import { decodeSlugParam } from "@/lib/slug";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import { getPublicationBySlug, getPublicationFigures } from "@/app/actions/publications";
import { resolveDownloadAccess } from "@/lib/publications/access";
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
import PublicationFigures from "@/components/ui/publications/PublicationFigures";
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
import SectionHeading from "@/components/ui/detail/SectionHeading";
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
import { Download, Pencil } from "lucide-react";
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
  const [isAdmin, affiliations, ratingStats, relatedItems, libraryBooks, figures] = await Promise.all([
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
    // Its own query rather than an embed in PUBLICATION_DETAIL_SELECT (see
    // getPublicationFigures for why), but concurrent with the rest — it costs
    // no extra wall-clock time. Returns [] rather than throwing when the table
    // is not there yet, so the section simply does not render.
    getPublicationFigures(pub.id),
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

  // ONE resolution of "may this reader have the file", shared with the API
  // route that enforces it. The masthead draws its buttons from this, so the
  // page can never advertise a download the server is going to refuse — and
  // never hide one it would have allowed.
  const access = resolveDownloadAccess({
    slug: pub.slug,
    title: pub.title,
    publisher: pub.publisher,
    license: pub.license,
    allow_download: pub.allow_download,
    download_disabled_reason: pub.download_disabled_reason,
    fulltext_redistributable: pub.fulltext_redistributable,
    pdf_url: pub.pdf_url,
  });
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
    figures: figures.length > 0,
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
    ...(has.figures ? [{ id: "figures", label: t("sectionFigures") }] : []),
    ...(has.references ? [{ id: "references", label: t("sectionReferences") }] : []),
    ...(has.authors ? [{ id: "authors", label: t("sectionAuthors") }] : []),
    ...(has.reviews ? [{ id: "reviews", label: t("sectionReviews") }] : []),
    ...(has.faq ? [{ id: "faq", label: t("sectionFaq") }] : []),
    // "Details" and "Citation" are deliberately absent. Both pointed into the
    // record rail, which on desktop is already on screen beside the text and
    // on mobile now sits directly under the abstract — so the links jumped
    // either nowhere or past everything. Dropping them takes the bar from
    // eleven chips to nine, which is what makes it fit without scrolling on a
    // laptop.
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
          access={access}
        />

        {/* ── Sticky section nav ──────────────────────────────────────────
            Carries Download as a trailing action, revealed only once the
            masthead has scrolled out of view. That is what the sidebar's
            "Quick Actions" card was for, except the card sat permanently
            beside the buttons it duplicated. */}
        <SectionQuickNav
          sections={sections}
          label={t("sectionNavLabel")}
          revealActionAfterId="publication-masthead"
          action={
            access.canDownload ? (
              <a
                href={`${fileHref}?download=1`}
                className="btn-brand-gradient inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12.5px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                <Download className="h-3.5 w-3.5" />
                {t("downloadPdf")}
              </a>
            ) : null
          }
        />

        {/* ── Body: article column + record rail ───────────────────────────
            Explicit grid placement, because source order and reading order
            differ here. The rail used to be a single grid child after the
            whole article, which on a phone dropped the journal, volume, pages,
            DOI, publisher, licence and the citation builder roughly six
            thousand pixels down — below six FAQ accordions. Splitting the
            article into "abstract" and "the rest" lets the rail sit directly
            under the abstract on mobile (judge the work, then check its facts,
            then dig in) while staying a right-hand column on desktop.

            The rail is stretched across both rows and holds its own sticky
            inner box: a grid item sized to its content has no travel for
            position: sticky. */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-x-8 lg:items-start">
          <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-1">
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
          </div>

          {/* Record rail: the facts, the citation, the subject links out. */}
          <aside className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch">
            <div className="lg:sticky lg:top-[128px]">
              <PublicationSidebar pub={pub} publishedOn={publishedOn} year={year} />
            </div>
          </aside>

          <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
            {has.toc && (
              <section id="toc" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="toc-heading">
                <SectionHeading id="toc-heading">{t("sectionToc")}</SectionHeading>
                <TableOfContentsSection entries={pub.table_of_contents} />
              </section>
            )}

            {has.outcomes && (
              <section id="outcomes" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="outcomes-heading">
                <SectionHeading id="outcomes-heading">{t("sectionOutcomes")}</SectionHeading>
                <LearningOutcomesSection outcomes={pub.learning_outcomes} intro={t("outcomesIntro")} />
              </section>
            )}

            {/* Renders only when a file exists. When it doesn't, the masthead's
                action buttons already say so — no empty section is needed to
                carry that message. */}
            {has.fulltext && (
              <section id="fulltext" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="fulltext-heading">
                <SectionHeading id="fulltext-heading">{t("sectionFullText")}</SectionHeading>
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

            {/* Visual content. Placed after the full text and before the
                references, which is where a reader looking for "the figure
                from that paper" goes hunting. Absent entirely when the record
                has none — no empty gallery frame. */}
            {has.figures && (
              <section id="figures" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="figures-heading">
                <SectionHeading id="figures-heading" count={figures.length}>
                  {t("sectionFigures")}
                </SectionHeading>
                <PublicationFigures
                  figures={figures}
                  locale={locale}
                  labels={{
                    figureLabel: t("figureLabel", { n: "{n}" }),
                    enlarge: t("figureEnlarge", { n: "{n}" }),
                    close: t("figureClose"),
                    previous: t("figurePrevious"),
                    next: t("figureNext"),
                    position: t("figurePosition", { n: "{n}", total: "{total}" }),
                    credit: t("figureCredit"),
                  }}
                />
              </section>
            )}

            {has.references && (
              <section id="references" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="references-heading">
                <SectionHeading id="references-heading" count={pub.references.length}>
                  {t("sectionReferences")}
                </SectionHeading>
                <ReferencesSection references={pub.references} occurrences={citationOccurrences} />
              </section>
            )}

            {has.authors && (
              <section id="authors" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="authors-heading">
                <SectionHeading id="authors-heading">{t("sectionAuthors")}</SectionHeading>
                <AuthorBiosSection authorships={authorships} affiliations={affiliations} />
              </section>
            )}

            {has.reviews && (
              <section id="reviews" className="scroll-mt-24 lg:scroll-mt-36" aria-labelledby="reviews-heading">
                <SectionHeading
                  id="reviews-heading"
                  count={ratingStats.count > 0 ? `${ratingStats.average.toFixed(1)} ★ · ${ratingStats.count}` : undefined}
                >
                  {t("sectionReviews")}
                </SectionHeading>
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
                <SectionHeading id="faq-heading">{t("sectionFaq")}</SectionHeading>
                <PublicationFAQ faqs={pub.faqs} />
              </section>
            )}
          </div>
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
