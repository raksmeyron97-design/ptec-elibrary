import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { ArticleUtilityActions } from "@/components/ui/publications/article/ArticleActions";
import { EYEBROW } from "@/components/ui/publications/article/styles";

/**
 * The tool column beside the article, from `lg` up.
 *
 * It exists for two reasons. The scholarly one: this is where a reader of ACS,
 * ScienceDirect or Wiley looks for the PDF, the citation and the share
 * controls, so putting them anywhere else costs a hunt. The layout one: the
 * page used to run the masthead across the full 1200 px and then drop to a
 * 760 px column with a rail that began level with the abstract — so the whole
 * top-right of the page was empty, and the grid visibly changed halfway down.
 * The rail now starts at the masthead, and this block is what fills it.
 *
 * The PDF entry is drawn only when `resolveDownloadAccess()` said yes, from the
 * same resolution the file route enforces — the rail can no more advertise a
 * refused download than the header can.
 */
export default async function ArticleToolRail({
  id,
  title,
  shareUrl,
  pdfHref,
}: {
  id: string;
  title: string;
  shareUrl: string;
  /** Null when the reader may not download; no entry is drawn. */
  pdfHref: string | null;
}) {
  const t = await getTranslations("publicationDetail");

  return (
    <div>
      <p className={`mb-2.5 text-text-muted ${EYEBROW}`}>{t("toolsHeading")}</p>
      {pdfHref && (
        <a
          href={pdfHref}
          className="mb-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-brand/30 bg-brand/[0.06] px-3 text-[13.5px] font-bold text-brand transition-colors hover:border-brand hover:bg-brand/10"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("downloadPdf")}
        </a>
      )}
      <ArticleUtilityActions id={id} title={title} shareUrl={shareUrl} orientation="column" />
    </div>
  );
}
