"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Copy, Archive, Pencil, Send, X, Loader2 } from "lucide-react";
import { useToast, EmptyState } from "@/components/admin/kit";
import { ANNOUNCEMENT_TYPES, PRIORITIES } from "@/lib/admin/announcements/shared";
import type { AnnouncementTemplateRow } from "@/lib/admin/announcements/templates";
import {
  createAnnouncementTemplate,
  updateAnnouncementTemplate,
  archiveAnnouncementTemplate,
  duplicateAnnouncementTemplate,
  type TemplateInput,
} from "@/app/(admin)/admin/(protected)/announcements/templates-actions";

const EMPTY: TemplateInput = {
  name: "", type: "general", priority: "normal",
  titleEn: "", titleKm: "", summaryEn: "", summaryKm: "", bodyEn: "", bodyKm: "",
  ctaLabelEn: "", ctaLabelKm: "", ctaUrl: "",
  defaultChannels: { inApp: true, banner: false, push: false },
};

export default function AnnouncementTemplatesClient({ templates, canWrite }: { templates: AnnouncementTemplateRow[]; canWrite: boolean }) {
  const t = useTranslations("adminAnnouncements.templates");
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<AnnouncementTemplateRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleArchive(id: string) {
    setBusy(true);
    try {
      await archiveAnnouncementTemplate(id);
      toast.success(t("toasts.archived"));
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate(id: string) {
    setBusy(true);
    try {
      await duplicateAnnouncementTemplate(id);
      toast.success(t("toasts.duplicated"));
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-hover">
            <Plus className="h-4 w-4" /> {t("newTemplate")}
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <div key={tpl.id} className="rounded-xl border border-divider bg-bg-surface p-4">
              <p className="font-semibold text-text-heading">{tpl.name}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{tpl.titleEn}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/admin/announcements/new?template=${tpl.id}`} className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/20">
                  <Send className="h-3 w-3" /> {t("apply")}
                </Link>
                {canWrite && (
                  <>
                    <button onClick={() => setEditing(tpl)} className="inline-flex items-center gap-1 rounded-lg border border-divider px-2.5 py-1 text-xs font-semibold text-text-body hover:bg-paper">
                      <Pencil className="h-3 w-3" /> {t("edit")}
                    </button>
                    <button disabled={busy} onClick={() => handleDuplicate(tpl.id)} className="inline-flex items-center gap-1 rounded-lg border border-divider px-2.5 py-1 text-xs font-semibold text-text-body hover:bg-paper disabled:opacity-60">
                      <Copy className="h-3 w-3" /> {t("duplicate")}
                    </button>
                    <button disabled={busy} onClick={() => handleArchive(tpl.id)} className="inline-flex items-center gap-1 rounded-lg border border-divider px-2.5 py-1 text-xs font-semibold text-text-muted hover:bg-paper disabled:opacity-60">
                      <Archive className="h-3 w-3" /> {t("archive")}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          initial={editing === "new" ? EMPTY : templateToInput(editing)}
          id={editing === "new" ? null : editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); startTransition(() => router.refresh()); }}
        />
      )}
    </div>
  );
}

function templateToInput(tpl: AnnouncementTemplateRow): TemplateInput {
  return {
    name: tpl.name, type: tpl.type, priority: tpl.priority,
    titleEn: tpl.titleEn, titleKm: tpl.titleKm ?? "", summaryEn: tpl.summaryEn ?? "", summaryKm: tpl.summaryKm ?? "",
    bodyEn: tpl.bodyEn ?? "", bodyKm: tpl.bodyKm ?? "", ctaLabelEn: tpl.ctaLabelEn ?? "", ctaLabelKm: tpl.ctaLabelKm ?? "",
    ctaUrl: tpl.ctaUrl ?? "",
    defaultChannels: { inApp: tpl.defaultChannels.in_app, banner: tpl.defaultChannels.banner, push: tpl.defaultChannels.push },
  };
}

function TemplateEditor({ initial, id, onClose, onSaved }: { initial: TemplateInput; id: string | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAnnouncements.templates");
  const tType = useTranslations("adminAnnouncements.type");
  const toast = useToast();
  const [form, setForm] = useState<TemplateInput>(initial);
  const [saving, setSaving] = useState(false);

  function patch(fields: Partial<TemplateInput>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  async function save() {
    setSaving(true);
    try {
      if (id) await updateAnnouncementTemplate(id, form);
      else await createAnnouncementTemplate(form);
      toast.success(t("toasts.saved"));
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.failed"));
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-10 w-full rounded-lg border border-divider bg-paper px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30";
  const labelClass = "mb-1 block text-xs font-semibold text-text-muted";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-heading">{id ? t("editTemplate") : t("newTemplate")}</h2>
          <button onClick={onClose} aria-label={t("close")} className="text-text-muted hover:text-text-heading"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>{t("nameField")}</label>
            <input value={form.name} onChange={(e) => patch({ name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t("typeField")}</label>
              <select value={form.type} onChange={(e) => patch({ type: e.target.value })} className={inputClass}>
                {ANNOUNCEMENT_TYPES.map((ty) => <option key={ty} value={ty}>{tType(ty)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t("priorityField")}</label>
              <select value={form.priority} onChange={(e) => patch({ priority: e.target.value })} className={inputClass}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>{t("titleEnField")}</label>
            <input value={form.titleEn} onChange={(e) => patch({ titleEn: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t("titleKmField")}</label>
            <input value={form.titleKm} onChange={(e) => patch({ titleKm: e.target.value })} className={`${inputClass} font-khmer`} />
          </div>
          <div>
            <label className={labelClass}>{t("summaryEnField")}</label>
            <textarea value={form.summaryEn} onChange={(e) => patch({ summaryEn: e.target.value })} rows={2} className="w-full rounded-lg border border-divider bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
          <div>
            <label className={labelClass}>{t("ctaUrlField")}</label>
            <input value={form.ctaUrl} onChange={(e) => patch({ ctaUrl: e.target.value })} className={inputClass} />
          </div>
          <div>
            <span className={labelClass}>{t("defaultChannelsField")}</span>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.defaultChannels.inApp} onChange={(e) => patch({ defaultChannels: { ...form.defaultChannels, inApp: e.target.checked } })} /> {t("channelInApp")}</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.defaultChannels.banner} onChange={(e) => patch({ defaultChannels: { ...form.defaultChannels, banner: e.target.checked } })} /> {t("channelBanner")}</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.defaultChannels.push} onChange={(e) => patch({ defaultChannels: { ...form.defaultChannels, push: e.target.checked } })} /> {t("channelPush")}</label>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body hover:bg-paper">{t("cancel")}</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
