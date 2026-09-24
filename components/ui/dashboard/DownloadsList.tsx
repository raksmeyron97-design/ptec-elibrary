// components/ui/dashboard/DownloadsList.tsx
// My Library → Downloads. Presentational over the array the page already
// fetched (`getMyDownloadHistory()`, shared with Recent Activity).
//
// Replaces components/ui/pwa/DownloadHistory.tsx, which lived in a 288px
// sidebar (titles truncated to "Foundat…") and was English-only: its heading,
// empty state and "3d ago" formatter were string literals, so a Khmer reader
// got English in the middle of a Khmer page. Relative times are computed here,
// on the server, with the same translated buckets as the rest of the page.
import { Link } from "@/i18n/navigation";
import { Download, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import CoverThumb from "@/components/ui/dashboard/CoverThumb";
import type { DownloadHistoryItem } from "@/app/actions/download";
import { formatRelativeTime } from "@/lib/dashboard/relative-time";
import { CARD, EmptyState } from "@/components/ui/dashboard/primitives";

export default async function DownloadsList({ history }: { history: DownloadHistoryItem[] }) {
  const t = await getTranslations("dashboard");

  if (history.length === 0) {
    return (
      <EmptyState
        icon={Download}
        title={t("noDownloadsTitle")}
        description={t("noDownloadsDesc")}
        action={{ href: "/books", label: t("browseCatalogue") }}
      />
    );
  }

  return (
    <ul className={`${CARD} divide-y divide-divider overflow-hidden`}>
      {history.map((item) => (
        <li key={item.bookId}>
          <Link href={`/books/${item.slug}`} className="focus-field group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-paper/60 sm:px-5">
            <CoverThumb width={40} coverUrl={item.coverUrl} title={item.title} author={item.author} seed={item.slug} />
            <span className="min-w-0 flex-1" dir="auto">
              <span className="block truncate text-[14px] font-semibold text-text-heading group-hover:text-brand">{item.title}</span>
              <span className="block truncate text-[12.5px] text-text-muted">{item.author}</span>
            </span>
            <time dateTime={item.downloadedAt} className="shrink-0 text-[12px] text-text-muted">
              {formatRelativeTime(item.downloadedAt, t)}
            </time>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand motion-reduce:transition-none rtl:rotate-180" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
