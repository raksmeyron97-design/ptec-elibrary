import { getTranslations } from "next-intl/server";
import AccessBadge from "@/components/ui/publications/AccessBadge";
import PublicationAccessNotice from "@/components/ui/publications/PublicationAccessNotice";
import ArticleAuthors from "@/components/ui/publications/article/ArticleAuthors";
import ArticleActions from "@/components/ui/publications/article/ArticleActions";
import ArticleDoi from "@/components/ui/publications/article/ArticleDoi";
import { EYEBROW, KHMER_RE } from "@/components/ui/publications/article/styles";
import { secondaryValue } from "@/lib/publications/integrity";
import type { DownloadAccess } from "@/lib/publications/access";
import type { Publication, PublicationAuthorship } from "@/lib/publications";
import type { NumberedAffiliation } from "@/lib/publications/article-layout";

export const ARTICLE_TITLE_ID = "article-title";

/**
 * The journal article's masthead — compact, so the abstract starts on the
 * first screen (articles redesign, 2026-10-02).
 *
 * Measured before: the header block was 928 px tall at 1440×1000 and the
 * abstract began at 1,158 px (1,566 px on a 375×812 phone). It stacked a back
 * link, a journal block, an eyebrow, a display-size title, numbered
 * affiliations, a corresponding-author line, a five-row identity list, a view
 * count, the buttons and an access notice box. Now:
 *
 *   type · title · translated title · authors (affiliations folded) ·
 *   ONE citation line · ONE line of DOI / access / date · the primary action
 *   and one line saying how the reader gets the text.
 *
 * Journal and issue are no longer restated here: the page's visible
 * breadcrumb names them (and links them), and "Publication details" at the
 * end of the article carries every remaining fact. Previous / next stay at
 * the end of the article, where a reader who finished it looks.
 *
 * Everything here is a fact the record carries; a missing DOI, date or
 * affiliation removes its piece, and nothing is filled in.
 */
export default async function ArticleHeader({
  pub,
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
  publisherHref,
}: {
  pub: Publication;
  typeLabel: string;
  authorships: PublicationAuthorship[];
  markerFor: Map<string, number>;
  affiliations: NumberedAffiliation[];
  fallbackNames: string[];
  citationLine: string;
  /** Already formatted in the reader's locale. */
  dates: { published: string | null };
  /** From publicationMetrics(): null means "do not show", never zero. */
  counts: { views: number | null; downloads: number | null };
  doi: { value: string; href: string } | null;
  access: DownloadAccess;
  fileHref: string;
  shareUrl: string;
  /**
   * Where a CITATION-ONLY record's full text lives — its DOI, else the
   * article's page at the publisher (0167). Null when the library holds the
   * file, or when the record links nowhere.
   */
  publisherHref: string | null;
}) {
  const t = await getTranslations("publicationDetail");
  const translatedTitle = secondaryValue(pub.title, pub.title_km);
  // The title's own language, so hyphenation and the screen-reader voice
  // follow the words rather than the page: an English title on /km is still
  // English.
  const titleLang = KHMER_RE.test(pub.title) ? "km" : pub.language && pub.language !== "km" ? pub.language : "en";
  // A step below the old display sizes (42 / 38 / 34 px at lg): a 125-character
  // title was four lines at 38 px. The title is never truncated, so a very long
  // one steps down again rather than filling a screen.
  const titleSize =
    pub.title.length > 200
      ? "text-[22px] sm:text-[26px] lg:text-[28px]"
      : pub.title.length > 120
        ? "text-[23px] sm:text-[28px] lg:text-[32px]"
        : "text-[24px] sm:text-[31px] lg:text-[35px]";

  return (
    <header id="publication-masthead" className="scroll-mt-24">
      {/* ── What is this ── */}
      <p className={`text-accent-text ${EYEBROW}`}>{typeLabel}</p>
      <h1
        id={ARTICLE_TITLE_ID}
        lang={titleLang}
        className={`mt-1.5 max-w-[980px] text-balance break-words font-khmer-serif font-bold leading-[1.22] tracking-[-0.01em] text-text-heading hyphens-auto [&:lang(km)]:leading-[1.55] [&:lang(km)]:tracking-normal ${titleSize}`}
      >
        {pub.title}
      </h1>
      {/* A sibling, never a second <h1>; lang makes a screen reader switch
          voice instead of reading Khmer with an English engine. */}
      {translatedTitle && (
        <p
          lang={KHMER_RE.test(translatedTitle) ? "km" : "en"}
          className="mt-2 max-w-[980px] font-khmer-serif text-[16px] leading-[1.7] text-text-muted sm:text-[17px]"
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

      {/* ── Where it appeared: one citation line, one line of identifiers ── */}
      {(citationLine || doi || dates.published) && (
        <div className="mt-4 space-y-1 border-t border-divider pt-3">
          {citationLine && (
            <p className="text-[14.5px] leading-6 text-text-body">
              <span className="sr-only">{t("fieldCiteThis")}: </span>
              <cite className="not-italic">{citationLine}</cite>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-text-muted">
            {doi && <ArticleDoi doi={doi.value} href={doi.href} />}
            <AccessBadge
              license={pub.license}
              labels={{
                openAccess: t("openAccess"),
                licensed: t("accessLicensed"),
                rightsUnstated: t("accessRightsUnstated"),
              }}
            />
            {dates.published && (
              <span>
                {t("fieldPublished")} {dates.published}
              </span>
            )}
            {/* Usage is not identity, but it costs no line of its own here.
                publicationMetrics() returns null rather than zero, so a record
                nobody has opened yet says nothing. */}
            {counts.views !== null && <span>{t("srViews", { count: counts.views })}</span>}
            {counts.downloads !== null && <span>{t("srDownloads", { count: counts.downloads })}</span>}
          </div>
        </div>
      )}

      {/* ── How do I read it ── */}
      <div className="mt-4">
        <ArticleActions
          id={pub.id}
          title={pub.title}
          fileHref={fileHref}
          shareUrl={shareUrl}
          canRead={access.canReadOnline}
          canDownload={access.canDownload}
          publisherHref={publisherHref}
        />
        <PublicationAccessNotice
          access={access}
          citationOnly={!!publisherHref}
          labels={{
            unavailableHeading: t("downloadUnavailable"),
            readOnlyBody: t("downloadReadOnlyBody"),
            rightsBody: t("downloadRightsNote"),
            noFileHeading: t("noFileHeading"),
            noFileBody: t("noFileBody"),
            citationOnlyBody: t("citationOnlyNote"),
          }}
        />
      </div>
    </header>
  );
}
