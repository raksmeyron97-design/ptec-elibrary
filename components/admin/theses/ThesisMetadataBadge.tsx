import { scoreMetadataQuality, METADATA_TIER_LABELS, METADATA_TIER_STYLES, type MetadataQualityInput } from "@/lib/admin/thesis-metadata-quality";

/**
 * Small completeness badge (spec section 5). Color is never the only signal
 * — the label always renders alongside it — and a visually-hidden sentence
 * gives screen readers the missing-field detail the sighted tooltip shows.
 */
export default function ThesisMetadataBadge({ thesis }: { thesis: MetadataQualityInput }) {
  const { score, tier, missing } = scoreMetadataQuality(thesis);
  const missingLabel = missing.length ? `Missing: ${missing.map((m) => m.label).join(", ")}` : "All fields complete";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${METADATA_TIER_STYLES[tier]}`}
      title={missingLabel}
    >
      {METADATA_TIER_LABELS[tier]} · {score}%
      <span className="sr-only">. {missingLabel}.</span>
    </span>
  );
}
