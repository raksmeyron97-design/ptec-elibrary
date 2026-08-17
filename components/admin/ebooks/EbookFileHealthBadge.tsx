import { useTranslations } from "next-intl";
import { FileX2, FileWarning, ImageOff, Scale } from "lucide-react";
import { Badge } from "@/components/admin/kit";
import { LARGE_FILE_KB, type EbookListRow } from "@/lib/admin/ebooks-shared";

/**
 * PDF + cover problems only.
 *
 * This used to render a green "PDF ready" badge on every healthy row, which
 * put a colour on ~95% of the table and left the genuinely broken rows with
 * nothing to stand out against. Now a clean row means healthy, and colour
 * appears only where the librarian has work to do.
 *
 * "Broken" states come from the file_health table (populated by the
 * out-of-band checker behind /admin/data-quality), so the absence of a badge
 * means "present", not "verified this second". Returns null when there is
 * nothing wrong, which is what lets the row's flag strip collapse entirely.
 */
export default function EbookFileHealthBadge({ book }: { book: EbookListRow }) {
  const t = useTranslations("adminEbooks.fileHealth");
  const hasPdf = Boolean(book.fileUrl);
  const hasCover = Boolean(book.coverUrl);
  const isLarge = (book.fileSizeKb ?? 0) >= LARGE_FILE_KB;

  const flags: React.ReactNode[] = [];

  if (book.fileBroken) {
    flags.push(<Badge key="file" tone="danger" icon={FileWarning}>{t("brokenFile")}</Badge>);
  } else if (!hasPdf) {
    flags.push(<Badge key="file" tone="danger" icon={FileX2}>{t("missingPdf")}</Badge>);
  }

  if (book.coverBroken) {
    flags.push(<Badge key="cover" tone="danger" icon={ImageOff}>{t("brokenCover")}</Badge>);
  } else if (!hasCover) {
    flags.push(<Badge key="cover" tone="warning" icon={ImageOff}>{t("noCover")}</Badge>);
  }

  if (isLarge) {
    flags.push(<Badge key="size" tone="warning" icon={Scale}>{t("largeFile")}</Badge>);
  }

  return flags.length > 0 ? <>{flags}</> : null;
}
