import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BreadcrumbNav from "@/components/ui/core/BreadcrumbNav";
import ThesisViewPing from "@/components/ui/theses/ThesisViewPing";
import type { RelatedThesis, ThesisRecord } from "@/lib/theses/record";
import ThesisTitleBlock from "./ThesisTitleBlock";
import AccessPanel from "./AccessPanel";
import FactsGrid from "./FactsGrid";
import SectionNav from "./SectionNav";
import ReadingSection from "./ReadingSection";
import AbstractBlock from "./AbstractBlock";
import ContentsList from "./ContentsList";
import FullTextPreview from "./FullTextPreview";
import ReferenceList from "./ReferenceList";
import CitePanel from "./CitePanel";
import RecordStatus from "./RecordStatus";
import RelatedTheses from "./RelatedTheses";
import ActionDock from "./ActionDock";
import ThesisEditLink from "./ThesisEditLink";

/**
 * The thesis record page, composed from its record (lib/theses/record.ts).
 *
 * Nothing here resolves a label or decides a fact: the record already says
 * which facts exist, which sections have content and what an anonymous reader
 * may do. The viewer's own state arrives in the browser (useThesisAccess), so
 * this markup is the same for every visitor.
 *
 * One grid, two arrangements. Below `lg` it is a single column in reading
 * order: title page → access → facts and the reading card → citation →
 * record status. At `lg` the rail (access + citation) is ONE sticky unit in
 * its own column. The rail wrapper is `display: contents` below `lg`, so its
 * two cards take their places in the column through `order` while each is
 * mounted exactly once — the phone dock watches the access panel's id.
 */
export default function ThesisRecordView({
  record,
  related,
  locale,
  reportEmail,
  seo,
  connections,
}: {
  record: ThesisRecord;
  related: RelatedThesis[];
  locale: "en" | "km";
  reportEmail?: string | null;
  /** JSON-LD, rendered first inside the article. */
  seo?: ReactNode;
  /** Subject and author hubs, after the related theses. */
  connections?: ReactNode;
}) {
  const t = useTranslations("thesisDetail");
  const tNav = useTranslations("nav");
  const has = (id: string) => record.sections.some((s) => s.id === id);

  return (
    // One <article> holding one <h1>. `scroll-smooth` is set here rather than
    // globally so the section anchors glide; it defers to reduced motion.
    <article className="scroll-smooth bg-bg-app pb-24 lg:pb-16">
      {seo}
      <ThesisViewPing id={record.id} />

      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-4 sm:py-5">
          <BreadcrumbNav className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-medium text-text-muted">
            <Link href="/" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">
              {tNav("home")}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-border-strong" aria-hidden="true" />
            <Link href="/theses" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">
              {tNav("theses")}
            </Link>
            {/* The current crumb is the title printed just below it; on a
                phone it would wrap the trail onto a second line. */}
            <ChevronRight className="hidden h-3.5 w-3.5 text-border-strong sm:block" aria-hidden="true" />
            <span aria-current="page" className="hidden max-w-[46ch] truncate text-text-heading sm:inline">
              {record.title.text}
            </span>
          </BreadcrumbNav>
          <ThesisEditLink id={record.id} recordAccess={record.access} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-x-8">
          <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
            <ThesisTitleBlock record={record} />
          </div>

          <div className="contents lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:block lg:max-h-[calc(100dvh-3rem)] lg:space-y-5 lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:p-0.5">
            <div className="order-2 min-w-0">
              <AccessPanel
                id={record.id}
                title={record.title.text}
                recordAccess={record.access}
                path={record.path}
                permalink={record.permalink}
                signInHref={record.signInHref}
                contactHref={record.contactHref}
              />
            </div>
            <div className="order-4 min-w-0">
              <CitePanel citations={record.citations} permalink={record.permalink} />
            </div>
          </div>

          <div className="order-3 min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
            <FactsGrid facts={record.facts} />

            {record.sections.length > 0 && (
              <div>
                <SectionNav sections={record.sections} />
                {/* The reading card: every content section in ONE surface
                    with hairlines between, not a stack of boxes. */}
                <div className="divide-y divide-divider rounded-2xl border border-border bg-bg-surface shadow-sm">
                  {has("abstract") && (
                    <ReadingSection id="abstract" labelledBy="abstract-heading">
                      <AbstractBlock
                        abstract={record.abstract}
                        abstractKm={record.abstractKm}
                        keywords={record.keywords}
                        title={record.title.text}
                        locale={locale}
                      />
                    </ReadingSection>
                  )}
                  {has("contents") && (
                    <ReadingSection id="contents" title={t("sectionContents")} count={record.contents.length}>
                      <ContentsList entries={record.contents} />
                    </ReadingSection>
                  )}
                  {has("full-text") && (
                    <ReadingSection id="full-text" title={t("sectionFullText")}>
                      <FullTextPreview
                        reportId={record.id}
                        title={record.title.text}
                        recordAccess={record.access}
                        signInHref={record.signInHref}
                        reportEmail={reportEmail}
                      />
                    </ReadingSection>
                  )}
                  {has("references") && (
                    <ReadingSection id="references" title={t("sectionReferences")} count={record.references.length}>
                      <ReferenceList references={record.references} />
                    </ReadingSection>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="order-5 min-w-0 lg:col-start-1 lg:row-start-3">
            <RecordStatus
              verifiedAt={record.verifiedAt}
              views={record.metrics.views}
              downloads={record.metrics.downloads}
              reportHref={record.reportHref}
            />
          </div>
        </div>

        <RelatedTheses items={related} />
        {connections}
      </div>

      <ActionDock id={record.id} recordAccess={record.access} signInHref={record.signInHref} />
    </article>
  );
}
