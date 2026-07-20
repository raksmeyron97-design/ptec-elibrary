import { useTranslations } from "next-intl";
import { FileCheck2, FileX2, FileWarning, ImageOff, Scale } from "lucide-react";
import { LARGE_FILE_KB, type EbookListRow } from "@/lib/admin/ebooks-shared";

const good = "bg-emerald-50 text-emerald-700 border border-emerald-200";
const bad = "bg-red-50 text-red-700 border border-red-200";
const warn = "bg-orange-50 text-orange-700 border border-orange-200";
const amber = "bg-amber-50 text-amber-700 border border-amber-200";

function Badge({ tone, icon: Icon, label }: { tone: string; icon: typeof FileCheck2; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * PDF + cover health at a glance. "Broken" states come from the file_health
 * table (populated by the out-of-band checker behind /admin/data-quality),
 * so an OK badge means "present", not "verified this second".
 */
export default function EbookFileHealthBadge({ book }: { book: EbookListRow }) {
  const t = useTranslations("adminEbooks.fileHealth");
  const hasPdf = Boolean(book.fileUrl);
  const hasCover = Boolean(book.coverUrl);
  const isLarge = (book.fileSizeKb ?? 0) >= LARGE_FILE_KB;

  return (
    <div className="flex flex-col items-start gap-1">
      {book.fileBroken ? (
        <Badge tone={bad} icon={FileWarning} label={t("brokenFile")} />
      ) : hasPdf ? (
        <Badge tone={good} icon={FileCheck2} label={t("pdfReady")} />
      ) : (
        <Badge tone={bad} icon={FileX2} label={t("missingPdf")} />
      )}
      {book.coverBroken ? (
        <Badge tone={bad} icon={ImageOff} label={t("brokenCover")} />
      ) : !hasCover ? (
        <Badge tone={warn} icon={ImageOff} label={t("noCover")} />
      ) : (
        <span className="sr-only">{t("coverPresent")}</span>
      )}
      {isLarge && <Badge tone={amber} icon={Scale} label={t("largeFile")} />}
    </div>
  );
}
