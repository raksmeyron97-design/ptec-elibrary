import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/admin/kit";
import { scoreEbookQuality, type EbookQualityInput } from "@/lib/admin/ebook-quality";

/**
 * Metadata completeness, as a row flag rather than a column.
 *
 * It used to be a per-row percentage in its own sortable column, which cost
 * horizontal space on every row to say "fine" about most of them. Only the
 * two tiers that need action (needs_review, incomplete) render here; the
 * score still sorts and filters from the command bar, and the tooltip plus
 * the screen-reader sentence carry the missing-field detail.
 *
 * Colour is never the only signal — the tier label always renders with it.
 */
export default function EbookQualityBadge({ book }: { book: EbookQualityInput }) {
  const t = useTranslations("adminEbooks.qualityBadge");
  const tQuality = useTranslations("adminEbooks.quality");
  const { score, tier, missing } = scoreEbookQuality(book);

  if (tier !== "needs_review" && tier !== "incomplete") return null;

  const missingLabel = missing.length ? t("missing", { fields: missing.map((m) => m.label).join(", ") }) : t("complete");

  return (
    <Badge tone={tier === "incomplete" ? "danger" : "warning"} icon={AlertTriangle} title={missingLabel}>
      {tQuality(tier)} · <span className="tabular-nums">{score}%</span>
      <span className="sr-only">. {missingLabel}.</span>
    </Badge>
  );
}
