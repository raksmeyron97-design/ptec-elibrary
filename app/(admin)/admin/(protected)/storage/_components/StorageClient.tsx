"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { WifiOff, ShieldAlert, ServerCrash, SearchX, FolderOpen } from "lucide-react";
import { PageHeader, EmptyState, ConfirmDialog, useToast } from "@/components/admin/kit";
import type {
  StorageFile,
  StorageListItem,
  StoragePagination,
  StorageSummary,
} from "@/lib/types/storage";
import {
  listStorageFilesAction,
  searchStorageFilesAction,
  createStorageFolderAction,
  renameStorageFileAction,
  moveStorageFileAction,
  copyStorageFileAction,
  trashStorageFileAction,
  listStorageTrashAction,
  restoreStorageFileAction,
  permanentlyDeleteStorageFileAction,
  getStorageSummaryAction,
  getStorageSignedUrlAction,
  resolveStorageUploadersAction,
} from "@/app/actions/storage";
import StorageOverview from "@/components/admin/storage/StorageOverview";
import StorageToolbar, { type StorageFilters } from "@/components/admin/storage/StorageToolbar";
import StorageBreadcrumbs from "@/components/admin/storage/StorageBreadcrumbs";
import StorageTable from "@/components/admin/storage/StorageTable";
import StorageGrid from "@/components/admin/storage/StorageGrid";
import StorageMobileList from "@/components/admin/storage/StorageMobileList";
import FileDetailsDrawer from "@/components/admin/storage/FileDetailsDrawer";
import UploadDialog from "@/components/admin/storage/UploadDialog";
import NewFolderDialog from "@/components/admin/storage/NewFolderDialog";
import RenameDialog from "@/components/admin/storage/RenameDialog";
import MoveDialog from "@/components/admin/storage/MoveDialog";
import TrashView from "@/components/admin/storage/TrashView";
import PurgeConfirmDialog from "@/components/admin/storage/PurgeConfirmDialog";
import StorageBulkBar from "@/components/admin/storage/StorageBulkBar";
import { adminStorageDownloadHref } from "@/lib/admin/storage-shared";
import type { StorageItemIntent } from "@/components/admin/storage/StorageItemMenu";

type FileItem = Extract<StorageListItem, { type: "file" }>;

const PAGE_SIZE = 40;

export default function StorageClient({
  initialSummary,
  summaryUnavailable,
  canWrite,
  canPurge,
}: {
  initialSummary: StorageSummary | null;
  summaryUnavailable: boolean;
  canWrite: boolean;
  canPurge: boolean;
}) {
  const t = useTranslations("adminStorage");
  const tStates = useTranslations("adminStorage.states");
  const tTrashDialog = useTranslations("adminStorage.trashDialog");
  const toast = useToast();

  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  /* The totals card sits above a file manager that changes the totals. It was
     frozen at the server render, so after an upload or a trash the disk usage,
     the file count and the trash count all disagreed with the list underneath
     them. `refreshSummary` is fired by every mutation path. */
  const [summary, setSummary] = useState(initialSummary);
  const refreshSummary = useCallback(async () => {
    const res = await getStorageSummaryAction();
    if (res.ok) setSummary(res.data);
  }, []);
  const [view, setView] = useState<"browse" | "trash">("browse");
  const [folder, setFolder] = useState("");
  const [items, setItems] = useState<StorageListItem[]>([]);
  const [pagination, setPagination] = useState<StoragePagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<"forbidden" | "unauthorized" | "unavailable" | "generic" | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [filters, setFilters] = useState<StorageFilters>({ q: "", extension: "", status: "active", sortBy: "name", order: "asc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());

  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [newFolderBusy, setNewFolderBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<FileItem | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [trashConfirmTarget, setTrashConfirmTarget] = useState<FileItem | null>(null);
  const [trashConfirmBusy, setTrashConfirmBusy] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<FileItem | null>(null);

  const [trashItems, setTrashItems] = useState<StorageFile[]>([]);
  const [trashPagination, setTrashPagination] = useState<StoragePagination | null>(null);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashLoadingMore, setTrashLoadingMore] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<StorageFile | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  /* Uploader ids → names. The table and the drawer both printed the first
     eight characters of a UUID, which identifies nobody. Resolved once per
     visible page and cached across pages, so scrolling a folder costs one
     lookup for the ids it newly introduces. */
  const [uploaderNames, setUploaderNames] = useState<Record<string, string>>({});
  const requestGen = useRef(0);

  /**
   * Load one page of a folder.
   *
   * `cursor`/`append` are the fix for the "Load more" button, which called this
   * with no cursor at all: it re-fetched page ONE and re-set the same forty
   * rows, so on a folder with 41+ files the button appeared, did a round trip,
   * and changed nothing. Nothing in the UI could say the difference between
   * that and an empty page 2.
   */
  const loadFolder = useCallback(async (
    targetFolder: string,
    currentFilters: StorageFilters,
    opts: { silent?: boolean; cursor?: number; append?: boolean } = {},
  ) => {
    const gen = ++requestGen.current;
    if (opts.append) setLoadingMore(true);
    else if (opts.silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    const cursor = opts.cursor ?? 0;
    const result = currentFilters.q.trim()
      ? await searchStorageFilesAction({ q: currentFilters.q.trim(), extension: currentFilters.extension || undefined, status: currentFilters.status, cursor, limit: PAGE_SIZE })
      : await listStorageFilesAction(targetFolder, { sortBy: currentFilters.sortBy, order: currentFilters.order, cursor, limit: PAGE_SIZE });

    if (gen !== requestGen.current) return; // a newer request superseded this one
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);

    if (!result.ok) {
      if (result.error.code === "FORBIDDEN") setLoadError("forbidden");
      else if (result.error.code === "UNAUTHORIZED") setLoadError("unauthorized");
      else if (result.error.code === "STORAGE_UNAVAILABLE" || result.error.code === "NETWORK_ERROR" || result.error.code === "TIMEOUT") setLoadError("unavailable");
      else setLoadError("generic");
      return;
    }

    let nextItems = result.data.items as StorageListItem[];
    // The extension filter is applied to the PAGE the server returned, so it
    // narrows what is on screen and never claims to have searched the folder.
    // The toolbar says so in as many words (`filterScopeHint`).
    if (!currentFilters.q.trim() && currentFilters.extension) {
      nextItems = nextItems.filter((i) => i.type === "folder" || i.extension === currentFilters.extension);
    }
    setItems((prev) => {
      if (!opts.append) return nextItems;
      // Appending must not duplicate: a page boundary can overlap after a
      // concurrent upload, and the key is what selection is built on.
      const seen = new Set(prev.map((i) => (i.type === "file" ? i.storageKey : i.path)));
      return [...prev, ...nextItems.filter((i) => !seen.has(i.type === "file" ? i.storageKey : i.path))];
    });
    setPagination(result.data.pagination);
  }, []);

  // Debounced reload on filter/folder change; stale responses are dropped via
  // requestGen. Selection is cleared because the rows it named are gone.
  useEffect(() => {
    if (view !== "browse") return;
    const handle = setTimeout(() => { loadFolder(folder, filters); }, filters.q ? 300 : 0);
    return () => clearTimeout(handle);
  }, [folder, filters, view, loadFolder]);

  useEffect(() => {
    const unresolved = Array.from(
      new Set(
        items
          .filter((i): i is FileItem => i.type === "file" && !!i.uploadedBy)
          .map((i) => i.uploadedBy as string)
          .filter((id) => !(id in uploaderNames)),
      ),
    );
    if (unresolved.length === 0) return;
    let alive = true;
    resolveStorageUploadersAction(unresolved).then((res) => {
      if (!alive || !res.ok) return;
      // Ids that resolved to nothing are recorded as an empty string, so a
      // deleted account is asked about once rather than on every render.
      const merged: Record<string, string> = {};
      for (const id of unresolved) merged[id] = res.data[id] ?? "";
      setUploaderNames((prev) => ({ ...prev, ...merged }));
    });
    return () => { alive = false; };
  }, [items, uploaderNames]);

  const loadTrash = useCallback(async (cursor = 0, append = false) => {
    if (append) setTrashLoadingMore(true); else setTrashLoading(true);
    const result = await listStorageTrashAction({ cursor, limit: PAGE_SIZE });
    setTrashLoading(false);
    setTrashLoadingMore(false);
    if (!result.ok) { toast.error(result.error.message); return; }
    setTrashItems((prev) => (append ? [...prev, ...result.data.items] : result.data.items));
    setTrashPagination(result.data.pagination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view === "trash") loadTrash(0, false);
  }, [view, loadTrash]);

  function withBusy<T>(key: string, fn: () => Promise<T>): Promise<T> {
    setBusyKeys((prev) => new Set(prev).add(key));
    return fn().finally(() => setBusyKeys((prev) => { const next = new Set(prev); next.delete(key); return next; }));
  }

  function toggleSelect(key: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  const selectableFiles = useMemo(
    () => items.filter((i): i is FileItem => i.type === "file" && !!i.id),
    [items],
  );

  function toggleSelectAll() {
    // Compared against what is SELECTED ON THIS PAGE, not against the whole
    // set: after "Load more" the old `prev.size === fileItems.length` test
    // could be true with a different set of rows ticked.
    setSelected((prev) => {
      const allOnPage = selectableFiles.length > 0 && selectableFiles.every((f) => prev.has(f.storageKey));
      if (allOnPage) {
        const next = new Set(prev);
        for (const f of selectableFiles) next.delete(f.storageKey);
        return next;
      }
      return new Set([...prev, ...selectableFiles.map((f) => f.storageKey)]);
    });
  }

  const selectedFiles = useMemo(
    () => selectableFiles.filter((f) => selected.has(f.storageKey)),
    [selectableFiles, selected],
  );

  /**
   * Bulk trash. The selection bar used to carry one control — "Clear selection"
   * — so ticking boxes accomplished nothing at all; the checkboxes were a
   * feature with no verb attached.
   *
   * Files are trashed one at a time because the storage API takes one key per
   * call. A partial failure reports how many did not move rather than claiming
   * the whole batch worked, and the successful ones stay gone.
   */
  async function bulkTrash(files: FileItem[]) {
    setBulkBusy(true);
    let failed = 0;
    const removed: string[] = [];
    for (const file of files) {
      const res = await trashStorageFileAction(file.storageKey);
      if (res.ok) removed.push(file.storageKey);
      else failed++;
    }
    setBulkBusy(false);
    setBulkConfirm(false);
    setSelected((prev) => { const next = new Set(prev); for (const k of removed) next.delete(k); return next; });
    if (failed === 0) toast.success(t("toasts.bulkTrashed", { count: removed.length }));
    else if (removed.length === 0) toast.error(t("toasts.bulkTrashFailed", { count: failed }));
    else toast.warning(t("toasts.bulkTrashPartial", { done: removed.length, failed }));
    loadFolder(folder, filters, { silent: true });
    refreshSummary();
  }

  /**
   * One row action → one thing happening.
   *
   * Three of these used to open the details drawer and nothing else: "Preview",
   * "Download" and "Copy link" were the same control wearing three labels, so a
   * menu item named after an action performed a navigation instead. Preview
   * still opens the drawer — that IS the preview — while Download downloads and
   * Copy link copies.
   */
  function handleItemIntent(file: FileItem, intent: StorageItemIntent) {
    if (intent === "preview") { setDetailsTarget(file); return; }
    if (intent === "download") {
      // Straight at the app's own proxy route, which re-checks authorization;
      // the storage service's URL and token never reach the browser.
      window.location.href = adminStorageDownloadHref(file.storageKey, "download");
      return;
    }
    if (intent === "copyLink") {
      withBusy(file.storageKey, async () => {
        const res = await getStorageSignedUrlAction(file.storageKey);
        if (!res.ok) { toast.error(res.error.message); return; }
        try {
          await navigator.clipboard.writeText(res.data.url);
          toast.success(t("actions.linkCopied"));
        } catch {
          // Clipboard refused (insecure context, or permission denied): say so
          // rather than reporting a copy that did not happen.
          toast.error(t("actions.linkCopyFailed"));
        }
      });
      return;
    }
    if (intent === "rename") { setRenameTarget(file); setRenameError(null); return; }
    if (intent === "move") { setMoveTarget(file); setMoveError(null); return; }
    if (intent === "copy") {
      withBusy(file.storageKey, async () => {
        const res = await copyStorageFileAction(file.storageKey, file.folder.split("/")[0] ?? file.folder);
        if (res.ok) {
          toast.success(t("toasts.copied", { name: file.originalName }));
          loadFolder(folder, filters, { silent: true });
          refreshSummary();
        } else toast.error(res.error.message);
      });
      return;
    }
    if (intent === "replace") { setUploadOpen(true); return; } // replace = upload a new version into the same category (see handoff notes)
    if (intent === "trash") { setTrashConfirmTarget(file); return; }
  }

  async function doRename(name: string) {
    if (!renameTarget) return;
    setRenameBusy(true);
    const res = await renameStorageFileAction(renameTarget.storageKey, name);
    setRenameBusy(false);
    if (res.ok) { setRenameTarget(null); toast.success(t("toasts.renamed", { name })); loadFolder(folder, filters, { silent: true }); }
    else setRenameError(res.error.message);
  }

  async function doMove(destinationFolder: string) {
    if (!moveTarget) return;
    setMoveBusy(true);
    const res = await moveStorageFileAction(moveTarget.storageKey, destinationFolder);
    setMoveBusy(false);
    if (res.ok) {
      setMoveTarget(null);
      toast.success(t("toasts.moved", { name: moveTarget.originalName, folder: destinationFolder }));
      loadFolder(folder, filters, { silent: true });
      refreshSummary();
    }
    else setMoveError(res.error.message);
  }

  async function doTrash() {
    if (!trashConfirmTarget) return;
    setTrashConfirmBusy(true);
    const res = await trashStorageFileAction(trashConfirmTarget.storageKey);
    setTrashConfirmBusy(false);
    setTrashConfirmTarget(null);
    if (res.ok) {
      toast.success(t("toasts.trashed", { name: trashConfirmTarget.originalName }));
      setSelected((prev) => { const next = new Set(prev); next.delete(trashConfirmTarget.storageKey); return next; });
      loadFolder(folder, filters, { silent: true });
      refreshSummary();
    } else toast.error(res.error.message);
  }

  async function doRestore(id: string) {
    setBusyKeys((prev) => new Set(prev).add(id));
    const res = await restoreStorageFileAction(id);
    setBusyKeys((prev) => { const next = new Set(prev); next.delete(id); return next; });
    if (res.ok) {
      toast.success(t("trashView.restoredSuccess"));
      setTrashItems((prev) => prev.filter((f) => f.id !== id));
      refreshSummary();
    } else {
      toast.error(t("trashView.restoreFailed"));
    }
  }

  async function doPurge() {
    if (!purgeTarget?.id) return;
    setPurgeBusy(true);
    const res = await permanentlyDeleteStorageFileAction(purgeTarget.id);
    setPurgeBusy(false);
    setPurgeTarget(null);
    if (res.ok) {
      toast.success(t("toasts.purged", { name: purgeTarget.originalName }));
      setTrashItems((prev) => prev.filter((f) => f.id !== purgeTarget.id));
      refreshSummary();
    } else {
      toast.error(res.error.message);
    }
  }

  async function doCreateFolder(name: string) {
    setNewFolderBusy(true);
    const res = await createStorageFolderAction(folder, name);
    setNewFolderBusy(false);
    if (res.ok) {
      setNewFolderOpen(false);
      setNewFolderError(null);
      toast.success(t("toasts.folderCreated", { name }));
      loadFolder(folder, filters, { silent: true });
    }
    else setNewFolderError(res.error.message);
  }

  return (
    <div className="pb-10">
      <PageHeader title={t("title")} description={t("description")} />

      {view === "browse" && <div className="mb-6"><StorageOverview summary={summary} unavailable={summaryUnavailable} /></div>}

      <div className="space-y-4">
        <StorageToolbar
          filters={filters}
          onFiltersChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          canWrite={canWrite}
          onUpload={() => setUploadOpen(true)}
          onNewFolder={() => { setNewFolderOpen(true); setNewFolderError(null); }}
          onRefresh={() => (view === "trash" ? loadTrash(0, false) : loadFolder(folder, filters, { silent: true }))}
          onOpenTrash={() => setView("trash")}
          inTrash={view === "trash"}
          onExitTrash={() => setView("browse")}
          refreshing={view === "trash" ? trashLoading : refreshing}
          trashCount={summary?.trashItems ?? 0}
        />

        {view === "browse" && !filters.q && <StorageBreadcrumbs folder={folder} onNavigate={(f) => { setFolder(f); setSelected(new Set()); }} />}

        {view === "trash" ? (
          trashLoading ? (
            <div className="rounded-2xl border border-divider bg-bg-surface p-10 text-center text-sm text-text-muted">{tStates("loading")}</div>
          ) : (
            <TrashView
              items={trashItems}
              trashRetentionDays={summary?.trashRetentionDays ?? 30}
              canWrite={canWrite}
              canPurge={canPurge}
              busyIds={busyKeys}
              onRestore={doRestore}
              onPurge={setPurgeTarget}
              hasMore={!!trashPagination?.nextCursor}
              onLoadMore={() => trashPagination && loadTrash(trashPagination.nextCursor ?? 0, true)}
              loadingMore={trashLoadingMore}
            />
          )
        ) : !online ? (
          <EmptyState icon={<WifiOff className="h-6 w-6" />} title={tStates("offline")} />
        ) : loadError === "forbidden" ? (
          <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title={tStates("forbidden")} />
        ) : loadError === "unauthorized" ? (
          <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title={tStates("unauthorized")} />
        ) : loadError === "unavailable" ? (
          <EmptyState
            icon={<ServerCrash className="h-6 w-6" />}
            title={tStates("unavailable")}
            action={<button type="button" onClick={() => loadFolder(folder, filters)} className="rounded-lg border border-divider px-3 py-1.5 text-sm font-semibold hover:bg-paper">{tStates("retry")}</button>}
          />
        ) : loadError === "generic" ? (
          <EmptyState
            icon={<ServerCrash className="h-6 w-6" />}
            title={tStates("error")}
            action={<button type="button" onClick={() => loadFolder(folder, filters)} className="rounded-lg border border-divider px-3 py-1.5 text-sm font-semibold hover:bg-paper">{tStates("retry")}</button>}
          />
        ) : loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl border border-divider bg-paper" />
            ))}
          </div>
        ) : items.length === 0 ? (
          filters.q ? (
            <EmptyState icon={<SearchX className="h-6 w-6" />} title={tStates("noResults")} />
          ) : (
            <EmptyState icon={<FolderOpen className="h-6 w-6" />} title={tStates("empty")} />
          )
        ) : (
          <>
            <StorageBulkBar
              count={selectedFiles.length}
              busy={bulkBusy}
              canWrite={canWrite}
              onDownload={() => {
                for (const file of selectedFiles) {
                  // Separate tabs, not one navigation: the proxy serves one
                  // object per request and the browser handles the rest.
                  window.open(adminStorageDownloadHref(file.storageKey, "download"), "_blank", "noopener");
                }
              }}
              onTrash={() => setBulkConfirm(true)}
              onClear={() => setSelected(new Set())}
            />
            {viewMode === "list" ? (
              <>
                <StorageTable
                  items={items}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAll={toggleSelectAll}
                  onOpenFolder={(f) => { setFolder(f); setSelected(new Set()); }}
                  onOpenDetails={setDetailsTarget}
                  onItemIntent={handleItemIntent}
                  canWrite={canWrite}
                  busyKeys={busyKeys}
                  uploaderNames={uploaderNames}
                  sortBy={filters.sortBy}
                  order={filters.order}
                  onSort={(sortBy, order) => setFilters((prev) => ({ ...prev, sortBy, order }))}
                />
                <StorageMobileList
                  items={items}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onOpenFolder={(f) => { setFolder(f); setSelected(new Set()); }}
                  onOpenDetails={setDetailsTarget}
                  onItemIntent={handleItemIntent}
                  canWrite={canWrite}
                  busyKeys={busyKeys}
                />
              </>
            ) : (
              <StorageGrid
                items={items}
                selected={selected}
                onToggleSelect={toggleSelect}
                onOpenFolder={(f) => { setFolder(f); setSelected(new Set()); }}
                onOpenDetails={setDetailsTarget}
                onItemIntent={handleItemIntent}
                canWrite={canWrite}
                busyKeys={busyKeys}
              />
            )}
            {pagination?.nextCursor != null && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => loadFolder(folder, filters, { cursor: pagination.nextCursor ?? 0, append: true })}
                className="focus-field w-full rounded-lg border border-divider py-2 text-sm font-semibold text-text-body transition hover:bg-paper disabled:cursor-wait disabled:opacity-60"
              >
                {loadingMore
                  ? tStates("loadingMore")
                  : tStates("loadMoreOf", { shown: items.length, total: pagination.total })}
              </button>
            )}
          </>
        )}
      </div>

      <UploadDialog open={uploadOpen} defaultFolder={folder || "books"} onClose={() => setUploadOpen(false)} onUploaded={() => { loadFolder(folder, filters, { silent: true }); refreshSummary(); }} />
      <NewFolderDialog open={newFolderOpen} parentFolder={folder} busy={newFolderBusy} error={newFolderError} onClose={() => setNewFolderOpen(false)} onCreate={doCreateFolder} />
      <RenameDialog file={renameTarget} busy={renameBusy} error={renameError} onClose={() => setRenameTarget(null)} onRename={doRename} />
      <MoveDialog file={moveTarget} busy={moveBusy} error={moveError} onClose={() => setMoveTarget(null)} onMove={doMove} />
      {detailsTarget && (
        <FileDetailsDrawer
          file={detailsTarget}
          canWrite={canWrite}
          uploaderName={detailsTarget.uploadedBy ? uploaderNames[detailsTarget.uploadedBy] : undefined}
          onClose={() => setDetailsTarget(null)}
          onIntent={(intent) => { const target = detailsTarget; setDetailsTarget(null); handleItemIntent(target, intent); }}
        />
      )}
      <ConfirmDialog
        open={!!trashConfirmTarget}
        title={tTrashDialog("title")}
        description={trashConfirmTarget ? tTrashDialog("body", { name: trashConfirmTarget.originalName }) : ""}
        tone="danger"
        confirmLabel={tTrashDialog("confirm")}
        cancelLabel={tTrashDialog("cancel")}
        busy={trashConfirmBusy}
        onCancel={() => setTrashConfirmTarget(null)}
        onConfirm={doTrash}
      />
      <PurgeConfirmDialog file={purgeTarget} busy={purgeBusy} onClose={() => setPurgeTarget(null)} onConfirm={doPurge} />
      <ConfirmDialog
        open={bulkConfirm}
        title={t("bulk.trashTitle", { count: selectedFiles.length })}
        description={t("bulk.trashBody", { count: selectedFiles.length, days: summary?.trashRetentionDays ?? 30 })}
        tone="danger"
        confirmLabel={t("bulk.trashConfirm")}
        cancelLabel={tTrashDialog("cancel")}
        busy={bulkBusy}
        onCancel={() => setBulkConfirm(false)}
        onConfirm={() => bulkTrash(selectedFiles)}
      />
    </div>
  );
}
