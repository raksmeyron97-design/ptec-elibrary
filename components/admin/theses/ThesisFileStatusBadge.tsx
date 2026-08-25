import { useTranslations } from "next-intl";
import { FileCheck2, FileX2, ImageIcon, ImageOff } from "lucide-react";

/** Spec section 28: PDF ready = green, Missing PDF = red, Cover missing = orange. */
export default function ThesisFileStatusBadge({ hasPdf, hasCover }: { hasPdf: boolean; hasCover: boolean }) {
  const t = useTranslations("adminTheses.fileStatus");
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          hasPdf
            ? "border border-success-line bg-success-soft text-success-text"
            : "border border-danger-line bg-danger-soft text-danger-text"
        }`}
      >
        {hasPdf ? <FileCheck2 className="h-3 w-3" /> : <FileX2 className="h-3 w-3" />}
        {hasPdf ? t("has_pdf") : t("missing_pdf")}
      </span>
      {!hasCover && (
        <span className="inline-flex items-center gap-1 rounded-full border border-warning-line bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-text">
          <ImageOff className="h-3 w-3" /> {t("missing_cover")}
        </span>
      )}
      {hasCover && (
        <span className="sr-only inline-flex items-center gap-1 text-[11px] text-success-text">
          <ImageIcon className="h-3 w-3" /> {t("coverPresent")}
        </span>
      )}
    </div>
  );
}
