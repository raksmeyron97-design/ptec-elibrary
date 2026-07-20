import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpen, SearchX, Plus } from "lucide-react";
import { EmptyState } from "@/components/admin/kit";

export function EbookEmptyState() {
  const t = useTranslations("adminEbooks.states");
  return (
    <EmptyState
      icon={<BookOpen className="h-6 w-6" />}
      title={t("emptyTitle")}
      description={t("emptyBody")}
      action={
        <Link
          href="/admin/upload"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("uploadCta")}
        </Link>
      }
    />
  );
}

export function EbookNoResultsState() {
  const t = useTranslations("adminEbooks.states");
  return (
    <EmptyState
      icon={<SearchX className="h-6 w-6" />}
      title={t("noResultsTitle")}
      description={t("noResultsBody")}
      action={
        <Link
          href="/admin/manage"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper"
        >
          {t("clearFilters")}
        </Link>
      }
    />
  );
}
