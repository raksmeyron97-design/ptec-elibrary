"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const [summary] = useState(initialSummary);
  const [view, setView] = useState<"browse" | "trash">("browse");
  const [folder, setFolder] = useState("");
  const [items, setItems] = useState<StorageListItem[]>([]);
  const [pagination, setPagination] = useState<StoragePagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const requestGen = useRef(0);

  const loadFolder = useCallback(async (targetFolder: string, currentFilters: StorageFilters, opts: { silent?: boolean } = {}) => {
    const gen = ++requestGen.current;
    if (opts.silent) setRefreshing(true); else setLoading(true);
    setLoadError(null);

    const result = currentFilters.q.trim()
      ? await searchStorageFilesAction({ q: currentFilters.q.trim(), extension: currentFilters.extension || undefined, status: currentFilters.status, limit: PAGE_SIZE })
      : await listStorageFilesAction(targetFolder, { sortBy: currentFilters.sortBy, order: currentFilters.order, limit: PAGE_SIZE });

    if (gen !== requestGen.current) return; // a newer request superseded this one
    setLoading(false);
    setRefreshing(false);

    if (!result.ok) {
      if (result.error.code === "FORBIDDEN") setLoadError("forbidden");
      else if (result.error.code === "UNAUTHORIZED") setLoadError("unauthorized");
      else if (result.error.code === "STORAGE_UNAVAILABLE" || result.error.code === "NETWORK_ERROR" || result.error.code === "TIMEOUT") setLoadError("unavailable");
      else setLoadError("generic");
      return;
    }

    let nextItems = result.data.items as StorageListItem[];
    if (!currentFilters.q.trim() && currentFilters.extension) {
      nextItems = nextItems.filter((i) => i.type === "folder" || i.extension === currentFilters.extension);
    }
    setItems(nextItems);
    setPagination(result.data.pagination);
  }, []);

  // Debounced reload on filter/folder change; stale responses are dropped via requestGen.
  useEffect(() => {
    if (view !== "browse") return;
    const handle = setTimeout(() => { loadFolder(folder, filters); }, filters.q ? 300 : 0);
    return () => clearTimeout(handle);
  }, [folder, filters, view, loadFolder]);

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
  function toggleSelectAll() {
    const fileItems = items.filter((i): i is FileItem => i.type === "file" && !!i.id);
    setSelected((prev) => (prev.size === fileItems.length ? new Set() : new Set(fileItems.map((f) => f.storageKey))));
  }

  function handleItemIntent(file: FileItem, intent: StorageItemIntent) {
    if (intent === "preview" || intent === "download") { setDetailsTarget(file); return; }
    if (intent === "copyLink") { setDetailsTarget(file); return; }
    if (intent === "rename") { setRenameTarget(file); setRenameError(null); return; }
    if (intent === "move") { setMoveTarget(file); setMoveError(null); return; }
    if (intent === "copy") {
      withBusy(file.storageKey, async () => {
        const res = await copyStorageFileAction(file.storageKey, file.folder.split("/")[0] ?? file.folder);
        if (res.ok) { toast.success(t("actions.copyLink")); loadFolder(folder, filters, { silent: true }); }
        else toast.error(res.error.message);
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
    if (res.ok) { setRenameTarget(null); toast.success(t("rename.title")); loadFolder(folder, filters, { silent: true }); }
    else setRenameError(res.error.message);
  }

  async function doMove(destinationFolder: string) {
    if (!moveTarget) return;
    setMoveBusy(true);
    const res = await moveStorageFileAction(moveTarget.storageKey, destinationFolder);
    setMoveBusy(false);
    if (res.ok) { setMoveTarget(null); toast.success(t("move.title")); loadFolder(folder, filters, { silent: true }); }
    else setMoveError(res.error.message);
  }

  async function doTrash() {
    if (!trashConfirmTarget) return;
    setTrashConfirmBusy(true);
    const res = await trashStorageFileAction(trashConfirmTarget.storageKey);
    setTrashConfirmBusy(false);
    setTrashConfirmTarget(null);
    if (res.ok) { toast.success(t("trashView.title")); loadFolder(folder, filters, { silent: true }); }
    else toast.error(res.error.message);
  }

  async function doRestore(id: string) {
    setBusyKeys((prev) => new Set(prev).add(id));
    const res = await restoreStorageFileAction(id);
    setBusyKeys((prev) => { const next = new Set(prev); next.delete(id); return next; });
    if (res.ok) {
      toast.success(t("trashView.restoredSuccess"));
      setTrashItems((prev) => prev.filter((f) => f.id !== id));
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
      toast.success(t("purgeDialog.confirm"));
      setTrashItems((prev) => prev.filter((f) => f.id !== purgeTarget.id));
    } else {
      toast.error(res.error.message);
    }
  }

  async function doCreateFolder(name: string) {
    setNewFolderBusy(true);
    const res = await createStorageFolderAction(folder, name);
    setNewFolderBusy(false);
    if (res.ok) { setNewFolderOpen(false); setNewFolderError(null); loadFolder(folder, filters, { silent: true }); }
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
            {selected.size > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5">
                <span className="text-sm font-semibold text-text-heading">{t("bulk.selected", { count: selected.size })}</span>
                <button type="button" onClick={() => setSelected(new Set())} className="text-sm font-semibold text-brand hover:underline">{t("bulk.clearSelection")}</button>
              </div>
            )}
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
            {pagination?.nextCursor !== null && pagination !== null && (
              <button
                type="button"
                onClick={() => loadFolder(folder, filters)}
                className="w-full rounded-lg border border-divider py-2 text-sm font-semibold text-text-body hover:bg-paper"
              >
                {tStates("loadMore")}
              </button>
            )}
          </>
        )}
      </div>

      <UploadDialog open={uploadOpen} defaultFolder={folder || "books"} onClose={() => setUploadOpen(false)} onUploaded={() => loadFolder(folder, filters, { silent: true })} />
      <NewFolderDialog open={newFolderOpen} parentFolder={folder} busy={newFolderBusy} error={newFolderError} onClose={() => setNewFolderOpen(false)} onCreate={doCreateFolder} />
      <RenameDialog file={renameTarget} busy={renameBusy} error={renameError} onClose={() => setRenameTarget(null)} onRename={doRename} />
      <MoveDialog file={moveTarget} busy={moveBusy} error={moveError} onClose={() => setMoveTarget(null)} onMove={doMove} />
      {detailsTarget && (
        <FileDetailsDrawer
          file={detailsTarget}
          canWrite={canWrite}
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
    </div>
  );
}
