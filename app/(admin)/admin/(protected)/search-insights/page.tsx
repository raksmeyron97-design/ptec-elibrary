import { SearchX } from "lucide-react";
import { getZeroResultSearches } from "@/app/actions/search-insights";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function SearchInsightsPage() {
  const queries = await getZeroResultSearches();

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <SearchX className="h-6 w-6 text-brand" />
          <h1 className="text-[22px] font-bold text-text-heading">Zero-Result Searches</h1>
        </div>
        <p className="mt-1 max-w-[65ch] text-[13px] text-text-muted">
          What visitors searched for in the last 30 days that returned nothing — a direct signal for what
          to acquire or catalog next. Sorted by how often each term was searched.
        </p>
      </div>

      {queries.length === 0 ? (
        <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
          <SearchX className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
          <p className="text-[14px] font-semibold text-text-muted">No zero-result searches recorded</p>
          <p className="mt-1 text-[12.5px] text-text-muted">
            Either everything is being found, or migration 0064 was just applied and data hasn&apos;t accumulated yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-divider bg-paper/60 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Search term</th>
                <th className="px-4 py-3">Times searched</th>
                <th className="px-4 py-3">Last searched</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q) => (
                <tr key={q.term} className="border-b border-divider/60 last:border-0">
                  <td className="px-4 py-3 font-semibold text-text-heading">{q.term}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[12px] font-bold text-brand">
                      {q.count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{timeAgo(q.lastSearchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
