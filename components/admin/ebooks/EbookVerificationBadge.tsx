"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/admin/kit";
import type { EbookListRow } from "@/lib/admin/ebooks-shared";

/**
 * The verification half of a row's status.
 *
 * Rendered only for live records, because that is the only place the stamp
 * has a reader-visible consequence: an unverified published book carries the
 * "not yet verified by library staff" warning on its citation box and is
 * excluded from OAI-PMH. On a draft the same distinction is noise in a dense
 * table — the record isn't asserting anything to anyone yet.
 */
export default function EbookVerificationBadge({ book }: { book: EbookListRow }) {
  const t = useTranslations("adminEbooks.verification");
  if (book.status !== "published") return null;

  return book.verifiedAt ? (
    <Badge tone="success" icon={ShieldCheck} title={t("verifiedTitle")}>
      {t("verified")}
    </Badge>
  ) : (
    <Badge tone="warning" icon={ShieldAlert} title={t("unverifiedTitle")}>
      {t("unverified")}
    </Badge>
  );
}
