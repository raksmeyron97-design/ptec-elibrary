"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Search, X, MoreHorizontal, Pencil, Copy, Eye, EyeOff, CalendarClock,
  Link2, Star, StarOff, Archive, Trash2, GraduationCap, RotateCcw, ChevronLeft, ChevronRight,
  Download, Layers,
} from "lucide-react";
import {
  setPathStatus, setPathFeatured, archivePath, duplicatePath, deletePath, bulkSetPathStatus,
} from "@/app/actions/learning-paths";
import type { AdminPathRow, LearningPathStatus } from "@/app/actions/learning-paths";
import { ConfirmDialog, EmptyState, StatusBadge, useToast } from "@/components/admin/kit";
import type { StatusTone } from "@/components/admin/kit";
import { splitDuration } from "@/lib/learning-paths/format";

const STATUS_TABS: (LearningPathStatus | "all")[] = ["all", "published", "draft", "scheduled", "archived"];
const STATUS_TONE: Record<LearningPathStatus, StatusTone> = {
  published: "success",
  draft: "warning",
  scheduled: "info",
  archived: "neutral",
};
const PAGE_SIZE = 10;
type SortKey = "updated" | "title" | "steps" | "status";

export default function PathsAdminClient({ paths: initial }: { paths: AdminPathRow[] }) {
  const t = useTranslations("adminPaths");
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [rows, setRows] = useState(initial);
  // Re-sync when the server sends fresh rows (after router.refresh) — React's
  // documented "adjust state while rendering" pattern via a previous-value state.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) { setPrevInitial(initial); setRows(initial); }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminPathRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPathRow | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<AdminPathRow | null>(null);

  // ── URL-persisted filter state ──
  const tab = (searchParams.get("status") as LearningPathStatus | "all") ?? "all";
  const q = searchParams.get("q") ?? "";
  const audience = searchParams.get("audience") ?? "";
  const subject = searchParams.get("subject") ?? "";
  const language = searchParams.get("language") ?? "";
  const sort = (searchParams.get("sort") as SortKey) ?? "updated";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  function setParams(patch: Record<string, string>, resetPage = true) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    if (resetPage) p.delete("page");
    const qs = p.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  // ── Debounced search ──
  const [searchValue, setSearchValue] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) { setPrevQ(q); setSearchValue(q); }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function onSearch(next: string) {
    setSearchValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParams({ q: next.trim() }), 300);
  }

  const audiences = useMemo(() => uniq(rows.map((r) => r.audience)), [rows]);
  const subjects = useMemo(() => uniq(rows.map((r) => r.subject)), [rows]);
  const languages = useMemo(() => uniq(rows.map((r) => r.language)), [rows]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (audience && r.audience !== audience) return false;
      if (subject && r.subject !== subject) return false;
      if (language && r.language !== language) return false;
      if (needle) {
        const hay = [r.title, r.title_km, r.slug, r.audience, r.subject].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    list = [...list];
    switch (sort) {
      case "title": list.sort((a, b) => a.title.localeCompare(b.title)); break;
      case "steps": list.sort((a, b) => b.stepCount - a.stepCount); break;
      case "status": list.sort((a, b) => a.status.localeCompare(b.status)); break;
      default: list.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    }
    return list;
  }, [rows, tab, q, audience, subject, language, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const hasFilters = !!(q || audience || subject || language || tab !== "all" || sort !== "updated");
  const pageIds = pageRows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // ── Row action helpers ──
  function runAction(id: string, fn: () => Promise<{ error: string } | { success: true } | { success: true; count: number } | { success: true; id: string; slug: string }>, successMsg: string, onOk?: (res: unknown) => void) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if ("error" in res) { toast.error(res.error || t("toasts.error")); return; }
      toast.success(successMsg);
      onOk?.(res);
      router.refresh();
    });
  }

  function changeStatus(row: AdminPathRow, status: LearningPathStatus) {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status, is_published: status === "published" } : r)));
    runAction(row.id, () => setPathStatus(row.id, status), t(`toasts.status.${status}`));
  }
  function toggleFeatured(row: AdminPathRow) {
    const next = !row.featured;
    setRows((prev) => prev.map((r) => ({ ...r, featured: r.id === row.id ? next : next ? false : r.featured })));
    runAction(row.id, () => setPathFeatured(row.id, next), next ? t("toasts.featured") : t("toasts.unfeatured"));
  }
  function doDuplicate(row: AdminPathRow) {
    runAction(row.id, () => duplicatePath(row.id), t("toasts.duplicated"));
  }
  function doArchive(row: AdminPathRow) {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "archived", is_published: false } : r)));
    runAction(row.id, () => archivePath(row.id), t("toasts.archived"));
    setArchiveTarget(null);
  }
  function doDelete(row: AdminPathRow) {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setSelected((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
    runAction(row.id, () => deletePath(row.id), t("toasts.deleted"));
    setDeleteTarget(null);
  }
  function copyLink(row: AdminPathRow) {
    const url = `${window.location.origin}/paths/${row.slug}`;
    navigator.clipboard?.writeText(url).then(() => toast.success(t("toasts.linkCopied")), () => toast.error(t("toasts.error")));
  }

  // ── Bulk ──
  function bulk(status: LearningPathStatus, msg: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setRows((prev) => prev.map((r) => (selected.has(r.id) ? { ...r, status, is_published: status === "published" } : r)));
    startTransition(async () => {
      const res = await bulkSetPathStatus(ids, status);
      if ("error" in res) { toast.error(res.error || t("toasts.error")); return; }
      toast.success(msg);
      setSelected(new Set());
      router.refresh();
    });
  }
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  function exportSelected() {
    const chosen = rows.filter((r) => selected.has(r.id));
    const header = ["title", "slug", "status", "audience", "subject", "language", "modules", "steps", "duration_min", "updated_at"];
    const csv = [
      header.join(","),
      ...chosen.map((r) => [r.title, r.slug, r.status, r.audience ?? "", r.subject ?? "", r.language ?? "", r.moduleCount, r.stepCount, r.durationMinutes ?? "", r.updated_at ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `learning-paths-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      {/* ── Status tabs ── */}
      <div className="mb-4 flex flex-wrap gap-1.5 border-b border-divider" role="tablist" aria-label={t("statusTabsLabel")}>
        {STATUS_TABS.map((s) => {
          const active = tab === s;
          return (
            <button
              key={s}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setParams({ status: s === "all" ? "" : s })}
              className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold transition ${
                active ? "border-brand text-brand" : "border-transparent text-text-muted hover:text-text-heading"
              }`}
            >
              {t(`tabs.${s}`)}
              <span className="rounded-full bg-paper px-1.5 py-0.5 text-[10.5px] tabular-nums text-text-muted">{statusCounts[s] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <label className="sr-only" htmlFor="admin-path-search">{t("searchLabel")}</label>
          <input
            id="admin-path-search"
            type="text"
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-lg border border-divider bg-bg-surface py-2 pl-9 pr-9 text-[14px] text-text-heading outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/20"
          />
          {searchValue && (
            <button type="button" onClick={() => { setSearchValue(""); setParams({ q: "" }); }} aria-label={t("clearSearch")}
              className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-text-heading">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {audiences.length > 0 && (
            <AdminSelect label={t("filters.audience")} value={audience} onChange={(v) => setParams({ audience: v })}
              options={[{ value: "", label: t("filters.allAudiences") }, ...audiences.map((a) => ({ value: a, label: a }))]} />
          )}
          {subjects.length > 0 && (
            <AdminSelect label={t("filters.subject")} value={subject} onChange={(v) => setParams({ subject: v })}
              options={[{ value: "", label: t("filters.allSubjects") }, ...subjects.map((a) => ({ value: a, label: a }))]} />
          )}
          {languages.length > 0 && (
            <AdminSelect label={t("filters.language")} value={language} onChange={(v) => setParams({ language: v })}
              options={[{ value: "", label: t("filters.allLanguages") }, ...languages.map((l) => ({ value: l, label: t(`language.${l}`) }))]} />
          )}
          <AdminSelect label={t("sortLabel")} value={sort} onChange={(v) => setParams({ sort: v === "updated" ? "" : v })}
            options={[
              { value: "updated", label: t("sort.updated") },
              { value: "title", label: t("sort.title") },
              { value: "steps", label: t("sort.steps") },
              { value: "status", label: t("sort.status") },
            ]} />
          {hasFilters && (
            <button type="button" onClick={() => setParams({ q: "", audience: "", subject: "", language: "", status: "", sort: "" })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-[12.5px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> {t("resetFilters")}
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.05] px-3 py-2">
          <span className="text-[13px] font-semibold text-text-heading">{t("bulk.selected", { count: selected.size })}</span>
          <div className="mx-1 h-4 w-px bg-divider" aria-hidden="true" />
          <BulkBtn icon={Eye} label={t("bulk.publish")} onClick={() => bulk("published", t("toasts.bulkPublished"))} />
          <BulkBtn icon={EyeOff} label={t("bulk.unpublish")} onClick={() => bulk("draft", t("toasts.bulkUnpublished"))} />
          <BulkBtn icon={Archive} label={t("bulk.archive")} onClick={() => setBulkArchiveOpen(true)} />
          <BulkBtn icon={Download} label={t("bulk.export")} onClick={exportSelected} />
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[12.5px] font-semibold text-text-muted hover:text-text-heading">
            {t("bulk.clear")}
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState icon={<GraduationCap className="h-6 w-6" />} title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <div className="rounded-xl border border-divider bg-bg-surface py-14 text-center">
            <Search className="mx-auto mb-2 h-8 w-8 text-text-muted/40" aria-hidden="true" />
            <p className="text-[13.5px] font-semibold text-text-heading">{t("noResults.title")}</p>
            <p className="mt-0.5 text-[12.5px] text-text-muted">{t("noResults.hint")}</p>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-divider text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th scope="col" className="w-10 px-3 py-2.5">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} aria-label={t("selectAll")} className="h-4 w-4 accent-brand" />
                </th>
                <th scope="col" className="px-3 py-2.5">{t("columns.path")}</th>
                <th scope="col" className="px-3 py-2.5">{t("columns.status")}</th>
                <th scope="col" className="hidden px-3 py-2.5 lg:table-cell">{t("columns.audience")}</th>
                <th scope="col" className="px-3 py-2.5">{t("columns.structure")}</th>
                <th scope="col" className="hidden px-3 py-2.5 md:table-cell">{t("columns.duration")}</th>
                <th scope="col" className="hidden px-3 py-2.5 xl:table-cell">{t("columns.updated")}</th>
                <th scope="col" className="w-24 px-3 py-2.5 text-right">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  selected={selected.has(row.id)}
                  busy={busyId === row.id}
                  onToggleSelect={() => toggleSelect(row.id)}
                  onStatus={(s) => changeStatus(row, s)}
                  onFeature={() => toggleFeatured(row)}
                  onDuplicate={() => doDuplicate(row)}
                  onArchive={() => setArchiveTarget(row)}
                  onDelete={() => setDeleteTarget(row)}
                  onSchedule={() => setScheduleTarget(row)}
                  onCopyLink={() => copyLink(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[12.5px] text-text-muted tabular-nums">
            {t("pagination.showing", { from: (clampedPage - 1) * PAGE_SIZE + 1, to: Math.min(clampedPage * PAGE_SIZE, filtered.length), total: filtered.length })}
          </p>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={clampedPage <= 1} onClick={() => setParams({ page: String(clampedPage - 1) }, false)}
              aria-label={t("pagination.prev")}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-divider text-text-muted transition hover:border-brand/40 hover:text-brand disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-[12.5px] font-semibold text-text-muted tabular-nums">{clampedPage} / {totalPages}</span>
            <button type="button" disabled={clampedPage >= totalPages} onClick={() => setParams({ page: String(clampedPage + 1) }, false)}
              aria-label={t("pagination.next")}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-divider text-text-muted transition hover:border-brand/40 hover:text-brand disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
      <ConfirmDialog
        open={archiveTarget !== null}
        tone="brand"
        title={t("archiveDialog.title")}
        description={archiveTarget ? t("archiveDialog.description", { title: archiveTarget.title }) : undefined}
        confirmLabel={t("archiveDialog.confirm")}
        busyLabel={t("archiveDialog.busy")}
        busy={busyId === archiveTarget?.id}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && doArchive(archiveTarget)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title={t("deleteDialog.title")}
        description={deleteTarget ? t("deleteDialog.description", { title: deleteTarget.title }) : undefined}
        confirmLabel={t("deleteDialog.confirm")}
        busyLabel={t("deleteDialog.busy")}
        busy={busyId === deleteTarget?.id}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && doDelete(deleteTarget)}
      />
      <ConfirmDialog
        open={bulkArchiveOpen}
        tone="brand"
        title={t("bulkArchiveDialog.title")}
        description={t("bulkArchiveDialog.description", { count: selected.size })}
        confirmLabel={t("bulkArchiveDialog.confirm")}
        busyLabel={t("archiveDialog.busy")}
        onCancel={() => setBulkArchiveOpen(false)}
        onConfirm={() => { setBulkArchiveOpen(false); bulk("archived", t("toasts.bulkArchived")); }}
      />
      {scheduleTarget && (
        <ScheduleDialog
          row={scheduleTarget}
          onCancel={() => setScheduleTarget(null)}
          onConfirm={(iso) => {
            const row = scheduleTarget;
            setScheduleTarget(null);
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "scheduled", is_published: false } : r)));
            runAction(row.id, () => setPathStatus(row.id, "scheduled", iso), t("toasts.scheduled"));
          }}
        />
      )}
    </>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function Row({
  row, selected, busy, onToggleSelect, onStatus, onFeature, onDuplicate, onArchive, onDelete, onSchedule, onCopyLink,
}: {
  row: AdminPathRow;
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onStatus: (s: LearningPathStatus) => void;
  onFeature: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSchedule: () => void;
  onCopyLink: () => void;
}) {
  const t = useTranslations("adminPaths");
  const duration = splitDuration(row.durationMinutes);
  const durationText = duration ? (duration.hours > 0 ? `${duration.hours}h ${duration.minutes}m` : `${duration.minutes}m`) : "—";

  return (
    <tr className={`border-b border-divider/70 transition hover:bg-paper/40 ${busy ? "opacity-60" : ""}`}>
      <td className="px-3 py-3 align-top">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={t("selectRow", { title: row.title })} className="mt-0.5 h-4 w-4 accent-brand" />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-11 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-divider bg-paper">
            {row.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.cover_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <GraduationCap className="h-4 w-4 text-text-muted/50" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <Link href={`/admin/paths/edit/${row.id}`} className="line-clamp-1 font-bold text-text-heading hover:text-brand">
              {row.title}
            </Link>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-text-muted">
              <span className="truncate font-mono">/{row.slug}</span>
              {row.featured && <Star className="h-3 w-3 shrink-0 fill-gold-400 text-gold-500" aria-label={t("featuredLabel")} />}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <StatusBadge tone={STATUS_TONE[row.status]}>{t(`tabs.${row.status}`)}</StatusBadge>
      </td>
      <td className="hidden px-3 py-3 align-top text-text-muted lg:table-cell">{row.audience || "—"}</td>
      <td className="px-3 py-3 align-top">
        <span className="inline-flex items-center gap-1 text-text-muted">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          {t("structure", { modules: row.moduleCount, steps: row.stepCount })}
        </span>
      </td>
      <td className="hidden px-3 py-3 align-top text-text-muted md:table-cell tabular-nums">{durationText}</td>
      <td className="hidden px-3 py-3 align-top text-text-muted xl:table-cell">
        <span className="block">{row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "—"}</span>
        {row.editorName && <span className="block truncate text-[11px]">{row.editorName}</span>}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex items-center justify-end gap-1">
          <Link href={`/admin/paths/edit/${row.id}`} aria-label={t("actions.edit")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-brand">
            <Pencil className="h-4 w-4" />
          </Link>
          <Link href={`/paths/${row.slug}`} target="_blank" aria-label={t("actions.preview")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-brand">
            <Eye className="h-4 w-4" />
          </Link>
          <RowMenu
            row={row}
            onStatus={onStatus}
            onFeature={onFeature}
            onDuplicate={onDuplicate}
            onArchive={onArchive}
            onDelete={onDelete}
            onSchedule={onSchedule}
            onCopyLink={onCopyLink}
          />
        </div>
      </td>
    </tr>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────

function RowMenu({
  row, onStatus, onFeature, onDuplicate, onArchive, onDelete, onSchedule, onCopyLink,
}: {
  row: AdminPathRow;
  onStatus: (s: LearningPathStatus) => void;
  onFeature: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSchedule: () => void;
  onCopyLink: () => void;
}) {
  const t = useTranslations("adminPaths");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-body transition hover:bg-paper";

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={t("actions.more")}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-brand">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-divider bg-bg-surface py-1 shadow-lg">
          <button role="menuitem" className={item} onClick={() => { setOpen(false); onDuplicate(); }}>
            <Copy className="h-4 w-4 text-text-muted" aria-hidden="true" /> {t("actions.duplicate")}
          </button>
          {row.status === "published" ? (
            <button role="menuitem" className={item} onClick={() => { setOpen(false); onStatus("draft"); }}>
              <EyeOff className="h-4 w-4 text-text-muted" aria-hidden="true" /> {t("actions.unpublish")}
            </button>
          ) : (
            <button role="menuitem" className={item} onClick={() => { setOpen(false); onStatus("published"); }}>
              <Eye className="h-4 w-4 text-text-muted" aria-hidden="true" /> {t("actions.publish")}
            </button>
          )}
          <button role="menuitem" className={item} onClick={() => { setOpen(false); onSchedule(); }}>
            <CalendarClock className="h-4 w-4 text-text-muted" aria-hidden="true" /> {t("actions.schedule")}
          </button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); onFeature(); }}>
            {row.featured
              ? <><StarOff className="h-4 w-4 text-text-muted" aria-hidden="true" /> {t("actions.unfeature")}</>
              : <><Star className="h-4 w-4 text-text-muted" aria-hidden="true" /> {t("actions.feature")}</>}
          </button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); onCopyLink(); }}>
            <Link2 className="h-4 w-4 text-text-muted" aria-hidden="true" /> {t("actions.copyLink")}
          </button>
          <div className="my-1 h-px bg-divider" role="separator" />
          {row.status !== "archived" && (
            <button role="menuitem" className={item} onClick={() => { setOpen(false); onArchive(); }}>
              <Archive className="h-4 w-4 text-text-muted" aria-hidden="true" /> {t("actions.archive")}
            </button>
          )}
          <button role="menuitem" className={`${item} text-danger hover:bg-danger/5`} onClick={() => { setOpen(false); onDelete(); }}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> {t("actions.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function AdminSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className={`h-9 rounded-lg border bg-bg-surface px-2.5 text-[12.5px] font-semibold outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/20 ${value ? "border-brand/40 text-brand" : "border-divider text-text-muted"}`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.value === "" ? o.label : `${label}: ${o.label}`}</option>)}
      </select>
    </label>
  );
}

function BulkBtn({ icon: Icon, label, onClick }: { icon: typeof Eye; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}

function ScheduleDialog({ row, onCancel, onConfirm }: { row: AdminPathRow; onCancel: () => void; onConfirm: (iso: string) => void }) {
  const t = useTranslations("adminPaths");
  const [value, setValue] = useState("");
  const [min] = useState(() => new Date(Date.now() + 60_000).toISOString().slice(0, 16));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t("scheduleDialog.title")}>
      <div className="w-full max-w-md rounded-2xl border border-divider bg-bg-surface p-5 shadow-xl">
        <h2 className="text-[15px] font-bold text-text-heading">{t("scheduleDialog.title")}</h2>
        <p className="mt-1 text-[13px] text-text-muted">{t("scheduleDialog.description", { title: row.title })}</p>
        <label className="mt-4 block text-[12px] font-semibold text-text-muted">{t("scheduleDialog.label")}</label>
        <input type="datetime-local" min={min} value={value} onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[14px] text-text-heading outline-none focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/20" />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-divider px-4 py-2 text-[13px] font-semibold text-text-muted hover:text-text-heading">
            {t("scheduleDialog.cancel")}
          </button>
          <button type="button" disabled={!value} onClick={() => onConfirm(new Date(value).toISOString())}
            className="btn-brand-gradient rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
            {t("scheduleDialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function uniq(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))].sort((a, b) => a.localeCompare(b));
}
