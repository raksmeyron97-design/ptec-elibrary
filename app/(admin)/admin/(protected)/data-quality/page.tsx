import Link from "next/link";
import { Gauge, BookOpen, GraduationCap, Pencil, LinkIcon } from "lucide-react";
import { getMetadataGaps, getDataQualitySummary, getBrokenFiles } from "@/app/actions/data-quality";

export const dynamic = "force-dynamic";

function completenessColor(pct: number): string {
  if (pct >= 80) return "text-green-700 bg-green-100";
  if (pct >= 50) return "text-yellow-800 bg-yellow-100";
  return "text-red-700 bg-red-100";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default async function DataQualityPage() {
  const [summary, gaps, brokenFiles] = await Promise.all([
    getDataQualitySummary(),
    getMetadataGaps(),
    getBrokenFiles(),
  ]);

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <Gauge className="h-6 w-6 text-brand" />
          <h1 className="text-[22px] font-bold text-text-heading">Data Quality</h1>
        </div>
        <p className="mt-1 max-w-[65ch] text-[13px] text-text-muted">
          Metadata completeness and broken-file checks across published books and theses.
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted"><BookOpen className="h-3.5 w-3.5" /> Books</p>
          <p className="mt-2 text-[28px] font-bold text-text-heading">{summary.avgBookCompleteness}%</p>
          <p className="text-[11.5px] text-text-muted">avg. completeness · {summary.totalBooks} published</p>
        </div>
        <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted"><GraduationCap className="h-3.5 w-3.5" /> Theses</p>
          <p className="mt-2 text-[28px] font-bold text-text-heading">{summary.avgThesisCompleteness}%</p>
          <p className="text-[11.5px] text-text-muted">avg. completeness · {summary.totalTheses} published</p>
        </div>
        <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm sm:col-span-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted"><LinkIcon className="h-3.5 w-3.5" /> Broken Files</p>
          <p className="mt-2 text-[28px] font-bold text-text-heading">{summary.brokenFileCount}</p>
          <p className="text-[11.5px] text-text-muted">
            last checked {timeAgo(summary.fileHealthCheckedAt)} — run <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px]">npx tsx scripts/check-file-health.ts</code> to refresh
          </p>
        </div>
      </div>

      {/* Metadata gaps */}
      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-bold text-text-heading">Metadata Gaps (worst first)</h2>
        {gaps.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface py-12 text-center text-[13.5px] text-text-muted">
            Every published book and thesis has complete metadata. 🎉
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {gaps.map((g) => (
              <div key={`${g.type}-${g.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-divider bg-bg-surface p-3.5 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${completenessColor(g.completeness)}`}>
                      {g.completeness}%
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      {g.type === "book" ? "E-Book" : "Thesis"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[14px] font-semibold text-text-heading">{g.title}</p>
                  <p className="mt-0.5 text-[12px] text-text-muted">Missing: {g.missingFields.join(", ")}</p>
                </div>
                <Link
                  href={g.editUrl}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-[12px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Broken files */}
      {brokenFiles.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-bold text-text-heading">Broken Files</h2>
          <div className="flex flex-col gap-2.5">
            {brokenFiles.map((f) => (
              <div key={`${f.recordType}-${f.recordId}-${f.field}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-text-heading">{f.title ?? "(deleted record)"}</p>
                  <p className="mt-0.5 truncate text-[12px] text-red-700">
                    {f.field === "file_url" ? "PDF" : "Cover"} · {f.httpStatus ?? "unreachable"} · {f.url}
                  </p>
                </div>
                <Link
                  href={f.editUrl}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100"
                >
                  <Pencil className="h-3.5 w-3.5" /> Fix
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
