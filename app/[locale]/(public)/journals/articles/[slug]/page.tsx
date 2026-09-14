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
import PDFPreviewSection from "@/components/ui/publications/PDFPreviewSection";
import ReferencesSection from "@/components/ui/publications/ReferencesSection";
import ContentLanguageNotice from "@/components/ui/publications/ContentLanguageNotice";
import TableOfContentsSection from "@/components/ui/publications/TableOfContentsSection";
import LearningOutcomesSection from "@/components/ui/publications/LearningOutcomesSection";
import AuthorBiosSection from "@/components/ui/publications/AuthorBiosSection";
import PublicationFAQ from "@/components/ui/publications/PublicationFAQ";
import PublicationFigures from "@/components/ui/publications/PublicationFigures";
import SimilarBooks from "@/components/ui/publications/SimilarBooks";
import PublicationReviewsSection from "@/components/ui/publications/PublicationReviewsSection";
import { getPublicationRatingStats } from "@/app/actions/publication-reviews";
import PublicationAbstractSection from "@/components/ui/publications/PublicationAbstractSection";
import ArticleHeader, { ARTICLE_TITLE_ID } from "@/components/ui/publications/article/ArticleHeader";
import ArticleSectionHeading from "@/components/ui/publications/article/ArticleSectionHeading";
import ArticleSectionNav from "@/components/ui/publications/article/ArticleSectionNav";
import ArticleKeywords from "@/components/ui/publications/article/ArticleKeywords";
import ArticleJournalContext, { type ArticleDetail } from "@/components/ui/publications/article/ArticleJournalContext";
import ArticlePrevNext from "@/components/ui/publications/article/ArticlePrevNext";
import ArticleScholarship from "@/components/ui/publications/article/ArticleScholarship";
import ArticleMobileDock from "@/components/ui/publications/article/ArticleMobileDock";
import CiteArticleDialog from "@/components/ui/publications/article/CiteArticleDialog";
import {
  academicTextToPlainText,
  collectCitationOccurrences,
} from "@/lib/publications/citations";
import {
  getRelatedPublications,
  getLibraryFallbackBooks,
  getJournalSiblings,
  getAuthorOtherWorks,
  relatedToItems,
} from "@/lib/publications/related";
import { publicationMetrics } from "@/lib/publications/integrity";
import {
  affiliationMarkers,
  articleDates,
  articleSections,
  dedupeScholarship,
  type ArticleSectionFlags,
} from "@/lib/publications/article-layout";
import { reviewsEnabled, aggregateRatingAllowed } from "@/lib/reviews/policy";
import ReadingProgress from "@/components/ui/detail/ReadingProgress";
import Icon from "@/components/ui/core/Icon";
import JsonLd from "@/components/seo/JsonLd";
import ResourceConnections from "@/components/seo/ResourceConnections";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { publicationScholarMeta } from "@/lib/seo/citation";
import { doiUrl, isValidIssn, normalizeDoi, normalizeIssn } from "@/lib/seo/identifiers";
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
import type { OrgIdentity } from "@/lib/system-settings/org-identity";
import { publicationContributorViews } from "@/lib/publications/contributors";
import { getArticleJournalContext, getIssue, type ArticleJournalContext as JournalContext } from "@/lib/journals/data";
import { issueNeighbours } from "@/lib/journals/order";
import { articlePath, issuePath, journalFilterPath, journalPath, JOURNALS_PATH } from "@/lib/journals/urls";
import { formatJournalDate, issueLabel, journalTitle, languageName } from "@/lib/journals/types";

/**
 * Adapt a Publication row into the typed, browser-safe SEO input.
 *
 * `contributors` is the SEO 3.2 half: the article's authorship relation
 * (0052's `publication_authorships`, already ordered and identified) expressed
 * as contributor views, so the builder spends a decision already made instead
 * of re-classifying the comma-joined byline those same rows produced. When the
 * query did not embed authorships the views are empty and `authors` carries
 * the page, exactly as before.
 */
function toPublicationSeoInput(
  pub: import("@/lib/publications").Publication,
  org?: OrgIdentity,
  ctx?: JournalContext | null,
): PublicationSeoInput {
  const contributors = publicationContributorViews(pub, org);
  return {
    journalRef: ctx
      ? {
          slug: ctx.journal.slug,
          title: ctx.journal.title,
          titleKm: ctx.journal.title_km,
          issn: ctx.journal.issn,
          eIssn: ctx.journal.e_issn,
          printIssn: ctx.journal.print_issn,
          publisher: ctx.journal.publisher_name,
          issue: ctx.issue
            ? {
                slug: ctx.issue.slug,
                issueNumber: ctx.issue.issue_number,
                volumeNumber: ctx.issue.volume?.volume_number ?? null,
                title: ctx.issue.title,
                datePublished: ctx.issue.published_date,
              }
            : null,
        }
      : null,
    slug: pub.slug,
    title: pub.title,
    titleKm: pub.title_km,
    abstractText: academicTextToPlainText(pub.abstract, pub.references),
    authors: authorList(pub),
    contributors: contributors.length > 0 ? contributors : null,
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const { data: pub } = await getPublicationOnce(slug);

  if (!pub) {
    return { title: "Article not found" };
  }

  // Typed, localized metadata (validated identifiers, Khmer-aware). Google
  // Scholar citation_* tags are merged in via `other`.
  const metaOrg = await getOrgIdentity();
  const base = buildPublicationMetadata(
    toPublicationSeoInput(pub, metaOrg),
    locale,
    { seoTitle: pub.seo_title, seoDescription: pub.seo_description, ogImage: pub.og_image },
    metaOrg,
  );
  return { ...base, other: publicationScholarMeta(pub) };
}

/** Two strings that say the same thing, once trimmed and case-folded. */
function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
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
  const primaryAuthor = authorships[0]?.author ?? null;

  // Reader reviews are disabled for publications (lib/reviews/policy.ts), so
  // the rating query is skipped entirely rather than fetched and discarded.
  const showReviews = reviewsEnabled("publication");

  // Everything that depends only on the article runs concurrently — one wave
  // of round-trips, not a stack of them. The related blocks are fetched HERE
  // rather than inside their components so the page can de-duplicate them and
  // know, before it emits a nav entry, whether each region has content.
  const [
    isAdmin,
    affiliations,
    ratingStats,
    relatedItems,
    libraryBooks,
    figures,
    authorWorks,
    journalCtx,
    pageOrg,
    siteConfig,
  ] = await Promise.all([
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
    getRelatedPublications({
      currentId: pub.id,
      journalName: pub.journal_name,
      keywords: pub.keywords,
      firstAuthorId: primaryAuthor?.id ?? null,
    }),
    getLibraryFallbackBooks({ keywords: pub.keywords, subjects: pub.subjects }),
    // Its own query rather than an embed in PUBLICATION_DETAIL_SELECT (see
    // getPublicationFigures for why). Returns [] rather than throwing when the
    // table is not there yet, so the section simply does not render.
    getPublicationFigures(pub.id),
    getAuthorOtherWorks({ currentId: pub.id, authorId: primaryAuthor?.id ?? null }),
    getArticleJournalContext(pub),
    getOrgIdentity(),
    getSiteConfig(),
  ]);

  // Second wave: what needs the journal context. Both reads are cached
  // (unstable_cache, tagged journals + publications) and shared with the
  // journal and issue pages.
  const [journalSiblings, issueDetail] = await Promise.all([
    getJournalSiblings({
      currentId: pub.id,
      journalId: journalCtx?.journal.id ?? null,
      journalName: journalCtx ? null : pub.journal_name,
    }),
    journalCtx?.issue
      ? getIssue(journalCtx.journal.id, journalCtx.issue.slug).catch(() => null)
      : Promise.resolve(null),
  ]);

  // ── The journal chain: Article → Issue → Journal ─────────────────────────
  const journalHref = journalCtx ? journalPath(journalCtx.journal.slug) : null;
  const issueHref = journalCtx?.issue ? issuePath(journalCtx.journal.slug, journalCtx.issue.slug) : null;
  const journalName = journalCtx ? journalTitle(journalCtx.journal, locale) : pub.journal_name;
  // The issue's own label when it is a public issue; otherwise the same label
  // built from the numbers the article carries. Nothing is invented for a
  // missing volume or number.
  const issueName = journalCtx?.issue
    ? issueLabel(journalCtx.issue, locale)
    : pub.volume || pub.issue_no
      ? issueLabel(
          {
            issue_number: pub.issue_no,
            issue_label: null,
            title: null,
            title_km: null,
            volume: pub.volume ? { volume_number: pub.volume } : null,
          },
          locale,
        ) || null
      : null;
  const neighbours = issueDetail ? issueNeighbours(issueDetail.articles, pub.id) : { previous: null, next: null };
  const back = issueHref
    ? { href: issueHref, label: t("backToIssue") }
    : journalHref
      ? { href: journalHref, label: t("backToJournal") }
      : { href: JOURNALS_PATH, label: t("backToJournals") };

  // ── Header facts ─────────────────────────────────────────────────────────
  const { markerFor, ordered: orderedAffiliations } = affiliationMarkers(authorships, affiliations);
  const citationLine = toCitationLine(pub);
  const year = citationYear(pub);
  const dates = articleDates({
    publicationDate: pub.publication_date,
    publishedAt: pub.published_at,
    issueDate: journalCtx?.issue?.published_date,
  });
  const issueYear = journalCtx?.issue?.published_date
    ? String(new Date(journalCtx.issue.published_date).getUTCFullYear())
    : journalCtx?.issue?.volume?.year
      ? String(journalCtx.issue.volume.year)
      : year;
  const typeLabel =
    pub.article_type === "review"
      ? t("typeReview")
      : pub.article_type === "account"
        ? t("typeAccount")
        : pub.article_type === "editorial"
          ? t("typeEditorial")
          : t("typeArticle");
  // One derivation of every number on the page (zero-suppressed).
  const metrics = publicationMetrics(pub, year);
  // The same validation JSON-LD and the Scholar tags apply: a placeholder or
  // malformed DOI is never presented as a resolvable identifier.
  const doi = normalizeDoi(pub.doi);
  // The file API keeps its /api/publications path: it is not part of the
  // information architecture, and it is the ONE place the rights gate runs.
  const fileHref = `/api/publications/${slug}/file`;

  // ONE resolution of "may this reader have the file", shared with the API
  // route that enforces it. Every control on the page — header, rail, phone
  // dock — draws from this, so the page can never advertise a download the
  // server is going to refuse, and never hide one it would have allowed.
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
  const shareUrl = `${SITE_URL}${articlePath(slug)}`;

  // Inline-citation anchors rendered inside the abstracts, used by the
  // References section to link each entry back into the text.
  const citationOccurrences = collectCitationOccurrences(
    [
      { id: "abstract-en", text: pub.abstract },
      { id: "abstract-km", text: pub.abstract_km },
    ],
    pub.references,
  );

  // ── Related scholarship, each item once, under its strongest relation ────
  const scholarship = dedupeScholarship({
    journal: journalSiblings,
    authors: authorWorks,
    related: relatedToItems(relatedItems),
    relatedId: (r) => r.id,
  });

  // ── What actually has content ────────────────────────────────────────────
  //
  // Every section below is gated on one of these booleans, and the "On this
  // page" list is built from the SAME booleans (articleSections), so a nav
  // entry can never point at a section that did not render.
  const has: ArticleSectionFlags = {
    abstract: !!(pub.abstract?.trim() || pub.abstract_km?.trim()),
    toc: pub.table_of_contents.length > 0,
    outcomes: pub.learning_outcomes.length > 0,
    fulltext: !!pub.pdf_url,
    figures: figures.length > 0,
    references: pub.references.length > 0,
    authors: authorships.length > 0,
    reviews: showReviews,
    faq: pub.faqs.length > 0,
    related:
      scholarship.journal.length > 0 ||
      scholarship.authors.length > 0 ||
      scholarship.related.length > 0 ||
      libraryBooks.books.length > 0,
  };
  const sections = articleSections(has, {
    abstract: t("sectionAbstract"),
    toc: t("sectionToc"),
    outcomes: t("sectionOutcomes"),
    fulltext: t("sectionFullText"),
    figures: t("sectionFigures"),
    references: t("sectionReferences"),
    authors: t("sectionAuthors"),
    reviews: t("sectionReviews"),
    faq: t("sectionFaq"),
    related: t("sectionRelated"),
  });

  // ── The record's remaining facts, for the "Published in" block ──────────
  const issn = [journalCtx?.journal.issn, pub.issn].find((v) => isValidIssn(v));
  const pages = pub.page_start ? [pub.page_start, pub.page_end].filter(Boolean).join("–") : null;
  const details: ArticleDetail[] = [
    { label: t("fieldType"), value: typeLabel },
    ...(pages ? [{ label: t("fieldPages"), value: pages }] : []),
    ...(!pages && pub.article_no ? [{ label: t("fieldArticleNumber"), value: pub.article_no }] : []),
    // A publication with no publisher of its own is published by the
    // institution — resolved from the published settings, never compiled in.
    { label: t("fieldPublisher"), value: pub.publisher || pageOrg.institutionName },
    ...(issn ? [{ label: t("fieldIssn"), value: normalizeIssn(issn) ?? issn, mono: true }] : []),
    ...(pub.isbn ? [{ label: t("fieldIsbn"), value: pub.isbn, mono: true }] : []),
    // A DOI that fails validation is still the record's data: stated here as
    // text, never linked or offered as a resolvable identifier.
    ...(pub.doi && !doi ? [{ label: t("fieldDoi"), value: pub.doi, mono: true }] : []),
    ...(pub.language ? [{ label: t("fieldLanguage"), value: languageName(pub.language, locale) ?? pub.language }] : []),
    ...(pub.license ? [{ label: t("fieldLicense"), value: pub.license }] : []),
    // Staff often paste the same notice into both fields; say it once.
    ...(pub.copyright && !sameText(pub.copyright, pub.license) ? [{ label: t("fieldCopyright"), value: pub.copyright }] : []),
  ];

  // ── JSON-LD (ScholarlyArticle) ────────────────────────────────────────────
  // Validated identifiers, verified-license-only, locale-correct URLs, and no
  // "Unknown Author" fabrication — see lib/seo/publication-seo.ts.
  const scholarlyArticleSchema = publicationJsonLd(
    toPublicationSeoInput(pub, pageOrg, journalCtx),
    locale,
    // An aggregateRating may only be emitted where the rating is actually
    // shown. Publications have reviews disabled, so no rating goes into the
    // structured data either — a rating that appears nowhere on the page is a
    // structured-data mismatch.
    aggregateRatingAllowed("publication") && ratingStats.count > 0
      ? { ratingValue: ratingStats.average, reviewCount: ratingStats.count }
      : null,
    pageOrg,
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

  // Mirrors the visible trail. Journal and issue are real, indexable pages
  // since 0148, so they are real crumbs — but only when the article is mapped
  // to a PUBLIC journal. The old journal crumb pointed at a filtered listing
  // served noindex (docs/SEO-V3-AUDIT.md D-5); an unmapped article still gets
  // no journal crumb for exactly that reason, and still states its journal on
  // the page and in `isPartOf`.
  const pubBreadcrumbSchema = breadcrumbSchema([
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbPublications"), path: JOURNALS_PATH },
    ...(journalCtx && journalHref ? [{ name: journalName ?? journalCtx.journal.title, path: journalHref }] : []),
    ...(issueHref && journalCtx?.issue ? [{ name: issueLabel(journalCtx.issue, locale), path: issueHref }] : []),
    { name: pub.title },
  ], { locale });

  const sectionClass = "scroll-mt-24";

  return (
    <>
      <JsonLd data={scholarlyArticleSchema} />
      <JsonLd data={pubBreadcrumbSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}
      <PublicationViewPing id={pub.id} />
      <ReadingProgress />

      {/* ── The article: one reading surface, header and body ───────────── */}
      <section className="bg-bg-surface px-4 pb-16 pt-5 sm:px-6 sm:pt-7 md:px-12">
        <div className="mx-auto max-w-[1200px]">
          {/* Quiet trail + the admin's edit link. Journal and issue crumbs
              step aside on narrow screens — the header's context line names
              both, with links, directly below. The article's own title is
              the page's h1 a few pixels further down, so the visible trail
              stops at its parent; the full trail is still read out and still
              mirrors the BreadcrumbList. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-muted"
            >
              <Link href="/" className="transition-colors hover:text-brand">{t("breadcrumbHome")}</Link>
              <Icon name="chevron-right" className="text-[15px] text-divider" />
              <Link href={JOURNALS_PATH} className="transition-colors hover:text-brand">{t("breadcrumbPublications")}</Link>
              {journalHref && journalName && (
                <span className="hidden items-center gap-1.5 sm:inline-flex">
                  <Icon name="chevron-right" className="text-[15px] text-divider" />
                  <Link href={journalHref} className="max-w-[260px] truncate transition-colors hover:text-brand" title={journalName}>
                    {journalName}
                  </Link>
                </span>
              )}
              {issueHref && journalCtx?.issue && (
                <span className="hidden items-center gap-1.5 md:inline-flex">
                  <Icon name="chevron-right" className="text-[15px] text-divider" />
                  <Link href={issueHref} className="max-w-[200px] truncate transition-colors hover:text-brand">
                    {issueLabel(journalCtx.issue, locale)}
                  </Link>
                </span>
              )}
              <span className="sr-only" aria-current="page">
                {" › "}
                {pub.title}
              </span>
            </nav>
            {isAdmin && (
              <NextLink
                href={`/admin/publications/edit/${pub.id}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-divider px-3 text-[12.5px] font-medium text-text-muted transition-colors hover:border-brand hover:text-brand"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                {t("editPublication")}
              </NextLink>
            )}
          </div>

          <article aria-labelledby={ARTICLE_TITLE_ID}>
            <ArticleHeader
              pub={pub}
              back={back}
              journal={{ name: journalName, href: journalHref }}
              issue={{ label: issueName, href: issueHref, year: issueYear }}
              typeLabel={typeLabel}
              authorships={authorships}
              markerFor={markerFor}
              affiliations={orderedAffiliations}
              fallbackNames={authorList(pub)}
              citationLine={citationLine}
              dates={{
                published: formatJournalDate(dates.published, locale),
                issue: formatJournalDate(dates.issue, locale),
              }}
              counts={{ views: metrics.views, downloads: metrics.downloads }}
              doi={doi ? { value: doi, href: doiUrl(doi) as string } : null}
              access={access}
              fileHref={fileHref}
              shareUrl={shareUrl}
              neighbours={neighbours}
              locale={locale}
            />

            {/* ── Body: the text column, and a quiet "On this page" rail ──
                The rail comes first in the DOM so a keyboard user reaches
                the section list before the text, but it is placed in the
                right-hand column; on phones it is replaced by the inline
                "Jump to" row at the top of the text. */}
            <div className="mt-10 grid border-t border-divider pt-10 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-x-14 xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-x-20">
              <aside className="hidden lg:col-start-2 lg:row-start-1 lg:block">
                <div className="sticky top-28">
                  <ArticleSectionNav
                    sections={sections}
                    variant="rail"
                    pdfHref={access.canDownload ? `${fileHref}?download=1` : null}
                  />
                </div>
              </aside>

              <div className="min-w-0 max-w-[760px] lg:col-start-1 lg:row-start-1">
                <div className="lg:hidden">
                  <ArticleSectionNav sections={sections} variant="inline" />
                </div>

                <div className="space-y-14">
                  {/* Says plainly that the full text is not in the reader's
                      language, instead of leaving them to assume a broken page. */}
                  <ContentLanguageNotice contentLanguage={pub.language} locale={locale} />

                  {has.abstract ? (
                    <section id="abstract" className={sectionClass} aria-labelledby="abstract-heading">
                      <PublicationAbstractSection
                        abstract={pub.abstract || ""}
                        abstractKm={pub.abstract_km}
                        references={pub.references}
                        heading={t("sectionAbstract")}
                        publicationTitle={locale === "km" && pub.title_km ? pub.title_km : pub.title}
                        locale={locale}
                      />
                      <ArticleKeywords keywords={pub.keywords} subjects={pub.subjects} />
                    </section>
                  ) : (
                    // No abstract: the keywords still lead the body.
                    <ArticleKeywords keywords={pub.keywords} subjects={pub.subjects} />
                  )}

                  {has.toc && (
                    <section id="toc" className={sectionClass} aria-labelledby="toc-heading">
                      <ArticleSectionHeading id="toc-heading">{t("sectionToc")}</ArticleSectionHeading>
                      <TableOfContentsSection entries={pub.table_of_contents} />
                    </section>
                  )}

                  {has.outcomes && (
                    <section id="outcomes" className={sectionClass} aria-labelledby="outcomes-heading">
                      <ArticleSectionHeading id="outcomes-heading">{t("sectionOutcomes")}</ArticleSectionHeading>
                      <LearningOutcomesSection outcomes={pub.learning_outcomes} intro={t("outcomesIntro")} />
                    </section>
                  )}

                  {/* Renders only when a file exists. When it doesn't, the
                      header's access notice already says so. tabIndex -1 makes
                      it the focus target "Read article" moves to. */}
                  {has.fulltext && (
                    <section
                      id="fulltext"
                      tabIndex={-1}
                      className={`${sectionClass} focus:outline-none`}
                      aria-labelledby="fulltext-heading"
                    >
                      <ArticleSectionHeading id="fulltext-heading">{t("sectionFullText")}</ArticleSectionHeading>
                      <PDFPreviewSection
                        title={pub.title}
                        pdfUrl={fileHref}
                        fileHref={fileHref}
                        publicationId={pub.id}
                        hasFile
                        reportEmail={siteConfig.email}
                      />
                    </section>
                  )}

                  {/* After the full text and before the references, which is
                      where a reader looking for "the figure from that paper"
                      goes hunting. Absent entirely when the record has none. */}
                  {has.figures && (
                    <section id="figures" className={sectionClass} aria-labelledby="figures-heading">
                      <ArticleSectionHeading id="figures-heading" count={figures.length}>
                        {t("sectionFigures")}
                      </ArticleSectionHeading>
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
                    <section id="references" className={sectionClass} aria-labelledby="references-heading">
                      <ArticleSectionHeading id="references-heading" count={pub.references.length}>
                        {t("sectionReferences")}
                      </ArticleSectionHeading>
                      <ReferencesSection references={pub.references} occurrences={citationOccurrences} />
                    </section>
                  )}

                  {has.authors && (
                    <section id="authors" className={sectionClass} aria-labelledby="authors-heading">
                      <ArticleSectionHeading id="authors-heading">{t("sectionAuthors")}</ArticleSectionHeading>
                      <AuthorBiosSection authorships={authorships} affiliations={affiliations} />
                    </section>
                  )}

                  {has.reviews && (
                    <section id="reviews" className={sectionClass} aria-labelledby="reviews-heading">
                      <ArticleSectionHeading
                        id="reviews-heading"
                        count={ratingStats.count > 0 ? ratingStats.count : undefined}
                      >
                        {t("sectionReviews")}
                      </ArticleSectionHeading>
                      <Suspense
                        fallback={<div className="h-48 animate-pulse rounded-2xl border border-divider bg-bg-surface" />}
                      >
                        <PublicationReviewsSection publicationId={pub.id} slug={slug} />
                      </Suspense>
                    </section>
                  )}

                  {has.faq && (
                    <section id="faq" className={sectionClass} aria-labelledby="faq-heading">
                      <ArticleSectionHeading id="faq-heading">{t("sectionFaq")}</ArticleSectionHeading>
                      <PublicationFAQ faqs={pub.faqs} />
                    </section>
                  )}

                  {/* Article → Issue → Journal, closed where the article ends. */}
                  <ArticleJournalContext
                    journal={{
                      name: journalName,
                      href: journalHref,
                      filterHref: !journalHref && pub.journal_name ? journalFilterPath(pub.journal_name) : null,
                    }}
                    issue={{
                      label: issueName,
                      href: issueHref,
                      date: formatJournalDate(journalCtx?.issue?.published_date, locale),
                    }}
                    details={details}
                  />

                  <ArticlePrevNext {...neighbours} locale={locale} variant="full" />
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* ── What to read next ─────────────────────────────────────────────
          Outside the <article>: it is about other works. Journal, then
          author, then related articles, then books — de-duplicated. The
          subject and author hub links (ResourceConnections) close the page
          whether or not anything related was found. */}
      <div className="border-t border-divider bg-bg-body px-4 py-14 sm:px-6 md:px-12">
        <div className="mx-auto max-w-[1200px]">
          {has.related && (
            <section id="related" className={sectionClass} aria-labelledby="related-heading">
              <h2 id="related-heading" className="mb-8 font-khmer-serif text-[24px] font-bold text-text-heading sm:text-[26px]">
                {t("relatedScholarship")}
              </h2>
              <ArticleScholarship
                locale={locale}
                journal={{ name: journalName, href: journalHref, items: scholarship.journal }}
                author={
                  primaryAuthor
                    ? {
                        name: primaryAuthor.full_name,
                        scholarUrl: `https://scholar.google.com/scholar?q=${encodeURIComponent(primaryAuthor.full_name)}`,
                        items: scholarship.authors,
                      }
                    : null
                }
                related={scholarship.related}
                books={<SimilarBooks books={libraryBooks.books} matchedOnTopic={libraryBooks.matchedOnTopic} />}
              />
            </section>
          )}
          <ResourceConnections
            locale={locale}
            subjectNames={pub.subjects ?? []}
            authorNames={authorships.map((a) => a.author?.full_name)}
            className={has.related ? "mt-12 border-t border-divider pt-6" : ""}
          />
        </div>
      </div>

      <ArticleMobileDock canRead={access.canReadOnline} canDownload={access.canDownload} fileHref={fileHref} />
      <CiteArticleDialog publication={pub} labels={{ title: t("citeArticle"), close: t("close") }} />
    </>
  );
}
