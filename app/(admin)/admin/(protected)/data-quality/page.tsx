import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileWarning,
  Gauge,
  GraduationCap,
  LinkIcon,
  Pencil,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import { getMetadataGaps, getDataQualitySummary, getBrokenFiles } from "@/app/actions/data-quality";

export const dynamic = "force-dynamic";

function completenessStyle(pct: number): string {
  if (pct >= 80) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (pct >= 50) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">{label}</p>
        <span className="text-brand">{icon}</span>
      </div>
      <p className="mt-3 text-[28px] font-bold tabular-nums text-text-heading">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-text-muted">{detail}</p>
    </div>
  );
}

export default async function DataQualityPage() {
  const [summary, gaps, brokenFiles] = await Promise.all([
    getDataQualitySummary(),
    getMetadataGaps(),
    getBrokenFiles(),
  ]);

  const totalRecords = summary.totalBooks + summary.totalTheses;
  const averageCompleteness = totalRecords > 0
    ? Math.round(
        (summary.avgBookCompleteness * summary.totalBooks
          + summary.avgThesisCompleteness * summary.totalTheses) / totalRecords,
      )
    : 100;
  const healthyFiles = Math.max(
    0,
    summary.checkedFileCount - summary.brokenFileCount - summary.unknownFileCount,
  );
  const percent = (count: number) => summary.checkedFileCount > 0
    ? (count / summary.checkedFileCount) * 100
    : 0;
  const urgentCount = brokenFiles.length + gaps.filter((gap) => gap.completeness < 50).length;

  return (
    <main className="p-5 md:p-8 xl:p-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Gauge className="h-6 w-6 text-brand" />
            <h1 className="text-[22px] font-bold text-text-heading">Data quality</h1>
          </div>
          <p className="mt-1 max-w-[68ch] text-[13px] leading-5 text-text-muted">
            Inspect published records, repair missing metadata, and resolve files that readers cannot open.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
          urgentCount > 0
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          {urgentCount > 0 ? <ShieldAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {urgentCount > 0 ? `${urgentCount} urgent repairs` : "No urgent repairs"}
        </div>
      </header>

      {!summary.metadataAvailable && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-[12.5px] font-semibold">Metadata quality could not be calculated</p>
            <p className="mt-0.5 text-[11.5px] text-amber-800">Check the database connection and schema before treating this dashboard as a clean result.</p>
          </div>
        </div>
      )}

      <section aria-labelledby="collection-health-title" className="mb-6 overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <div className="grid lg:grid-cols-[1.25fr_1fr]">
          <div className="border-b border-divider p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Collection health</p>
                <h2 id="collection-health-title" className="mt-1 text-[18px] font-bold text-text-heading">
                  {averageCompleteness}% metadata completeness
                </h2>
              </div>
              <Sparkles className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-paper" aria-label={`${averageCompleteness}% average metadata completeness`} role="img">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${averageCompleteness}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11.5px] text-text-muted">
              <span>{summary.metadataIssueCount} of {totalRecords} records need metadata</span>
              <span>{totalRecords - summary.metadataIssueCount} complete</span>
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">File sweep</p>
                <p className="mt-1 text-[14px] font-semibold text-text-heading">
                  {summary.fileHealthAvailable ? `${summary.checkedFileCount} links checked` : "Health checks unavailable"}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-muted">
                <Clock3 className="h-3.5 w-3.5" /> {timeAgo(summary.fileHealthCheckedAt)}
              </span>
            </div>
            {summary.fileHealthAvailable && summary.checkedFileCount > 0 ? (
              <>
                <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-paper" role="img" aria-label={`${healthyFiles} healthy, ${summary.unknownFileCount} unknown, ${summary.brokenFileCount} broken file links`}>
                  <div className="bg-emerald-500" style={{ width: `${percent(healthyFiles)}%` }} />
                  <div className="bg-amber-400" style={{ width: `${percent(summary.unknownFileCount)}%` }} />
                  <div className="bg-rose-500" style={{ width: `${percent(summary.brokenFileCount)}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-muted">
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />{healthyFiles} healthy</span>
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />{summary.unknownFileCount} unknown</span>
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500" />{summary.brokenFileCount} broken</span>
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-paper px-3 py-2.5 text-[12px] leading-5 text-text-muted">
                {summary.fileHealthAvailable
                  ? "No file links have been checked yet. Run a sweep to establish a baseline."
                  : "Apply the file-health migration before running a link sweep."}
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Quality metrics" className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<BookOpen className="h-4 w-4" />} label="Books" value={`${summary.avgBookCompleteness}%`} detail={`${summary.totalBooks} published records`} />
        <MetricCard icon={<GraduationCap className="h-4 w-4" />} label="Theses" value={`${summary.avgThesisCompleteness}%`} detail={`${summary.totalTheses} published records`} />
        <MetricCard icon={<Wrench className="h-4 w-4" />} label="Metadata queue" value={summary.metadataIssueCount} detail="Published records needing edits" />
        <MetricCard icon={<LinkIcon className="h-4 w-4" />} label="Broken links" value={summary.brokenFileCount} detail={`Last sweep ${timeAgo(summary.fileHealthCheckedAt)}`} />
      </section>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section aria-labelledby="metadata-gaps-title" className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
            <div>
              <h2 id="metadata-gaps-title" className="text-[15px] font-bold text-text-heading">Metadata repair queue</h2>
              <p className="mt-1 text-[12px] text-text-muted">Lowest completeness first, so high-impact edits stay at the top.</p>
            </div>
            {summary.metadataIssueCount > 0 && (
              <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                Showing {Math.min(gaps.length, 30)} of {summary.metadataIssueCount}
              </span>
            )}
          </div>

          {gaps.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
              <p className="mt-3 text-[14px] font-semibold text-text-heading">Published metadata is complete</p>
              <p className="mt-1 text-[12px] text-text-muted">New gaps will appear here automatically.</p>
            </div>
          ) : (
            <ol className="divide-y divide-divider">
              {gaps.map((gap) => (
                <li key={`${gap.type}-${gap.id}`} className="group p-4 transition hover:bg-paper/60 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold tabular-nums ${completenessStyle(gap.completeness)}`}>
                      {gap.completeness}%
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 truncate text-[13.5px] font-semibold text-text-heading">{gap.title}</p>
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
                          {gap.type === "book" ? "E-book" : "Thesis"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {gap.missingFields.map((field) => (
                          <span key={field} className="rounded-md bg-paper px-2 py-1 text-[11px] text-text-muted">{field}</span>
                        ))}
                      </div>
                    </div>
                    <Link
                      href={gap.editUrl}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      aria-label={`Edit metadata for ${gap.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside aria-labelledby="broken-files-title" className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="border-b border-divider p-5">
            <div className="flex items-center gap-2">
              <FileWarning className={`h-4 w-4 ${brokenFiles.length ? "text-rose-600" : "text-emerald-600"}`} />
              <h2 id="broken-files-title" className="text-[15px] font-bold text-text-heading">File repairs</h2>
            </div>
            <p className="mt-1 text-[12px] text-text-muted">Links confirmed broken in the latest recorded checks.</p>
          </div>

          {brokenFiles.length === 0 ? (
            <div className="px-5 py-10 text-center">
              {summary.fileHealthAvailable && summary.fileHealthCheckedAt ? (
                <>
                  <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
                  <p className="mt-3 text-[14px] font-semibold text-text-heading">No broken links recorded</p>
                  <p className="mt-1 text-[12px] text-text-muted">Last checked {timeAgo(summary.fileHealthCheckedAt)}.</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="mx-auto h-7 w-7 text-amber-600" />
                  <p className="mt-3 text-[14px] font-semibold text-text-heading">No health baseline</p>
                  <p className="mt-1 text-[12px] leading-5 text-text-muted">Run the checker before treating this as a clean result.</p>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-divider">
              {brokenFiles.map((file) => (
                <li key={`${file.recordType}-${file.recordId}-${file.field}`} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-rose-50 p-2 text-rose-600"><FileWarning className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text-heading">{file.title ?? "Deleted record"}</p>
                      <p className="mt-0.5 text-[11.5px] text-rose-700">
                        {file.field === "file_url" ? "PDF file" : "Cover image"} · {file.httpStatus ?? "Unreachable"}
                      </p>
                      <p className="mt-1 truncate text-[10.5px] text-text-muted" title={file.url}>{file.url}</p>
                      <Link href={file.editUrl} className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                        Repair record <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-divider bg-paper/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Refresh the sweep</p>
            <code className="mt-2 block overflow-x-auto rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[10.5px] text-text-body">npx tsx scripts/check-file-health.ts</code>
          </div>
        </aside>
      </div>
    </main>
  );
}
