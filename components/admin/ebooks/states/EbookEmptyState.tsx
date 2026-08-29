import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpen, SearchX, Plus } from "lucide-react";
import { EmptyState } from "@/components/admin/kit";
import { EBOOKS_BASE_PATH, EBOOKS_UPLOAD_PATH } from "@/lib/admin/ebooks-url";

/** Nothing has ever been uploaded — the one case that gets a primary action. */
export function EbookEmptyState() {
  const t = useTranslations("adminEbooks.states");
  return (
    <EmptyState
      icon={<BookOpen className="h-7 w-7" />}
      title={t("emptyTitle")}
      description={t("emptyBody")}
      action={
        <Link
          href={EBOOKS_UPLOAD_PATH}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-medium text-brand-contrast shadow-sm transition duration-150 hover:-translate-y-px hover:bg-brand-hover hover:shadow-md active:translate-y-0 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("uploadCta")}
        </Link>
      }
    />
  );
}

/**
 * Books exist, the filters just excluded them all. The way out is a text
 * button, not a second primary — the librarian's next move is to widen the
 * search, not to upload something.
 */
export function EbookNoResultsState() {
  const t = useTranslations("adminEbooks.states");
  return (
    <EmptyState
      icon={<SearchX className="h-7 w-7" />}
      title={t("noResultsTitle")}
      description={t("noResultsBody")}
      action={
        <Link
          href={EBOOKS_BASE_PATH}
          className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-brand transition-colors duration-150 hover:bg-surface-brand-soft"
        >
          {t("clearFilters")}
        </Link>
      }
    />
  );
}
