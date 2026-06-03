"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleReportPublishStatus } from "@/app/actions/research";
import { FileText, Eye, Download, CheckCircle2, XCircle } from "lucide-react";

type ReportRow = {
  id: string;
  title: string;
  cohort: string;
  academicYear: string;
  isPublished: boolean;
  downloadCount: number;
  viewCount: number;
  createdAt: string;
};

type Department = {
  id: string;
  name: string;
};

export default function ResearchReportsClient({
  reports,
  departments,
  currentPage,
  pageSize,
  totalItems,
  filters,
}: {
  reports: ReportRow[];
  departments?: Department[];
  currentPage: number;
  pageSize: number;
  totalItems: number;
  filters: { q: string; status: string };
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleTogglePublish = async (id: string, currentStatus: boolean) => {
    setLoadingId(id);
    try {
      await toggleReportPublishStatus(id, !currentStatus);
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  };

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Reset page to 1 on filter change
    params.set("page", "1");
    router.push(`/admin/research-reports?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-bg-surface p-4 rounded-xl border border-divider">
        <input
          type="text"
          placeholder="Search by title..."
          defaultValue={filters.q}
          onBlur={(e) => updateFilter("q", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && updateFilter("q", e.currentTarget.value)}
          className="h-10 border border-divider rounded-lg px-3 py-2 text-sm text-text-body outline-none transition focus:border-brand min-w-[200px]"
        />

        <select
          value={filters.status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="h-10 border border-divider rounded-lg px-3 py-2 text-sm text-text-body outline-none transition focus:border-brand bg-bg-surface"
        >
          <option value="">All Statuses</option>
          <option value="live">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-bg-surface rounded-xl border border-divider overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper border-b border-divider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Cohort / Year</th>
                <th className="px-4 py-3 font-medium text-center">Stats</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                    No research reports found.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id} className="hover:bg-paper/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-text-heading line-clamp-1">{report.title}</p>
                          <p className="text-xs text-text-muted">
                            Added {new Date(report.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-body">
                      C{report.cohort} <span className="text-divider mx-1">•</span> {report.academicYear}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-3 text-text-muted">
                        <div className="flex items-center gap-1" title="Views">
                          <Eye className="w-3 h-3" /> <span>{report.viewCount}</span>
                        </div>
                        <div className="flex items-center gap-1" title="Downloads">
                          <Download className="w-3 h-3" /> <span>{report.downloadCount}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleTogglePublish(report.id, report.isPublished)}
                        disabled={loadingId === report.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                          report.isPublished
                            ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            : "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                        }`}
                      >
                        {report.isPublished ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> Published
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> Draft
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
