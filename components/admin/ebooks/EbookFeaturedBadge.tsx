"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/admin/kit";
import type { EbookListRow } from "@/lib/admin/ebooks-shared";

/**
 * The curation half of a row's state — "Featured by PTEC Library" (0149).
 *
 * The third axis, beside publication and verification, and drawn only when it
 * is true: a row that says "Not featured" on every one of 270 books teaches a
 * librarian to stop reading the column. It carries the position, because
 * "Featured 03" is the fact they read back to a colleague, and the word
 * "Featured" rather than a bare star so the state is never colour-or-icon
 * only.
 */
export default function EbookFeaturedBadge({ book }: { book: EbookListRow }) {
  const t = useTranslations("adminEbooks.featuredFilter");
  if (!book.featuredAt) return null;

  return (
    <Badge tone="brand" icon={Sparkles} title={t("badgeTitle")}>
      {book.featuredPosition
        ? t("badgeWithPosition", { position: book.featuredPosition })
        : t("featured")}
    </Badge>
  );
}
