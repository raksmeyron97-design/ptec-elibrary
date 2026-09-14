"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { createJournal, deleteJournal, updateJournal, type JournalErrorCode, type JournalInput } from "@/app/actions/journals";
import { ConfirmDialog, useToast } from "@/components/admin/kit";
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  ButtonBusy,
  Field,
  FormSection,
  StickyActionBar,
  Switch,
  TEXTAREA_CLASS,
  UnsavedPill,
  focusFirstInvalid,
} from "@/components/admin/kit/form";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { isValidIssn } from "@/lib/seo/identifiers";
import type { Journal } from "@/lib/journals/types";

type FormState = Omit<JournalInput, "aliases"> & { aliases: string };

function toState(j: Journal | null): FormState {
  return {
    title: j?.title ?? "",
    title_km: j?.title_km ?? "",
    short_title: j?.short_title ?? "",
    slug: j?.slug ?? "",
    code: j?.code ?? "",
    aliases: (j?.aliases ?? []).join("\n"),
    description: j?.description ?? "",
    description_km: j?.description_km ?? "",
    aims_scope: j?.aims_scope ?? "",
    aims_scope_km: j?.aims_scope_km ?? "",
    publisher_name: j?.publisher_name ?? "",
    publisher_name_km: j?.publisher_name_km ?? "",
    issn: j?.issn ?? "",
    e_issn: j?.e_issn ?? "",
    print_issn: j?.print_issn ?? "",
    language: j?.language ?? "",
    country: j?.country ?? "",
    frequency: j?.frequency ?? "",
    website_url: j?.website_url ?? "",
    contact_email: j?.contact_email ?? "",
    cover_url: j?.cover_url ?? "",
    is_published: j?.is_published ?? false,
    is_indexable: j?.is_indexable ?? true,
  };
}

/** A Latin slug from a title; a Khmer title keeps its letters (the app's own slug rule). */
function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Create / edit a journal. Every field except the title is optional, because
 * nothing here may be invented: a journal with only a name renders only its
 * name. An ISSN is stored as typed but flagged when it fails its check digit —
 * the public page and structured data never publish an invalid one.
 */
export default function JournalForm({ initial }: { initial: Journal | null }) {
  const t = useTranslations("adminJournals");
  const router = useRouter();
  const toast = useToast();
  const mode = initial ? "edit" : "create";
  const allowed = useCan(mode === "edit" ? "journals.edit" : "journals.create");
  const canDelete = useCan("journals.delete");

  const [snapshot, setSnapshot] = useState(() => toState(initial));
  const [form, setForm] = useState(snapshot);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugFromTitle(String(value));
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const issnWarning = (v: string | null | undefined) => (v && v.trim() && !isValidIssn(v) ? t("fieldIssnHint") : undefined);

  function fieldForError(code: JournalErrorCode): keyof FormState | null {
    if (code === "errorTitleRequired") return "title";
    if (code === "errorSlug") return "slug";
    if (code === "errorDuplicate") return "title";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allowed || saving) return;
    if (!form.title.trim()) {
      setErrors({ title: t("errorTitleRequired") });
      requestAnimationFrame(() => focusFirstInvalid(e.currentTarget as HTMLElement));
      return;
    }
    setSaving(true);
    const payload: JournalInput = { ...form, aliases: form.aliases.split("\n") };
    const result = initial ? await updateJournal(initial.id, payload) : await createJournal(payload);
    setSaving(false);
    if (!result.ok) {
      const field = fieldForError(result.error);
      if (field) setErrors({ [field]: t(result.error) });
      toast.error(t(result.error));
      return;
    }
    toast.success(t("saved"));
    if (!initial) {
      router.push(`/admin/journals/${(result.data as { id: string }).id}`);
    } else {
      setSnapshot(form);
    }
    router.refresh();
  }

  async function onDelete() {
    if (!initial) return;
    setDeleting(true);
    const result = await deleteJournal(initial.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (!result.ok) {
      toast.error(t(result.error));
      return;
    }
    router.push("/admin/journals");
    router.refresh();
  }

  const text = (key: keyof FormState, label: string, opts: { required?: boolean; hint?: string; mono?: boolean; type?: string } = {}) => (
    <Field label={label} required={opts.required} hint={opts.hint} error={errors[key]}>
      {(p) => (
        <input
          {...p}
          type={opts.type ?? "text"}
          className={opts.mono ? `${p.className} font-mono` : p.className}
          value={String(form[key] ?? "")}
          disabled={!allowed}
          onChange={(ev) => {
            if (key === "slug") setSlugTouched(true);
            set(key, ev.target.value as FormState[typeof key]);
          }}
        />
      )}
    </Field>
  );

  const area = (key: keyof FormState, label: string, hint?: string) => (
    <Field label={label} hint={hint} error={errors[key]}>
      {(p) => (
        <textarea
          {...p}
          rows={4}
          className={`${TEXTAREA_CLASS}${p["aria-invalid"] ? " border-danger" : ""}`}
          value={String(form[key] ?? "")}
          disabled={!allowed}
          onChange={(ev) => set(key, ev.target.value as FormState[typeof key])}
        />
      )}
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-5xl space-y-6 rounded-2xl border border-divider bg-bg-surface pt-5">
      <div className="space-y-6 px-5">
        <FormSection title={t("sectionIdentity")}>
          {text("title", t("fieldTitle"), { required: true })}
          <div className="grid gap-4 sm:grid-cols-2">
            {text("title_km", t("fieldTitleKm"))}
            {text("short_title", t("fieldShortTitle"))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("slug", t("fieldSlug"), { required: true, hint: t("fieldSlugHint"), mono: true })}
            {text("code", t("fieldCode"))}
          </div>
          {area("aliases", t("fieldAliases"), t("fieldAliasesHint"))}
        </FormSection>

        <FormSection title={t("sectionAbout")} description={t("sectionAboutHint")}>
          {area("description", t("fieldDescription"))}
          {area("description_km", t("fieldDescriptionKm"))}
          {area("aims_scope", t("fieldAimsScope"))}
          {area("aims_scope_km", t("fieldAimsScopeKm"))}
        </FormSection>

        <FormSection title={t("sectionFacts")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("publisher_name", t("fieldPublisher"))}
            {text("publisher_name_km", t("fieldPublisherKm"))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("fieldIssn")} hint={issnWarning(form.issn)}>
              {(p) => <input {...p} className={`${p.className} font-mono`} value={form.issn ?? ""} disabled={!allowed} onChange={(e) => set("issn", e.target.value)} />}
            </Field>
            <Field label={t("fieldPrintIssn")} hint={issnWarning(form.print_issn)}>
              {(p) => <input {...p} className={`${p.className} font-mono`} value={form.print_issn ?? ""} disabled={!allowed} onChange={(e) => set("print_issn", e.target.value)} />}
            </Field>
            <Field label={t("fieldEIssn")} hint={issnWarning(form.e_issn)}>
              {(p) => <input {...p} className={`${p.className} font-mono`} value={form.e_issn ?? ""} disabled={!allowed} onChange={(e) => set("e_issn", e.target.value)} />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {text("language", t("fieldLanguage"))}
            {text("country", t("fieldCountry"))}
            {text("frequency", t("fieldFrequency"))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("website_url", t("fieldWebsite"), { type: "url" })}
            {text("contact_email", t("fieldEmail"), { type: "email" })}
          </div>
          {text("cover_url", t("fieldCover"), { type: "url" })}
        </FormSection>

        <FormSection title={t("sectionVisibility")}>
          <Switch
            checked={!!form.is_published}
            onChange={(v) => set("is_published", v)}
            label={t("fieldPublished")}
            description={t("fieldPublishedHint")}
            disabled={!allowed}
          />
          <Switch
            checked={!!form.is_indexable}
            onChange={(v) => set("is_indexable", v)}
            label={t("fieldIndexable")}
            disabled={!allowed}
          />
        </FormSection>

        {initial && canDelete && (
          <div className="border-t border-divider pt-4">
            <button type="button" className={BTN_DANGER} onClick={() => setConfirmDelete(true)}>
              {t("deleteJournal")}
            </button>
          </div>
        )}
      </div>

      {allowed && (
        <StickyActionBar status={dirty ? <UnsavedPill label={t("unsaved")} /> : null}>
          <button type="button" className={BTN_SECONDARY} onClick={() => router.push("/admin/journals")}>
            {t("backToList")}
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={saving || (mode === "edit" && !dirty)}>
            {saving ? <ButtonBusy label={t("saving")} /> : t("save")}
          </button>
        </StickyActionBar>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("deleteJournal")}
        description={
          <>
            <strong>{initial?.title}</strong> — {t("deleteConfirm")}
          </>
        }
        confirmLabel={t("deleteJournal")}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
      />
    </form>
  );
}
