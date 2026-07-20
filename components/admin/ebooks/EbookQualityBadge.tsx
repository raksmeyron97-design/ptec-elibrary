import { useTranslations } from "next-intl";
import {
  scoreEbookQuality,
  METADATA_TIER_STYLES,
  type EbookQualityInput,
} from "@/lib/admin/ebook-quality";

/**
 * Small completeness badge. Color is never the only signal — the label
 * always renders alongside it — and a visually-hidden sentence gives screen
 * readers the missing-field detail the sighted tooltip shows.
 */
export default function EbookQualityBadge({ book }: { book: EbookQualityInput }) {
  const t = useTranslations("adminEbooks.qualityBadge");
  const tQuality = useTranslations("adminEbooks.quality");
  const { score, tier, missing } = scoreEbookQuality(book);
  const missingLabel = missing.length ? t("missing", { fields: missing.map((m) => m.label).join(", ") }) : t("complete");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${METADATA_TIER_STYLES[tier]}`}
      title={missingLabel}
    >
      {tQuality(tier)} · {score}%
      <span className="sr-only">. {missingLabel}.</span>
    </span>
  );
}
