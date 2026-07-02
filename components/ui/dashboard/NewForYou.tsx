import Link from "next/link";
import { Bell, BookOpen, ChevronRight } from "lucide-react";
import type { NewContentAlert } from "@/app/actions/subscriptions";

const COVERS = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

function coverUrl(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS}/${raw}`;
}

export default function NewForYou({ alerts }: { alerts: NewContentAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="mx-auto max-w-[1300px] px-4 pt-4 sm:px-8 md:px-12">
      <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4 text-brand flex-none" />
          <p className="text-[13px] font-bold text-text-heading">New for You</p>
          <span className="ml-auto text-[11px] text-text-muted">Based on your subscriptions</span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {alerts.map(alert => {
            const url = coverUrl(alert.cover_url);
            return (
              <Link
                key={alert.book_id}
                href={`/books/${alert.slug}`}
                className="flex-none flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-3 py-2.5 hover:border-brand/30 hover:shadow-sm transition-all max-w-[240px] min-w-[180px]"
              >
                <div className="h-10 w-7 rounded-md overflow-hidden flex-none bg-brand/10 flex items-center justify-center">
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <BookOpen className="h-4 w-4 text-brand/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-brand font-semibold truncate leading-tight">{alert.matched_label}</p>
                  <p className="text-[12.5px] font-semibold text-text-heading truncate">{alert.title}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-text-muted flex-none" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
