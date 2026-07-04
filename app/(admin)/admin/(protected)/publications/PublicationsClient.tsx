"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { togglePublicationPublishStatus, deletePublication } from "@/app/actions/publications";
import { FileText, Eye, Download, CheckCircle2, XCircle } from "lucide-react";
import Icon from "@/components/ui/core/Icon";
import Link from "next/link";

type PublicationRow = {
  id: string;
  slug: string;
  title: string;
  articleType: string;
  journalName: string | null;
  volume: string | null;
  issueNo: string | null;
  doi: string | null;
  authorNames: string | null;
  coverUrl?: string | null;
  isPublished: boolean;
  downloadCount: number;
  viewCount: number;
  createdAt: string;
  publicationDate: string | null;
  publishedAt?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  review: "Review",
  account: "Account",
  editorial: "Editorial",
};

export default function PublicationsClient({
  publications,
  filters,
}: {
  publications: PublicationRow[];
  filters: { q: string; status: string; type: string };
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleTogglePublish = async (id: string, currentStatus: boolean) => {
    setLoadingId(id);
    try {
      await togglePublicationPublishStatus(id, !currentStatus);
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deletePublication(id);
      router.refresh();
    } finally {
      setDeletingId(null);
      setConfirmId(null);
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
    router.push(`/admin/publications?${params.toString()}`);
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

        <select
          value={filters.type}
          onChange={(e) => updateFilter("type", e.target.value)}
          className="h-10 border border-divider rounded-lg px-3 py-2 text-sm text-text-body outline-none transition focus:border-brand bg-bg-surface"
        >
          <option value="">All Types</option>
          <option value="article">Article</option>
          <option value="review">Review</option>
          <option value="account">Account</option>
          <option value="editorial">Editorial</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-bg-surface rounded-xl border border-divider overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper border-b border-divider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium text-center w-16">Cover</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Journal / Issue</th>
                <th className="px-4 py-3 font-medium text-center">Stats</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {publications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                    No publications found.
                  </td>
                </tr>
              ) : (
                publications.map((pub) => {
                  const isDeleting = deletingId === pub.id;
                  const isConfirming = confirmId === pub.id;

                  return (
                  <tr key={pub.id} className={`hover:bg-paper/50 transition-colors ${isDeleting ? "opacity-40" : ""}`}>
                    <td className="px-4 py-3 text-center">
                      {pub.coverUrl ? (
                        <img
                          src={pub.coverUrl}
                          alt={`${pub.title} graphical abstract`}
                          className="w-10 h-14 object-cover rounded shadow-sm mx-auto"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-paper rounded border border-divider flex items-center justify-center mx-auto text-text-muted">
                          <FileText className="w-5 h-5 opacity-50" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-text-heading line-clamp-1">{pub.title}</p>
                        {pub.authorNames && (
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{pub.authorNames}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center rounded-md bg-brand/5 border border-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand">
                            {TYPE_LABELS[pub.articleType] ?? pub.articleType}
                          </span>
                          {pub.doi && (
                            <span className="inline-flex items-center rounded-md bg-paper border border-divider px-2 py-0.5 text-[10px] font-mono text-text-muted">
                              DOI: {pub.doi}
                            </span>
                          )}
                          <p className="text-xs text-text-muted">
                            {pub.publishedAt
                              ? `Published ${new Date(pub.publishedAt).toLocaleDateString()}`
                              : `Added ${new Date(pub.createdAt).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-body">
                      {pub.journalName ? (
                        <span className="text-xs text-brand font-medium block mb-0.5">{pub.journalName}</span>
                      ) : (
                        <span className="text-xs text-text-muted italic block mb-0.5">No journal</span>
                      )}
                      <span className="text-xs text-text-muted">
                        {[
                          pub.volume && `Vol ${pub.volume}`,
                          pub.issueNo && `No ${pub.issueNo}`,
                          pub.publicationDate && new Date(pub.publicationDate).getFullYear(),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-3 text-text-muted">
                        <div className="flex items-center gap-1" title="Views">
                          <Eye className="w-3 h-3" /> <span>{pub.viewCount}</span>
                        </div>
                        <div className="flex items-center gap-1" title="Downloads">
                          <Download className="w-3 h-3" /> <span>{pub.downloadCount}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button type="button" onClick={() => handleTogglePublish(pub.id, pub.isPublished)}
                        disabled={loadingId === pub.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                          pub.isPublished
                            ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            : "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                        }`}
                      >
                        {pub.isPublished ? (
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
                    <td className="px-4 py-3 text-right">
                      {isConfirming ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-text-muted">Delete?</span>
                          <button type="button" onClick={() => handleDelete(pub.id)}
                            disabled={isDeleting}
                            className="rounded bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {isDeleting ? "…" : "Yes"}
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)}
                            className="rounded bg-paper px-2.5 py-1 text-xs font-semibold text-text-body hover:bg-paper"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3 text-text-muted">
                          <Link
                            href={`/admin/publications/edit/${pub.id}`}
                            className="hover:text-brand transition"
                            title="Edit"
                          >
                            <Icon name="edit" className="w-5 h-5" />
                          </Link>
                          <button type="button" onClick={() => setConfirmId(pub.id)}
                            disabled={isDeleting}
                            className="hover:text-red-500 transition disabled:opacity-50"
                            title="Delete"
                          >
                            <Icon name="trash" className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
