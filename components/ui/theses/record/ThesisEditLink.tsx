"use client";

// Plain next/link, not the locale-aware one: /admin is outside the locale
// scheme and the i18n Link would prefix it with /km.
import NextLink from "next/link";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ThesisAccess } from "@/lib/theses/access";
import { useThesisAccess } from "./useThesisAccess";

/**
 * Staff only: a link to this thesis's admin edit page.
 *
 * The page is shared-cached, so the link cannot be decided by a server
 * session read. It is drawn when the private status route says the admin
 * registry's `theses.edit` policy would let this viewer in — the same question
 * the edit page's own guard asks — and is absent for everyone else.
 */
export default function ThesisEditLink({ id, recordAccess }: { id: string; recordAccess: ThesisAccess }) {
  const t = useTranslations("thesisDetail");
  const { canEdit } = useThesisAccess(id, recordAccess);
  if (!canEdit) return null;
  return (
    <NextLink
      href={`/admin/theses/edit/${id}`}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-[12.5px] font-medium text-text-muted transition-colors duration-150 hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      {t("editThesis")}
    </NextLink>
  );
}
