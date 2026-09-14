import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import AccessBadge from "@/components/ui/publications/AccessBadge";
import PublicationAccessNotice from "@/components/ui/publications/PublicationAccessNotice";
import ArticleAuthors from "@/components/ui/publications/article/ArticleAuthors";
import ArticleActions from "@/components/ui/publications/article/ArticleActions";
import ArticleDoi from "@/components/ui/publications/article/ArticleDoi";
import ArticlePrevNext, { type ArticleNeighbour } from "@/components/ui/publications/article/ArticlePrevNext";
import { EYEBROW, KHMER_RE } from "@/components/ui/publications/article/styles";
import { secondaryValue } from "@/lib/publications/integrity";
import type { DownloadAccess } from "@/lib/publications/access";
import type { Publication, PublicationAuthorship } from "@/lib/publications";
import type { NumberedAffiliation } from "@/lib/publications/article-layout";

export const ARTICLE_TITLE_ID = "article-title";

/**
 * The journal article's masthead.
 *
 * Built to answer, in this order: what is this, who wrote it, where and when
 * was it published, what is its DOI, and how do I read it. It is deliberately
 * NOT a card — the old masthead was a 788 px rounded box that pushed the
 * abstract below a laptop's fold — but an editorial header on the page's
 * reading surface, closed by a hairline.
 *
 * Everything here is a fact the record carries. A missing volume, issue,
 * date, DOI or affiliation removes its line; nothing is filled in. The one
 * rights claim is AccessBadge (derived from the licence, never asserted), and
 * the buttons come from the resolved access decision.
 */
export default async function ArticleHeader({
  pub,
  back,
  journal,
  issue,
  typeLabel,
  authorships,
  markerFor,
  affiliations,
  fallbackNames,
  citationLine,
  dates,
  counts,
  doi,
  access,
  fileHref,
  shareUrl,
  neighbours,
  locale,
}: {
  pub: Publication;
  back: { href: string; label: string };
  journal: { name: string | null; href: string | null };
  /** "Vol. 91, No. 11" and its issue page, and the year it belongs to. */
  issue: { label: string | null; href: string | null; year: string | null };
  typeLabel: string;
  authorships: PublicationAuthorship[];
  markerFor: Map<string, number>;
  affiliations: NumberedAffiliation[];
  fallbackNames: string[];
  citationLine: string;
  /** Already formatted in the reader's locale. */
  dates: { published: string | null; issue: string | null };
  /** From publicationMetrics(): null means "do not show", never zero. */
  counts: { views: number | null; downloads: number | null };
  doi: { value: string; href: string } | null;
  access: DownloadAccess;
  fileHref: string;
  shareUrl: string;
  neighbours: { previous: ArticleNeighbour | null; next: ArticleNeighbour | null };
  locale: string;
}) {
  const t = await getTranslations("publicationDetail");
  const translatedTitle = secondaryValue(pub.title, pub.title_km);
  // The title's own language, so hyphenation and the screen-reader voice
  // follow the words rather than the page: an English title on /km is still
  // English.
  const titleLang = KHMER_RE.test(pub.title) ? "km" : pub.language && pub.language !== "km" ? pub.language : "en";
  const issueLine = [issue.label, issue.year].filter(Boolean);
  // The title is never truncated, so a very long one steps down a size rather
  // than filling a screen: ~280 characters at 42 px is eight lines on a laptop.
  const titleSize =
    pub.title.length > 200
      ? "text-[25px] sm:text-[30px] lg:text-[34px]"
      : pub.title.length > 120
        ? "text-[27px] sm:text-[33px] lg:text-[38px]"
        : "text-[29px] sm:text-[36px] lg:text-[42px]";

  return (
    <header id="publication-masthead" className="scroll-mt-24">
      {/* ── Wayfinding: back to the issue, and along it ── */}
      <div className="-mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[14px] font-semibold text-brand transition-colors hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
        <ArticlePrevNext {...neighbours} locale={locale} variant="compact" />
      </div>

      {/* ── Journal context: the article's home shelf ── */}
      {(journal.name || issueLine.length > 0) && (
        <div className="mt-3 border-l-2 border-accent-line pl-3.5">
          {journal.name &&
            (journal.href ? (
              <Link
                href={journal.href}
                className="font-khmer-serif text-[16px] font-bold leading-snug text-text-heading transition-colors hover:text-brand hover:underline sm:text-[17px]"
              >
                {journal.name}
              </Link>
            ) : (
              <p className="font-khmer-serif text-[16px] font-bold leading-snug text-text-heading sm:text-[17px]">
                {journal.name}
              </p>
            ))}
          {issueLine.length > 0 && (
            <p className="mt-0.5 text-[14px] text-text-muted">
              {issue.label &&
                (issue.href ? (
                  <Link href={issue.href} className="font-medium text-text-body transition-colors hover:text-brand hover:underline">
                    {issue.label}
                  </Link>
                ) : (
                  <span className="font-medium text-text-body">{issue.label}</span>
                ))}
              {issue.label && issue.year && <span aria-hidden="true"> · </span>}
              {issue.year && <span>{issue.year}</span>}
            </p>
          )}
        </div>
      )}

      {/* ── What is this ── */}
      <p className={`mt-6 text-accent-text ${EYEBROW}`}>{typeLabel}</p>
      <h1
        id={ARTICLE_TITLE_ID}
        lang={titleLang}
        className={`mt-2 max-w-[980px] text-balance break-words font-khmer-serif font-bold leading-[1.2] tracking-[-0.012em] text-text-heading hyphens-auto [&:lang(km)]:leading-[1.55] [&:lang(km)]:tracking-normal ${titleSize}`}
      >
        {pub.title}
      </h1>
      {/* A sibling, never a second <h1>; lang makes a screen reader switch
          voice instead of reading Khmer with an English engine. */}
      {translatedTitle && (
        <p
          lang={KHMER_RE.test(translatedTitle) ? "km" : "en"}
          className="mt-3 max-w-[980px] font-khmer-serif text-[18px] font-semibold leading-[1.7] text-text-muted sm:text-[20px]"
        >
          {translatedTitle}
        </p>
      )}

      {/* ── Who wrote it ── */}
      <ArticleAuthors
        authorships={authorships}
        markerFor={markerFor}
        affiliations={affiliations}
        fallbackNames={fallbackNames}
      />

      {/* ── Where, when, and its identifier ── */}
      <div className="mt-5 space-y-2.5 border-t border-divider pt-4">
        {citationLine && (
          <p className="text-[14.5px] leading-6 text-text-body">
            <span className="font-semibold text-text-heading">{t("citeThis")}</span> <cite className="not-italic">{citationLine}</cite>
          </p>
        )}
        {/* Always present: the rights badge states "not stated" rather than
            leaving the question open. */}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] text-text-muted">
          {dates.published && <span>{t("publishedOn", { date: dates.published })}</span>}
          {dates.issue && <span>{t("issueDateOn", { date: dates.issue })}</span>}
          {counts.views !== null && <span>{t("srViews", { count: counts.views })}</span>}
          {counts.downloads !== null && <span>{t("srDownloads", { count: counts.downloads })}</span>}
          <AccessBadge
            license={pub.license}
            labels={{
              openAccess: t("openAccess"),
              licensed: t("accessLicensed"),
              rightsUnstated: t("accessRightsUnstated"),
            }}
          />
        </p>
        {doi && <ArticleDoi doi={doi.value} href={doi.href} />}
      </div>

      {/* ── How do I read it ── */}
      <div className="mt-5">
        <ArticleActions
          id={pub.id}
          title={pub.title}
          fileHref={fileHref}
          shareUrl={shareUrl}
          canRead={access.canReadOnline}
          canDownload={access.canDownload}
        />
        <PublicationAccessNotice
          access={access}
          labels={{
            unavailableHeading: t("downloadUnavailable"),
            readOnlyBody: t("downloadReadOnlyBody"),
            rightsBody: t("downloadRightsBody"),
            noFileHeading: t("noFileHeading"),
            noFileBody: t("noFileBody"),
          }}
        />
      </div>
    </header>
  );
}
