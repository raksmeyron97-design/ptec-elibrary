import { getTranslations } from "next-intl/server";
import BackToTopButton from "@/components/ui/detail/BackToTopButton";
import CitePublication from "@/components/ui/publications/CitePublication";
import PublicationMetadataCard from "@/components/ui/publications/PublicationMetadataCard";
import type { Publication } from "@/lib/publications";
import SubjectList from "@/components/ui/detail/SubjectList";
import KeywordList from "@/components/ui/detail/KeywordList";

/**
 * The record rail: what a reader needs to *judge and cite* the work, and
 * nothing that appears elsewhere on the page.
 *
 * Three blocks were removed rather than restyled, because each was a second
 * copy of something the masthead already said:
 *
 *   • the cover        → moved into the masthead, beside the title it depicts
 *   • "Quick Actions"  → the same four controls as the masthead; Download now
 *                        reappears in the sticky section nav on scroll instead
 *   • MetricsPanel     → the same views/downloads figures as the masthead
 *                        strip, in emerald/amber tiles that matched nothing
 *                        else on the page
 *
 * What remains is ordered by scholarly value: the facts of the record, then
 * the citation builder, then the subject links out.
 */
export default async function PublicationSidebar({
  pub,
  publishedOn,
  year,
}: {
  pub: Publication;
  publishedOn: string | null;
  year: string | null;
}) {
  const t = await getTranslations("publicationDetail");
  return (
    <div className="space-y-5">
      {/* Publication information — the "details" anchor points here. */}
      <div id="details" className="scroll-mt-24 lg:scroll-mt-36">
        <PublicationMetadataCard pub={pub} publishedOn={publishedOn} year={year} />
      </div>

      {/* Cite this */}
      <div id="cite-panel" className="scroll-mt-24 lg:scroll-mt-36">
        <CitePublication publication={pub} />
      </div>

      {/* Subjects + keywords: filter links into the listing, not dead text.
          Subjects are the controlled vocabulary and read as brand-filled
          chips; keywords are the author's own terms and stay outlined, so the
          two clouds are told apart by more than their headings. */}
      {(pub.subjects.length > 0 || pub.keywords.length > 0) && (
        <div className="space-y-4 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
          <SubjectList
            subjects={pub.subjects}
            basePath="/publications"
            heading={t("subjectsHeading")}
          />
          {pub.subjects.length > 0 && pub.keywords.length > 0 && (
            <hr className="border-divider/70" />
          )}
          <KeywordList
            keywords={pub.keywords}
            basePath="/publications"
            heading={t("researchAreasKeywords")}
          />
        </div>
      )}

      {/* Desktop only. The rail is sticky there, so this stays reachable at
          any scroll depth — which is what a "back to top" is for. On mobile
          the rail is spliced in after the abstract, where the same button
          would sit roughly a third of the way down with the whole article
          still below it. */}
      <div className="hidden lg:block">
        <BackToTopButton label={t("backToTop")} />
      </div>
    </div>
  );
}
