"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X, Download, Link2, Pencil, FolderInput, Copy, RefreshCw, Trash2, FileText, ExternalLink } from "lucide-react";
import type { StorageFile } from "@/lib/types/storage";
import { formatBytes, formatDateTime, fileKind, adminStorageDownloadHref } from "@/lib/admin/storage-shared";
import { getStorageSignedUrlAction, resolveStorageFileUsageAction, type StorageUsageRef } from "@/app/actions/storage";
import { useToast } from "@/components/admin/kit";
import type { StorageItemIntent } from "./StorageItemMenu";
import StorageTypeIcon from "./StorageTypeIcon";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-divider px-5 py-4">
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[13px]">
      <span className="text-text-muted">{label}</span>
      <span className="max-w-[60%] break-words text-right font-medium text-text-body">{value}</span>
    </div>
  );
}

export default function FileDetailsDrawer({
  file,
  canWrite,
  uploaderName,
  onClose,
  onIntent,
}: {
  file: StorageFile | null;
  canWrite: boolean;
  /** Resolved display name for `file.uploadedBy`; undefined until the lookup
   *  lands, empty when the account no longer exists. Never a raw id. */
  uploaderName?: string;
  onClose: () => void;
  onIntent: (intent: StorageItemIntent) => void;
}) {
  const t = useTranslations("adminStorage.details");
  const tActions = useTranslations("adminStorage.actions");
  const tCat = useTranslations("adminStorage.categories");
  const tVisibility = useTranslations("adminStorage.visibility");
  const locale = useLocale();
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const [usage, setUsage] = useState<{ refs: StorageUsageRef[]; checked: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const [checksumCopied, setChecksumCopied] = useState(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      // A modal you can Tab out of leaves the operator driving a page they
      // cannot see — the same trap the logs drawer already closes.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (!file) return;
    setUsage(null);
    let alive = true;
    resolveStorageFileUsageAction(file.storageKey).then((res) => {
      if (!alive) return;
      if (res.ok) setUsage({ refs: res.data.refs, checked: res.data.checkedAllSources });
      else setUsage({ refs: [], checked: false });
    });
    return () => { alive = false; };
  }, [file]);

  if (!file) return null;
  const kind = fileKind(file.extension);

  async function copyLink() {
    if (!file) return;
    setCopying(true);
    const res = await getStorageSignedUrlAction(file.storageKey);
    setCopying(false);
    if (res.ok) {
      await navigator.clipboard.writeText(res.data.url);
      toast.success(tActions("linkCopied"));
    } else {
      toast.error(res.error.message);
    }
  }

  async function copyChecksum(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setChecksumCopied(true);
      setTimeout(() => setChecksumCopied(false), 1600);
    } catch { /* clipboard unavailable — the prefix is still selectable */ }
  }

  const actionBtn = "focus-field inline-flex items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3 py-2 text-[13px] font-semibold text-text-body shadow-sm transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label={t("title")}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} tabIndex={-1} className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-bg-surface shadow-2xl outline-none sm:max-w-[440px]">
        {/* The heading said "File details" while the file's own name sat in a
            `title` attribute nobody sees. Two panels open from two rows looked
            identical. */}
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-divider bg-bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("title")}</p>
            <h2 className="truncate text-base font-bold leading-tight text-text-heading" title={file.originalName}>
              {file.originalName}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")} className="focus-field flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-center border-b border-divider bg-paper p-6">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={adminStorageDownloadHref(file.storageKey, "preview")} alt="" className="max-h-56 max-w-full rounded-lg object-contain shadow-sm" />
          ) : kind === "pdf" ? (
            <a href={adminStorageDownloadHref(file.storageKey, "preview")} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-text-muted hover:text-brand">
              <FileText className="h-14 w-14" />
              <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold">{tActions("preview")} <ExternalLink className="h-3 w-3" /></span>
            </a>
          ) : (
            <div className="flex flex-col items-center gap-2 text-text-muted">
              <StorageTypeIcon type="file" extension={file.extension} className="h-14 w-14" />
              <span className="text-[12.5px]">{t("noPreview")}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 py-4">
          <a href={adminStorageDownloadHref(file.storageKey, "download")} className={actionBtn}><Download className="h-4 w-4" /> {tActions("download")}</a>
          <button type="button" className={actionBtn} onClick={copyLink} disabled={copying}><Link2 className="h-4 w-4" /> {tActions("copyLink")}</button>
          {canWrite && (
            <>
              <button type="button" className={actionBtn} onClick={() => onIntent("rename")}><Pencil className="h-4 w-4" /> {tActions("rename")}</button>
              <button type="button" className={actionBtn} onClick={() => onIntent("move")}><FolderInput className="h-4 w-4" /> {tActions("move")}</button>
              <button type="button" className={actionBtn} onClick={() => onIntent("copy")}><Copy className="h-4 w-4" /> {tActions("copy")}</button>
              <button type="button" className={actionBtn} onClick={() => onIntent("replace")}><RefreshCw className="h-4 w-4" /> {tActions("replace")}</button>
              <button type="button" className={`${actionBtn} col-span-2 border-danger-line bg-danger-soft text-danger-text`} onClick={() => onIntent("trash")}><Trash2 className="h-4 w-4" /> {tActions("trash")}</button>
            </>
          )}
        </div>

        <Section title={t("metadata")}>
          <Field label={t("filename")} value={file.name} />
          <Field label={t("originalName")} value={file.originalName} />
          <Field label={t("fileType")} value={file.extension.toUpperCase()} />
          <Field label={t("fileSize")} value={formatBytes(file.size)} />
          <Field label={t("category")} value={tCat.has(file.folder.split("/")[0] ?? "") ? tCat(file.folder.split("/")[0] ?? "") : file.folder} />
          {/* A stored enum is a key: "private" is not a label. */}
          <Field label={t("visibility")} value={tVisibility(file.visibility)} />
          <Field label={t("uploaded")} value={formatDateTime(file.createdAt, locale)} />
          <Field label={t("modified")} value={formatDateTime(file.updatedAt, locale)} />
          {file.uploadedBy && <Field label={t("uploadedBy")} value={uploaderName || t("unknownUploader")} />}
          {file.checksum && (
            <Field
              label={t("checksum")}
              value={
                /* A truncated hash cannot be compared against anything, which
                   is the only use a checksum has — so the control copies the
                   whole value rather than displaying a prefix. */
                <button
                  type="button"
                  onClick={() => copyChecksum(file.checksum as string)}
                  className="focus-field rounded font-mono text-[11px] text-text-body hover:text-brand"
                  aria-label={t("copyChecksum")}
                >
                  {checksumCopied ? t("copied") : `${file.checksum.slice(0, 16)}…`}
                </button>
              }
            />
          )}
        </Section>

        <Section title={t("usedBy")}>
          {usage === null ? (
            <div className="animate-pulse space-y-1.5" aria-hidden="true">
              <div className="h-3 w-4/5 rounded bg-paper" />
              <div className="h-3 w-3/5 rounded bg-paper" />
            </div>
          ) : usage.refs.length === 0 ? (
            <p className="text-[13px] text-text-muted">{usage.checked ? t("usedByNone") : t("usedByUnknown")}</p>
          ) : (
            <ul className="space-y-1 text-[13px] text-text-body">
              {usage.refs.map((ref, i) => (
                <li key={`${ref.table}-${ref.id}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{ref.title ?? ref.id}</span>
                  <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10.5px] font-semibold text-text-muted">{ref.table}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
