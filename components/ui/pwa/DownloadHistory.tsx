// components/ui/DownloadHistory.tsx
// Server component — fetch + render download history for the current user.
// Drop this inside the dashboard page alongside the Saved/In-Progress sections.

import Link from "next/link";
import Image from "next/image";
import { getMyDownloadHistory } from "@/app/actions/download";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function DownloadHistory() {
  const history = await getMyDownloadHistory();

  return (
    <div id="downloads" className="scroll-mt-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold text-text-heading">
          Download History
          {history.length > 0 && (
            <span className="ml-2 text-base font-normal text-text-muted">({history.length})</span>
          )}
        </h2>
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-bg-surface py-12 text-center">
          <svg className="mb-3 h-10 w-10 text-text-muted" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v13m0 0-4-4m4 4 4-4" /><path d="M4 20h16" />
          </svg>
          <h3 className="text-sm font-semibold text-text-body">No downloads yet</h3>
          <p className="mt-1 text-xs text-text-muted">
            Books you download will appear here.
          </p>
          <Link href="/books"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-blue-950 px-5 text-sm font-semibold text-white transition hover:bg-brand">
            Browse Catalogue
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
          <ul className="divide-y divide-slate-50">
            {history.map((item) => (
              <li key={item.bookId}>
                <Link
                  href={`/books/${item.slug}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-paper"
                >
                  {/* Cover thumbnail */}
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md shadow-sm">
                    {item.coverUrl ? (
                      <Image
                        src={item.coverUrl}
                        alt={item.title}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className={`h-full w-full ${item.cover} flex items-end justify-center pb-1`}>
                        <span className="text-[7px] font-bold text-white/70 text-center leading-tight px-0.5 line-clamp-2">
                          {item.title}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-heading">{item.title}</p>
                    <p className="text-xs text-text-muted">{item.author}</p>
                  </div>

                  {/* Time */}
                  <span className="shrink-0 text-xs text-text-muted">{timeAgo(item.downloadedAt)}</span>

                  {/* Arrow */}
                  <svg className="h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}