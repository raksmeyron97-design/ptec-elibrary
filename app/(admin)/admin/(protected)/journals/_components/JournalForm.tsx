"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

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
import type { JournalSuggestion } from "@/lib/journals/lookup";
import { journalReadiness } from "@/lib/journals/readiness";
import {
  ACCESS_MODELS,
  COUNTRY_CODES,
  FREQUENCIES,
  INDEX_SERVICES,
  LANGUAGE_CODES,
  LICENSES,
  PEER_REVIEW_TYPES,
  countryCode,
  frequencyCode,
} from "@/lib/journals/vocab";
import CoverPicker, { uploadJournalCover, type CoverValue } from "./CoverPicker";
import IssnLookup from "./IssnLookup";
import ReadinessPanel from "./ReadinessPanel";

type FormState = Omit<JournalInput, "aliases" | "subjects" | "start_year" | "indexed_in"> & {
  aliases: string;
  subjects: string;
  start_year: string;
  indexed_in: string[];
};

function toState(j: Journal | null, prefillTitle?: string): FormState {
  return {
    title: j?.title ?? prefillTitle ?? "",
    title_km: j?.title_km ?? "",
    // A Khmer title with no stated source is shown as a translation, so the
    // form starts from the reading the public page already applies.
    title_km_source: j?.title_km_source ?? "library_translation",
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
    issn_l: j?.issn_l ?? "",
    language: j?.language ?? "",
    // Legacy free text that names a vocabulary entry ("United States",
    // "Monthly") loads as that entry; anything else is kept as typed.
    country: countryCode(j?.country) ?? j?.country ?? "",
    frequency: frequencyCode(j?.frequency) ?? j?.frequency ?? "",
    start_year: j?.start_year ? String(j.start_year) : "",
    subjects: (j?.subjects ?? []).join("\n"),
    website_url: j?.website_url ?? "",
    author_guidelines_url: j?.author_guidelines_url ?? "",
    editorial_board_url: j?.editorial_board_url ?? "",
    contact_email: j?.contact_email ?? "",
    cover_url: j?.cover_url ?? "",
    access_model: j?.access_model ?? "",
    default_license: j?.default_license ?? "",
    peer_review: j?.peer_review ?? "",
    indexed_in: j?.indexed_in ?? [],
    metadata_source: j?.metadata_source ?? "",
    is_published: j?.is_published ?? false,
    is_indexable: j?.is_indexable ?? true,
  };
}

/** A Latin slug from a title; a Khmer title keeps its letters (the app's own slug rule). */
function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

/**
 * Create / edit a journal the library indexes. Every field except the title
 * is optional, because nothing may be invented: a journal with only a name
 * renders only its name — and the Readiness panel beside the form says what
 * that costs the public page. Registry facts arrive through "Look up ISSN" as
 * suggestions the librarian accepts field by field.
 */
export default function JournalForm({
  initial,
  publishedArticleCount = 0,
  prefillTitle,
}: {
  initial: Journal | null;
  publishedArticleCount?: number;
  prefillTitle?: string;
}) {
  const t = useTranslations("adminJournals");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const mode = initial ? "edit" : "create";
  const allowed = useCan(mode === "edit" ? "journals.edit" : "journals.create");
  const canDelete = useCan("journals.delete");

  const [snapshot, setSnapshot] = useState(() => toState(initial, prefillTitle));
  const [form, setForm] = useState(snapshot);
  const [cover, setCover] = useState<CoverValue>({ url: initial?.cover_url ?? null, file: null });
  const [coverSnapshot, setCoverSnapshot] = useState<string | null>(initial?.cover_url ?? null);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(snapshot) || !!cover.file || cover.url !== coverSnapshot,
    [form, snapshot, cover, coverSnapshot],
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const readiness = useMemo(
    () =>
      journalReadiness({
        title: form.title,
        title_km: form.title_km || null,
        title_km_source: form.title_km_source === "official" || form.title_km_source === "library_translation" ? form.title_km_source : null,
        issn: form.issn || null,
        e_issn: form.e_issn || null,
        print_issn: form.print_issn || null,
        publisher_name: form.publisher_name || null,
        description: form.description || null,
        access_model: (form.access_model || null) as Journal["access_model"],
        peer_review: (form.peer_review || null) as Journal["peer_review"],
        indexed_in: form.indexed_in,
        language: form.language || null,
        country: form.country || null,
        frequency: form.frequency || null,
        website_url: form.website_url || null,
        cover_url: cover.file ? "pending" : cover.url,
        is_published: !!form.is_published,
        is_indexable: !!form.is_indexable,
        articleCount: publishedArticleCount,
      }),
    [form, cover, publishedArticleCount],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugFromTitle(String(value));
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const issnWarning = (v: string | null | undefined) => (v && v.trim() && !isValidIssn(v) ? t("fieldIssnHint") : undefined);

  function applySuggestion(values: JournalSuggestion, source: "crossref" | "issn_portal") {
    setForm((f) => ({
      ...f,
      ...(values.title !== undefined ? { title: values.title } : {}),
      ...(values.publisher_name !== undefined ? { publisher_name: values.publisher_name } : {}),
      ...(values.print_issn !== undefined ? { print_issn: values.print_issn } : {}),
      ...(values.e_issn !== undefined ? { e_issn: values.e_issn } : {}),
      ...(values.issn_l !== undefined ? { issn_l: values.issn_l } : {}),
      ...(values.country !== undefined ? { country: values.country } : {}),
      ...(values.subjects !== undefined ? { subjects: values.subjects.join("\n") } : {}),
      metadata_source: source,
    }));
  }

  function fieldForError(code: JournalErrorCode): keyof FormState | null {
    if (code === "errorTitleRequired") return "title";
    if (code === "errorSlug") return "slug";
    if (code === "errorDuplicate") return "title";
    if (code === "errorIssnInvalid") return "issn_l";
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (!allowed || phase !== "idle") return;
    if (!form.title.trim()) {
      setErrors({ title: t("errorTitleRequired") });
      requestAnimationFrame(() => focusFirstInvalid(formEl));
      return;
    }

    let coverUrl = cover.url;
    if (cover.file) {
      setPhase("uploading");
      try {
        coverUrl = await uploadJournalCover(cover.file);
      } catch (err) {
        setPhase("idle");
        // The old cover stays; the file stays selected so a retry is one click.
        toast.error(t("errorCoverUpload", { message: err instanceof Error ? err.message : String(err) }));
        return;
      }
    }

    setPhase("saving");
    const payload: JournalInput = {
      ...form,
      cover_url: coverUrl,
      aliases: lines(form.aliases),
      subjects: lines(form.subjects),
      indexed_in: form.indexed_in,
      start_year: form.start_year,
      metadata_source: form.metadata_source || "manual",
    };
    const result = initial ? await updateJournal(initial.id, payload) : await createJournal(payload);
    setPhase("idle");
    if (!result.ok) {
      const field = fieldForError(result.error);
      if (field) {
        setErrors({ [field]: t(result.error) });
        requestAnimationFrame(() => focusFirstInvalid(formEl));
      }
      toast.error(t(result.error));
      // A cover that did upload is kept in state, so a retry does not re-upload it.
      if (cover.file) setCover({ url: coverUrl, file: null });
      return;
    }
    toast.success(t("saved"));
    if (!initial) {
      router.push(`/admin/journals/${(result.data as { id: string }).id}`);
    } else {
      setSnapshot(form);
      setCover({ url: coverUrl, file: null });
      setCoverSnapshot(coverUrl);
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

  const disabled = !allowed || phase !== "idle";

  const text = (key: keyof FormState, label: string, opts: { required?: boolean; hint?: string; mono?: boolean; type?: string; inputMode?: "numeric" } = {}) => (
    <Field label={label} required={opts.required} hint={opts.hint} error={errors[key]}>
      {(p) => (
        <input
          {...p}
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          className={opts.mono ? `${p.className} font-mono` : p.className}
          value={String(form[key] ?? "")}
          disabled={disabled}
          onChange={(ev) => {
            if (key === "slug") setSlugTouched(true);
            set(key, ev.target.value as FormState[typeof key]);
          }}
        />
      )}
    </Field>
  );

  const area = (key: keyof FormState, label: string, hint?: string, lang?: string) => (
    <Field label={label} hint={hint} error={errors[key]}>
      {(p) => (
        <textarea
          {...p}
          rows={4}
          lang={lang}
          className={`${TEXTAREA_CLASS}${p["aria-invalid"] ? " border-danger" : ""}`}
          value={String(form[key] ?? "")}
          disabled={disabled}
          onChange={(ev) => set(key, ev.target.value as FormState[typeof key])}
        />
      )}
    </Field>
  );

  /** A select over a closed list; a stored value outside the list is kept as its own option. */
  const select = (key: keyof FormState, label: string, options: { value: string; label: string }[], hint?: string) => {
    const value = String(form[key] ?? "");
    const known = value === "" || options.some((o) => o.value === value);
    return (
      <Field label={label} hint={hint} error={errors[key]}>
        {(p) => (
          <select {...p} value={value} disabled={disabled} onChange={(ev) => set(key, ev.target.value as FormState[typeof key])}>
            <option value="">{t("notStated")}</option>
            {!known && <option value={value}>{t("keepCurrent", { value })}</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </Field>
    );
  };

  const displayNames = (type: "language" | "region") => {
    try {
      return new Intl.DisplayNames([locale === "km" ? "km" : "en"], { type });
    } catch {
      return null;
    }
  };
  const langNames = displayNames("language");
  const regionNames = displayNames("region");
  const languageOptions = LANGUAGE_CODES.map((c) => ({ value: c, label: langNames?.of(c) ?? c }));
  // A code outside the shortlist (from a registry lookup) is still named, not "Keep: XX".
  const countryOptions = [
    ...COUNTRY_CODES.map((c) => ({ value: c, label: regionNames?.of(c) ?? c })),
    ...(form.country && /^[A-Z]{2}$/.test(form.country) && !(COUNTRY_CODES as readonly string[]).includes(form.country)
      ? [{ value: form.country, label: regionNames?.of(form.country) ?? form.country }]
      : []),
  ];

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div className="min-w-0 space-y-6 rounded-2xl border border-divider bg-bg-surface pt-5">
        <div className="space-y-6 px-5">
          <FormSection title={t("sectionIdentity")}>
            {text("title", t("fieldTitle"), { required: true })}
            <div className="grid gap-4 sm:grid-cols-2">
              {text("short_title", t("fieldShortTitle"))}
              {text("code", t("fieldCode"))}
            </div>
            {text("slug", t("fieldSlug"), { required: true, hint: t("fieldSlugHint"), mono: true })}
            {text("title_km", t("fieldTitleKm"))}
            {form.title_km?.trim() && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-text-body">{t("fieldTitleKmSource")}</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {(["official", "library_translation"] as const).map((v) => (
                    <label key={v} className="inline-flex min-h-6 items-center gap-2 text-sm text-text-body">
                      <input
                        type="radio"
                        name="title_km_source"
                        value={v}
                        className="focus-field h-4 w-4"
                        checked={form.title_km_source === v}
                        disabled={disabled}
                        onChange={() => set("title_km_source", v)}
                      />
                      {v === "official" ? t("titleKmOfficial") : t("titleKmTranslation")}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-text-muted">{t("fieldTitleKmSourceHint")}</p>
              </fieldset>
            )}
            {area("aliases", t("fieldAliases"), t("fieldAliasesHint"))}
          </FormSection>

          <FormSection title={t("sectionIdentifiers")} description={t("sectionIdentifiersHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fieldPrintIssn")} hint={issnWarning(form.print_issn)}>
                {(p) => <input {...p} className={`${p.className} font-mono`} value={form.print_issn ?? ""} disabled={disabled} onChange={(e) => set("print_issn", e.target.value)} />}
              </Field>
              <Field label={t("fieldEIssn")} hint={issnWarning(form.e_issn)}>
                {(p) => <input {...p} className={`${p.className} font-mono`} value={form.e_issn ?? ""} disabled={disabled} onChange={(e) => set("e_issn", e.target.value)} />}
              </Field>
              <Field label={t("fieldIssn")} hint={issnWarning(form.issn)}>
                {(p) => <input {...p} className={`${p.className} font-mono`} value={form.issn ?? ""} disabled={disabled} onChange={(e) => set("issn", e.target.value)} />}
              </Field>
              <Field label={t("fieldIssnL")} hint={issnWarning(form.issn_l)} error={errors.issn_l}>
                {(p) => <input {...p} className={`${p.className} font-mono`} value={form.issn_l ?? ""} disabled={disabled} onChange={(e) => set("issn_l", e.target.value)} />}
              </Field>
            </div>
            <IssnLookup
              candidates={[form.print_issn, form.e_issn, form.issn, form.issn_l]}
              current={{
                title: form.title,
                publisher_name: form.publisher_name ?? "",
                print_issn: form.print_issn ?? "",
                e_issn: form.e_issn ?? "",
                issn_l: form.issn_l ?? "",
                country: form.country ?? "",
                subjects: lines(form.subjects),
              }}
              onApply={applySuggestion}
              disabled={disabled}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {text("publisher_name", t("fieldPublisher"))}
              {text("publisher_name_km", t("fieldPublisherKm"))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {select("language", t("fieldLanguage"), languageOptions)}
              {select("country", t("fieldCountry"), countryOptions)}
              {select(
                "frequency",
                t("fieldFrequency"),
                FREQUENCIES.map((f) => ({ value: f, label: t(`frequency.${f}`) })),
              )}
              {text("start_year", t("fieldStartYear"), { inputMode: "numeric" })}
            </div>
            {area("subjects", t("fieldSubjects"), t("fieldSubjectsHint"))}
          </FormSection>

          <FormSection title={t("sectionAbout")} description={t("sectionAboutHint")}>
            {area("description", t("fieldDescription"))}
            {area("description_km", t("fieldDescriptionKm"), undefined, "km")}
            {area("aims_scope", t("fieldAimsScope"))}
            {area("aims_scope_km", t("fieldAimsScopeKm"), undefined, "km")}
          </FormSection>

          <FormSection title={t("sectionAccess")} description={t("sectionAccessHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {select("access_model", t("fieldAccessModel"), ACCESS_MODELS.map((m) => ({ value: m, label: t(`accessModel.${m}`) })))}
              {select("peer_review", t("fieldPeerReview"), PEER_REVIEW_TYPES.map((m) => ({ value: m, label: t(`peerReview.${m}`) })))}
              {select(
                "default_license",
                t("fieldLicense"),
                LICENSES.map((l) => ({ value: l.id, label: l.name || t("licensePublisher") })),
              )}
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-text-body">{t("fieldIndexedIn")}</legend>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {INDEX_SERVICES.map((s) => (
                  <label key={s.id} className="inline-flex min-h-6 items-center gap-2 text-sm text-text-body">
                    <input
                      type="checkbox"
                      className="focus-field h-4 w-4 rounded border-divider"
                      checked={form.indexed_in.includes(s.id)}
                      disabled={disabled}
                      onChange={(e) =>
                        set(
                          "indexed_in",
                          e.target.checked ? [...form.indexed_in, s.id] : form.indexed_in.filter((x) => x !== s.id),
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </FormSection>

          <FormSection title={t("sectionLinks")} description={t("sectionLinksHint")}>
            {text("website_url", t("fieldWebsite"), { type: "url" })}
            <div className="grid gap-4 sm:grid-cols-2">
              {text("author_guidelines_url", t("fieldAuthorGuidelines"), { type: "url" })}
              {text("editorial_board_url", t("fieldEditorialBoard"), { type: "url" })}
            </div>
            {text("contact_email", t("fieldEmail"), { type: "email" })}
          </FormSection>

          <FormSection title={t("sectionCover")}>
            <CoverPicker label={t("fieldCover")} value={cover} onChange={setCover} disabled={disabled} />
          </FormSection>

          <FormSection title={t("sectionVisibility")}>
            <Switch
              checked={!!form.is_published}
              onChange={(v) => set("is_published", v)}
              label={t("fieldPublished")}
              description={t("fieldPublishedHint")}
              disabled={disabled}
            />
            <Switch
              checked={!!form.is_indexable}
              onChange={(v) => set("is_indexable", v)}
              label={t("fieldIndexable")}
              disabled={disabled}
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
            <button type="submit" className={BTN_PRIMARY} disabled={phase !== "idle" || (mode === "edit" && !dirty)}>
              {phase === "uploading" ? (
                <ButtonBusy label={t("uploadingCover")} />
              ) : phase === "saving" ? (
                <ButtonBusy label={t("saving")} />
              ) : mode === "edit" ? (
                t("saveChanges")
              ) : (
                t("createJournal")
              )}
            </button>
          </StickyActionBar>
        )}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-24">
        <ReadinessPanel readiness={readiness} />
      </aside>

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
