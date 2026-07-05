"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { togglePublicationPublishStatus, deletePublication } from "@/app/actions/publications";
import {
  FileText,
  Eye,
  Download,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Columns3,
  FileDown,
  Loader2,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Pencil,
  Trash2,
  X,
  BookOpen,
  Send,
  Undo2,
} from "lucide-react";
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

const HIDEABLE_COLUMNS = [
  { key: "cover", label: "Cover" },
  { key: "journal", label: "Journal / Issue" },
  { key: "views", label: "Views" },
  { key: "downloads", label: "Downloads" },
  { key: "date", label: "Date" },
] as const;

type ColumnKey = (typeof HIDEABLE_COLUMNS)[number]["key"];
const COLUMNS_STORAGE_KEY = "ptec.admin.publications.columns";

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "success" | "warning" }) {
  return (
    <div className="rounded-xl border border-divider bg-bg-surface px-4 py-3">
      <p className="text-xl font-semibold leading-7 text-text-heading">{compact(value)}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
        {accent === "success" && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
        {accent === "warning" && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
        {label}
      </p>
    </div>
  );
}

function SortableHeader({
  label,
  column,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  column: string;
  sort: { column: string; dir: string };
  onSort: (column: string) => void;
  className?: string;
}) {
  const active = sort.column === column;
  return (
    <th className={`px-4 py-2.5 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`group inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-text-heading ${active ? "text-text-heading" : ""}`}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
        )}
      </button>
    </th>
  );
}

export default function PublicationsClient({
  publications,
  filters,
  sort,
  stats,
}: {
  publications: PublicationRow[];
  filters: { q: string; status: string; type: string };
  sort: { column: string; dir: string };
  stats: { total: number; published: number; drafts: number; views: number; downloads: number };
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"publish" | "unpublish" | "delete" | null>(null);
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnKey>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  // ── Column visibility persistence ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (raw) setHiddenColumns(new Set(JSON.parse(raw)));
    } catch { /* ignore corrupted state */ }
  }, []);

  const toggleColumn = (key: ColumnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
      } catch { /* storage unavailable */ }
      return next;
    });
  };

  const show = (key: ColumnKey) => !hiddenColumns.has(key);

  // ── Close columns popover on outside click ──
  useEffect(() => {
    if (!columnsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!columnsRef.current?.contains(e.target as Node)) setColumnsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [columnsOpen]);

  // ── Keyboard shortcuts: "/" focus search, Esc clears selection ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSelected(new Set());
        setBulkConfirmDelete(false);
        setConfirmId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const updateFilter = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.set("page", "1");
      router.push(`/admin/publications?${params.toString()}`);
    },
    [router],
  );

  const handleSort = (column: string) => {
    const dir = sort.column === column && sort.dir === "desc" ? "asc" : "desc";
    updateFilter({ sort: column, dir });
  };

  // ── Row actions ──
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
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      router.refresh();
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  // ── Selection ──
  const allSelected = publications.length > 0 && publications.every((p) => selected.has(p.id));
  const someSelected = publications.some((p) => selected.has(p.id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        for (const p of publications) next.delete(p.id);
        return next;
      }
      return new Set([...prev, ...publications.map((p) => p.id)]);
    });
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Bulk actions (existing single-row server actions, fanned out) ──
  const runBulk = async (action: "publish" | "unpublish" | "delete") => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(action);
    try {
      if (action === "delete") {
        await Promise.allSettled(ids.map((id) => deletePublication(id)));
      } else {
        await Promise.allSettled(
          ids.map((id) => togglePublicationPublishStatus(id, action === "publish")),
        );
      }
      setSelected(new Set());
      setBulkConfirmDelete(false);
      router.refresh();
    } finally {
      setBulkBusy(null);
    }
  };

  // ── CSV export of the current page ──
  const exportCsv = () => {
    const header = ["Title", "Authors", "Type", "Journal", "Volume", "Issue", "DOI", "Status", "Views", "Downloads", "Published", "Created"];
    const escape = (v: string | number | null | undefined) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = publications.map((p) =>
      [
        p.title, p.authorNames, TYPE_LABELS[p.articleType] ?? p.articleType, p.journalName,
        p.volume, p.issueNo, p.doi, p.isPublished ? "Published" : "Draft",
        p.viewCount, p.downloadCount, p.publishedAt ?? "", p.createdAt,
      ].map(escape).join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `publications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCount = selected.size;
  const visibleColumnCount = useMemo(
    () => 3 + HIDEABLE_COLUMNS.filter((c) => show(c.key)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hiddenColumns],
  );

  return (
    <div className="space-y-4">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total publications" value={stats.total} />
        <StatCard label="Published" value={stats.published} accent="success" />
        <StatCard label="Drafts" value={stats.drafts} accent="warning" />
        <StatCard label="Total views" value={stats.views} />
        <StatCard label="Total downloads" value={stats.downloads} />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-divider bg-bg-surface p-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search by title…"
            defaultValue={filters.q}
            onBlur={(e) => e.target.value !== filters.q && updateFilter({ q: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && updateFilter({ q: e.currentTarget.value })}
            className="h-9 w-full rounded-lg border border-divider bg-transparent pl-9 pr-10 text-sm text-text-body outline-none transition focus:border-brand"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-divider bg-paper px-1.5 py-0.5 text-[10px] font-medium text-text-muted sm:block">
            /
          </kbd>
        </div>

        {/* Status segmented control */}
        <div className="flex h-9 items-center rounded-lg border border-divider p-0.5" role="group" aria-label="Filter by status">
          {[
            { value: "", label: "All" },
            { value: "live", label: "Published" },
            { value: "draft", label: "Drafts" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateFilter({ status: opt.value })}
              className={`h-full cursor-pointer rounded-md px-3 text-xs font-medium transition-colors ${
                filters.status === opt.value
                  ? "bg-brand/10 text-brand"
                  : "text-text-muted hover:text-text-heading"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={filters.type}
          onChange={(e) => updateFilter({ type: e.target.value })}
          aria-label="Filter by article type"
          className="h-9 cursor-pointer rounded-lg border border-divider bg-bg-surface px-2.5 text-xs font-medium text-text-body outline-none transition focus:border-brand"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Column visibility */}
        <div className="relative" ref={columnsRef}>
          <button
            type="button"
            onClick={() => setColumnsOpen((v) => !v)}
            aria-expanded={columnsOpen}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-2.5 text-xs font-medium text-text-body transition-colors hover:bg-paper"
          >
            <Columns3 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Columns</span>
          </button>
          {columnsOpen && (
            <div className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-lg">
              {HIDEABLE_COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-body transition-colors hover:bg-paper"
                >
                  <input
                    type="checkbox"
                    checked={show(col.key)}
                    onChange={() => toggleColumn(col.key)}
                    className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={exportCsv}
          disabled={publications.length === 0}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-2.5 text-xs font-medium text-text-body transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileDown className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Export CSV</span>
        </button>
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-divider bg-paper text-xs text-text-muted">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={toggleAll}
                    aria-label="Select all on this page"
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-brand)]"
                  />
                </th>
                {show("cover") && <th className="w-14 px-2 py-2.5 font-medium" />}
                <SortableHeader label="Title" column="title" sort={sort} onSort={handleSort} />
                {show("journal") && <th className="px-4 py-2.5 font-medium">Journal / Issue</th>}
                {show("views") && (
                  <SortableHeader label="Views" column="views" sort={sort} onSort={handleSort} className="text-right" />
                )}
                {show("downloads") && (
                  <SortableHeader label="Downloads" column="downloads" sort={sort} onSort={handleSort} className="text-right" />
                )}
                {show("date") && (
                  <SortableHeader label="Date" column="created" sort={sort} onSort={handleSort} />
                )}
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {publications.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount + 1} className="px-4 py-14 text-center">
                    <BookOpen className="mx-auto mb-2 h-8 w-8 text-text-muted/50" />
                    <p className="font-medium text-text-body">No publications found</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Adjust filters or create a new publication.
                    </p>
                  </td>
                </tr>
              ) : (
                publications.map((pub) => {
                  const isDeleting = deletingId === pub.id;
                  const isConfirming = confirmId === pub.id;
                  const isSelected = selected.has(pub.id);

                  return (
                    <tr
                      key={pub.id}
                      className={`group transition-colors ${
                        isSelected ? "bg-brand/[0.04]" : "hover:bg-paper/50"
                      } ${isDeleting ? "opacity-40" : ""}`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(pub.id)}
                          aria-label={`Select ${pub.title}`}
                          className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-brand)]"
                        />
                      </td>
                      {show("cover") && (
                        <td className="px-2 py-2.5">
                          {pub.coverUrl ? (
                            <img
                              src={pub.coverUrl}
                              alt=""
                              className="h-12 w-9 rounded border border-divider object-cover shadow-sm"
                            />
                          ) : (
                            <div className="flex h-12 w-9 items-center justify-center rounded border border-divider bg-paper text-text-muted">
                              <FileText className="h-4 w-4 opacity-50" />
                            </div>
                          )}
                        </td>
                      )}
                      <td className="max-w-[380px] px-4 py-2.5">
                        <Link
                          href={`/admin/publications/edit/${pub.id}`}
                          className="line-clamp-1 font-medium text-text-heading transition-colors hover:text-brand"
                        >
                          {pub.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="inline-flex shrink-0 items-center rounded border border-brand/15 bg-brand/5 px-1.5 py-px text-[10px] font-medium text-brand">
                            {TYPE_LABELS[pub.articleType] ?? pub.articleType}
                          </span>
                          {pub.authorNames && (
                            <span className="line-clamp-1 text-xs text-text-muted">{pub.authorNames}</span>
                          )}
                        </div>
                      </td>
                      {show("journal") && (
                        <td className="px-4 py-2.5">
                          {pub.journalName ? (
                            <span className="mb-0.5 block text-xs font-medium text-brand">{pub.journalName}</span>
                          ) : (
                            <span className="mb-0.5 block text-xs italic text-text-muted">No journal</span>
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
                      )}
                      {show("views") && (
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-body">
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Eye className="h-3 w-3 text-text-muted" /> {compact(pub.viewCount)}
                          </span>
                        </td>
                      )}
                      {show("downloads") && (
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-body">
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Download className="h-3 w-3 text-text-muted" /> {compact(pub.downloadCount)}
                          </span>
                        </td>
                      )}
                      {show("date") && (
                        <td className="px-4 py-2.5 text-xs text-text-muted">
                          {pub.publishedAt
                            ? new Date(pub.publishedAt).toLocaleDateString()
                            : new Date(pub.createdAt).toLocaleDateString()}
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(pub.id, pub.isPublished)}
                          disabled={loadingId === pub.id}
                          title={pub.isPublished ? "Unpublish" : "Publish"}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                            pub.isPublished
                              ? "bg-success/10 text-success hover:bg-success/20"
                              : "bg-warning/10 text-warning hover:bg-warning/20"
                          }`}
                        >
                          {loadingId === pub.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : pub.isPublished ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <CircleDashed className="h-3 w-3" />
                          )}
                          {pub.isPublished ? "Published" : "Draft"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isConfirming ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-text-muted">Delete?</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(pub.id)}
                              disabled={isDeleting}
                              className="cursor-pointer rounded bg-danger px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                            >
                              {isDeleting ? "…" : "Yes"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmId(null)}
                              className="cursor-pointer rounded border border-divider px-2.5 py-1 text-xs font-semibold text-text-body transition-colors hover:bg-paper"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1 text-text-muted">
                            <Link
                              href={`/publications/${pub.slug}`}
                              target="_blank"
                              className="rounded-md p-1.5 transition-colors hover:bg-paper hover:text-brand"
                              title="View public page"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                            <Link
                              href={`/admin/publications/edit/${pub.id}`}
                              className="rounded-md p-1.5 transition-colors hover:bg-paper hover:text-brand"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setConfirmId(pub.id)}
                              disabled={isDeleting}
                              className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-paper hover:text-danger disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
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

      {/* ── Floating bulk-action bar ── */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-1 rounded-full border border-divider bg-bg-surface py-1.5 pl-4 pr-1.5 shadow-xl">
            <span className="mr-2 text-xs font-semibold text-text-heading">
              {selectedCount} selected
            </span>
            <button
              type="button"
              onClick={() => runBulk("publish")}
              disabled={bulkBusy !== null}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-text-body transition-colors hover:bg-success/10 hover:text-success disabled:opacity-50"
            >
              {bulkBusy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publish
            </button>
            <button
              type="button"
              onClick={() => runBulk("unpublish")}
              disabled={bulkBusy !== null}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-text-body transition-colors hover:bg-warning/10 hover:text-warning disabled:opacity-50"
            >
              {bulkBusy === "unpublish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              Unpublish
            </button>
            {bulkConfirmDelete ? (
              <button
                type="button"
                onClick={() => runBulk("delete")}
                disabled={bulkBusy !== null}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-danger px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
              >
                {bulkBusy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Confirm delete {selectedCount}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setBulkConfirmDelete(true)}
                disabled={bulkBusy !== null}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-text-body transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setBulkConfirmDelete(false);
              }}
              className="ml-1 cursor-pointer rounded-full p-1.5 text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
              aria-label="Clear selection"
              title="Clear selection (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
