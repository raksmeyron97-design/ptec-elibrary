"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createThesis, updateThesis } from "@/app/actions/theses";
import { autosaveThesisDraft, getThesisDraft, discardThesisDraft, type ThesisDraftKey, type ThesisDraftPayload } from "@/app/actions/thesis-drafts";
import { slugify as fileSlugify, makeUid } from "@/lib/book-utils";
import { SITE_URL } from "@/lib/seo/site";
import { validateThesisDraft, validateThesisPublish, firstValidationError, type ThesisValidationErrors } from "@/lib/admin/thesis-validation";
import { validateClientFile, sanitizeFilename, type SupplementaryFile } from "@/lib/admin/thesis-file-validation";
import { slugify, type ThesisStatus, type ThesisType, type ThesisLanguage } from "@/lib/admin/theses-shared";
import ThesisStepNav, { THESIS_STEPS, type ThesisStepKey } from "./ThesisStepNav";
import ThesisStickyActions from "./ThesisStickyActions";
import BasicInfoStep from "./BasicInfoStep";
import ClassificationStep from "./ClassificationStep";
import PeopleStep from "./PeopleStep";
import AbstractKeywordsStep from "./AbstractKeywordsStep";
import ReferencesStep from "./ReferencesStep";
import FilesStep, { type PendingSupplementaryFile } from "./FilesStep";
import ReviewPublishStep from "./ReviewPublishStep";
import ThesisPreview from "./ThesisPreview";
import type { CascadeValues } from "@/app/(admin)/admin/(protected)/theses/_components/ProgramCohortFields";

type Phase = "idle" | "uploading" | "saving";
type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

export type ThesisInitial = {
  id: string;
  title: string;
  slug: string;
  doi: string | null;
  thesisType: string | null;
  language: string | null;
  license: string | null;
  program: string | null;
  faculty: string | null;
  subject: string | null;
  cohort: string | null;
  academicYear: string | null;
  authorNames: string | null;
  advisorName: string | null;
  coAdvisorName: string | null;
  publishedAt: string | null;
  defenseDate: string | null;
  submittedDate: string | null;
  abstract: string | null;
  keywords: string[];
  references: string | null;
  coverUrl: string | null;
  coverAltText: string | null;
  fileUrl: string | null;
  fileSizeKb: number | null;
  supplementaryFiles: SupplementaryFile[];
  status: ThesisStatus;
  scheduledAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: string | null;
};

const NEW_THESIS_DRAFT_KEY_STORAGE = "thesis-draft-key:new";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function ThesisForm({ initial }: { initial?: ThesisInitial }) {
  const router = useRouter();
  const isEdit = !!initial;

  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<ThesisStepKey>("basic");

  // ── Basic Info ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [doi, setDoi] = useState(initial?.doi ?? "");
  const [thesisType, setThesisType] = useState<ThesisType>((initial?.thesisType as ThesisType) ?? "thesis");
  const [language, setLanguage] = useState<ThesisLanguage>((initial?.language as ThesisLanguage) ?? "km");
  const [license, setLicense] = useState(initial?.license ?? "");

  // ── Classification ──────────────────────────────────────────────────────
  const [programFields, setProgramFields] = useState<CascadeValues>({
    program: initial?.program ?? "",
    faculty: initial?.faculty ?? "",
    subject: initial?.subject ?? "",
    cohort: initial?.cohort ?? "",
    academicYear: initial?.academicYear ?? "",
  });

  // ── People ───────────────────────────────────────────────────────────────
  const [authors, setAuthors] = useState<string[]>(() => {
    const raw = initial?.authorNames?.trim();
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [""];
  });
  const [advisorName, setAdvisorName] = useState(initial?.advisorName ?? "");
  const [coAdvisorName, setCoAdvisorName] = useState(initial?.coAdvisorName ?? "");
  const [publishedAt, setPublishedAt] = useState(toDateInput(initial?.publishedAt ?? null));
  const [defenseDate, setDefenseDate] = useState(toDateInput(initial?.defenseDate ?? null));
  const [submittedDate, setSubmittedDate] = useState(toDateInput(initial?.submittedDate ?? null));

  // ── Abstract & Keywords ──────────────────────────────────────────────────
  const [abstract, setAbstract] = useState(initial?.abstract ?? "");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);

  // ── References ───────────────────────────────────────────────────────────
  const [references, setReferences] = useState<string[]>(() => {
    const raw = initial?.references?.trim();
    return raw ? raw.split(/\r?\n+/).filter(Boolean) : [];
  });

  // ── Files & Cover ────────────────────────────────────────────────────────
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [coverAltText, setCoverAltText] = useState(initial?.coverAltText ?? "");
  const [supplementaryExisting, setSupplementaryExisting] = useState<SupplementaryFile[]>(initial?.supplementaryFiles ?? []);
  const [supplementaryNew, setSupplementaryNew] = useState<PendingSupplementaryFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // ── Review & Publish ─────────────────────────────────────────────────────
  const [status, setStatus] = useState<ThesisStatus>(initial?.status ?? "draft");
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocal(initial?.scheduledAt ?? null));
  const [scheduledAtError, setScheduledAtError] = useState<string | null>(null);
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [ogImage, setOgImage] = useState(initial?.ogImage ?? "");

  const busy = phase !== "idle";
  const wasPublished = initial?.status === "published";

  function handleCoverChange(file: File | null) {
    if (!file) { setCoverFile(null); setCoverPreview(null); return; }
    const result = validateClientFile(file, "cover");
    if (!result.ok) { setFileError(result.error); return; }
    setFileError(null);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setCoverRemoved(false);
  }
  function handleCoverRemove() {
    setCoverRemoved(true);
    setCoverFile(null);
    setCoverPreview(null);
  }
  function handlePdfChange(file: File | null) {
    if (file) {
      const result = validateClientFile(file, "pdf");
      if (!result.ok) { setFileError(result.error); return; }
    }
    setFileError(null);
    setPdfFile(file);
  }
  function addSupplementary(files: File[]) {
    setSupplementaryNew((prev) => [...prev, ...files.map((file) => ({ file, description: "" }))]);
  }
  function removeExistingSupplementary(url: string) {
    setSupplementaryExisting((prev) => prev.filter((f) => f.url !== url));
  }
  function removeNewSupplementary(index: number) {
    setSupplementaryNew((prev) => prev.filter((_, i) => i !== index));
  }
  function updateSupplementaryDescription(index: number, description: string) {
    setSupplementaryNew((prev) => prev.map((item, i) => (i === index ? { ...item, description } : item)));
  }

  // ── Live validation (drives step nav badges + gates publish) ────────────
  const authorNamesJoined = authors.map((a) => a.trim()).filter(Boolean).join(", ");
  const referencesJoined = references.filter((r) => r.trim()).join("\n");
  const effectiveFileUrl = pdfFile ? "pending" : (coverRemoved ? null : initial?.fileUrl ?? null);
  const effectiveCoverUrl = coverFile ? "pending" : (coverRemoved ? null : initial?.coverUrl ?? null);

  const publishErrors: ThesisValidationErrors = useMemo(
    () => validateThesisPublish({
      title, slug, program: programFields.program || null, cohort: programFields.cohort || null,
      academicYear: programFields.academicYear || null, authorNames: authorNamesJoined || null,
      advisorName: advisorName || null, fileUrl: effectiveFileUrl, coverUrl: effectiveCoverUrl,
      abstract: abstract || null, keywords, references: referencesJoined || null, license: license || null,
    }),
    [title, slug, programFields.program, programFields.cohort, programFields.academicYear, authorNamesJoined, advisorName, effectiveFileUrl, effectiveCoverUrl, abstract, keywords, referencesJoined, license],
  );

  const stepErrorCounts: Partial<Record<ThesisStepKey, number>> = {
    basic: [publishErrors.title, publishErrors.slug].filter(Boolean).length,
    classification: [publishErrors.program, publishErrors.cohort, publishErrors.academicYear].filter(Boolean).length,
    people: [publishErrors.authorNames].filter(Boolean).length,
    files: [publishErrors.fileUrl].filter(Boolean).length,
  };
  const completedSteps = new Set<ThesisStepKey>(
    THESIS_STEPS.filter((s) => (stepErrorCounts[s.key] ?? 0) === 0).map((s) => s.key),
  );

  // ── Autosave ─────────────────────────────────────────────────────────────
  // Drafts are stored separately from the live research_reports row (see
  // migration 0076) — autosave must never push in-progress edits onto a
  // published thesis's public content.
  const [draftKey, setDraftKey] = useState<string>("");
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [availableDraft, setAvailableDraft] = useState<{ payload: ThesisDraftPayload; updatedAt: string } | null>(null);
  const didMountAutosaveRef = useRef(false);
  const dirtyRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payloadRef = useRef<ThesisDraftPayload>({});

  useEffect(() => {
    if (isEdit) return;
    const existing = sessionStorage.getItem(NEW_THESIS_DRAFT_KEY_STORAGE);
    if (existing) { setDraftKey(existing); return; }
    const key = crypto.randomUUID();
    sessionStorage.setItem(NEW_THESIS_DRAFT_KEY_STORAGE, key);
    setDraftKey(key);
  }, [isEdit]);

  const draftTarget: ThesisDraftKey | null = isEdit ? { thesisId: initial!.id } : draftKey ? { draftKey } : null;
  const draftTargetKey = draftTarget ? ("thesisId" in draftTarget ? `thesis:${draftTarget.thesisId}` : `key:${draftTarget.draftKey}`) : null;

  useEffect(() => {
    if (!draftTarget) return;
    getThesisDraft(draftTarget).then((draft) => { if (draft) setAvailableDraft(draft); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTargetKey]);

  useEffect(() => {
    payloadRef.current = {
      title, slug, doi, thesisType, language, license, programFields, authors, advisorName, coAdvisorName,
      publishedAt, defenseDate, submittedDate, abstract, keywords, references, coverAltText,
      status, scheduledAt, seoTitle, seoDescription, ogImage,
    };
  });

  const performSave = useCallback(async () => {
    if (!draftTarget) return;
    setAutosaveStatus("saving");
    const res = await autosaveThesisDraft(draftTarget, payloadRef.current);
    dirtyRef.current = false;
    setAutosaveStatus(res.success ? "saved" : "error");
    if (res.success) setTimeout(() => setAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTargetKey]);

  useEffect(() => {
    if (!draftTarget) return;
    if (!didMountAutosaveRef.current) { didMountAutosaveRef.current = true; return; }
    dirtyRef.current = true;
    setAutosaveStatus("unsaved");
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(performSave, 2000);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, slug, doi, thesisType, language, license, programFields, authors, advisorName, coAdvisorName, publishedAt, defenseDate, submittedDate, abstract, keywords, references, coverAltText, status, scheduledAt, seoTitle, seoDescription, ogImage, draftTargetKey]);

  useEffect(() => {
    const interval = setInterval(() => { if (dirtyRef.current) performSave(); }, 25_000);
    return () => clearInterval(interval);
  }, [performSave]);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (autosaveStatus === "unsaved" || autosaveStatus === "saving") { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autosaveStatus]);

  function restoreDraft() {
    if (!availableDraft) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = availableDraft.payload as any;
    if (typeof p.title === "string") setTitle(p.title);
    if (typeof p.slug === "string") setSlug(p.slug);
    if (typeof p.doi === "string") setDoi(p.doi);
    if (typeof p.thesisType === "string") setThesisType(p.thesisType);
    if (typeof p.language === "string") setLanguage(p.language);
    if (typeof p.license === "string") setLicense(p.license);
    if (p.programFields) setProgramFields(p.programFields);
    if (Array.isArray(p.authors)) setAuthors(p.authors);
    if (typeof p.advisorName === "string") setAdvisorName(p.advisorName);
    if (typeof p.coAdvisorName === "string") setCoAdvisorName(p.coAdvisorName);
    if (typeof p.publishedAt === "string") setPublishedAt(p.publishedAt);
    if (typeof p.defenseDate === "string") setDefenseDate(p.defenseDate);
    if (typeof p.submittedDate === "string") setSubmittedDate(p.submittedDate);
    if (typeof p.abstract === "string") setAbstract(p.abstract);
    if (Array.isArray(p.keywords)) setKeywords(p.keywords);
    if (Array.isArray(p.references)) setReferences(p.references);
    if (typeof p.coverAltText === "string") setCoverAltText(p.coverAltText);
    if (typeof p.status === "string") setStatus(p.status);
    if (typeof p.scheduledAt === "string") setScheduledAt(p.scheduledAt);
    if (typeof p.seoTitle === "string") setSeoTitle(p.seoTitle);
    if (typeof p.seoDescription === "string") setSeoDescription(p.seoDescription);
    if (typeof p.ogImage === "string") setOgImage(p.ogImage);
    setAvailableDraft(null);
  }
  function discardDraft() {
    if (draftTarget) discardThesisDraft(draftTarget).catch(() => {});
    setAvailableDraft(null);
  }

  const fail = (msg: string, step: ThesisStepKey) => {
    setError(msg);
    setActiveStep(step);
  };

  async function uploadOne(file: File, key: string, target: "public" | "private", extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("key", key);
    fd.set("target", target);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Upload failed (${res.status})`);
    }
    return res.json() as Promise<{ url: string; contentHash?: string }>;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setScheduledAtError(null);

    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "draft" ? "draft" : "submit";
    const effectiveStatus: ThesisStatus = intent === "draft" ? "draft" : status;

    const finalSlug = slugify(slug || title);
    const finalAuthorNames = authors.map((a) => a.trim()).filter(Boolean).join(", ");
    const finalReferences = references.filter((r) => r.trim()).join("\n");

    const draftErrorMsg = firstValidationError(validateThesisDraft({ title }));
    if (draftErrorMsg) return fail(draftErrorMsg, "basic");

    if (effectiveStatus === "published" || effectiveStatus === "scheduled") {
      const errors = validateThesisPublish({
        title, slug: finalSlug, program: programFields.program || null, cohort: programFields.cohort || null,
        academicYear: programFields.academicYear || null, authorNames: finalAuthorNames || null,
        advisorName: advisorName || null, fileUrl: effectiveFileUrl, coverUrl: effectiveCoverUrl,
        abstract: abstract || null, keywords, references: finalReferences || null, license: license || null,
      });
      const stepForError: [keyof ThesisValidationErrors, ThesisStepKey][] = [
        ["title", "basic"], ["slug", "basic"], ["program", "classification"], ["cohort", "classification"],
        ["academicYear", "classification"], ["authorNames", "people"], ["fileUrl", "files"],
      ];
      for (const [key, step] of stepForError) {
        if (errors[key]) return fail(errors[key]!, step);
      }
      if (effectiveStatus === "scheduled") {
        const when = new Date(scheduledAt);
        if (!scheduledAt || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
          setScheduledAtError("Scheduled time must be a valid future date/time");
          return fail("Scheduled time must be a valid future date/time", "review");
        }
      }
    }

    setPhase("uploading");
    try {
      const uid = makeUid();
      const titleSlug = fileSlugify(title || "thesis");
      const folder = `reports/${titleSlug}-${uid}`;

      let finalPdfUrl = initial?.fileUrl ?? null;
      let fileSizeKb = initial?.fileSizeKb ?? null;
      let contentHash: string | null = null;
      if (pdfFile) {
        setUploadProgress("Uploading PDF…");
        const res = await uploadOne(pdfFile, `${folder}/thesis.pdf`, "private", isEdit ? { excludeType: "research", excludeId: initial!.id } : {});
        finalPdfUrl = res.url;
        fileSizeKb = Math.round(pdfFile.size / 1024);
        contentHash = res.contentHash ?? null;
      }

      let finalCoverUrl: string | null = coverRemoved ? null : initial?.coverUrl ?? null;
      if (coverFile) {
        setUploadProgress("Uploading cover…");
        const ext = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const res = await uploadOne(coverFile, `${folder}/cover.${ext}`, "public");
        finalCoverUrl = res.url;
      }

      const uploadedSupplementary: SupplementaryFile[] = [...supplementaryExisting];
      for (let i = 0; i < supplementaryNew.length; i++) {
        setUploadProgress(`Uploading supplementary file ${i + 1} of ${supplementaryNew.length}…`);
        const item = supplementaryNew[i];
        const safeName = sanitizeFilename(item.file.name);
        const res = await uploadOne(item.file, `${folder}/supplementary/${safeName}`, "public");
        uploadedSupplementary.push({ url: res.url, filename: safeName, mimeType: item.file.type, size: item.file.size, description: item.description || undefined });
      }

      setPhase("saving");
      setUploadProgress("Saving thesis…");

      const dbData = {
        title: title.trim(),
        slug: finalSlug,
        abstract,
        program: programFields.program || null,
        faculty: programFields.faculty || null,
        subject: programFields.subject || null,
        cohort: programFields.cohort || null,
        academic_year: programFields.academicYear || null,
        author_names: finalAuthorNames || null,
        advisor_name: advisorName || null,
        co_advisor_name: coAdvisorName || null,
        cover_url: finalCoverUrl,
        cover_alt_text: coverAltText || null,
        file_url: finalPdfUrl,
        file_size_kb: fileSizeKb,
        ...(contentHash ? { content_hash: contentHash } : {}),
        supplementary_files: uploadedSupplementary,
        license: license || null,
        status: effectiveStatus,
        scheduled_at: effectiveStatus === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        keywords,
        doi: doi.trim() || null,
        published_at: publishedAt || null,
        defense_date: defenseDate || null,
        submitted_date: submittedDate || null,
        references: finalReferences || null,
        thesis_type: thesisType,
        language,
        seo_title: seoTitle.trim() || null,
        seo_description: seoDescription.trim() || null,
        og_image: ogImage.trim() || null,
      };

      if (draftTarget) discardThesisDraft(draftTarget).catch(() => {});

      if (isEdit && initial) {
        const result = await updateThesis(initial.id, dbData);
        if (!result.success) throw new Error(result.error);
        router.push(`/admin/theses/edit/${initial.id}`);
        router.refresh();
      } else {
        const result = await createThesis(dbData);
        if (!result.success) throw new Error(result.error);
        router.push(result.id ? `/admin/theses/edit/${result.id}` : "/admin/theses");
      }
    } catch (err) {
      setPhase("idle");
      setUploadProgress("");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h1 className="text-2xl font-bold text-text-heading">{isEdit ? "Edit Thesis" : "Upload Thesis"}</h1>

      {availableDraft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>You have unsaved changes from {new Date(availableDraft.updatedAt).toLocaleString()}.</span>
          <span className="flex gap-2">
            <button type="button" onClick={restoreDraft} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">Restore</button>
            <button type="button" onClick={discardDraft} className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">Discard</button>
          </span>
        </div>
      )}

      <ThesisStickyActions
        isEdit={isEdit}
        status={status}
        scheduledAtSet={!!scheduledAt}
        wasPublished={wasPublished}
        submitting={busy}
        onPreview={() => setPreviewOpen(true)}
        autosaveStatus={autosaveStatus}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {busy && (
        <div className="flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          <Loader2 className="h-4 w-4 animate-spin" /> {uploadProgress}
        </div>
      )}

      {/* No overflow-hidden here: several fields inside the panels (SearchableSelect)
          open an absolutely-positioned dropdown that must be able to extend past
          this card's edge — clipping it would make lower options unreachable. */}
      <div className="flex flex-col rounded-2xl border border-divider bg-bg-surface shadow-sm md:flex-row">
        <ThesisStepNav active={activeStep} completed={completedSteps} errorCounts={stepErrorCounts} onSelect={setActiveStep} />

        <div id={`thesis-panel-${activeStep}`} role="tabpanel" aria-labelledby={`thesis-step-${activeStep}`} className="min-w-0 flex-1 p-6 md:p-8">
          {activeStep === "basic" && (
            <BasicInfoStep
              title={title} onTitleChange={setTitle}
              slug={slug} onSlugChange={setSlug}
              thesisId={initial?.id}
              doi={doi} onDoiChange={setDoi}
              thesisType={thesisType} onThesisTypeChange={setThesisType}
              language={language} onLanguageChange={setLanguage}
              license={license} onLicenseChange={setLicense}
              siteUrl={SITE_URL}
              disabled={busy}
              fieldErrors={{ title: publishErrors.title, slug: publishErrors.slug }}
            />
          )}
          {activeStep === "classification" && (
            <ClassificationStep
              defaultValues={{
                program: programFields.program, faculty: programFields.faculty, subject: programFields.subject,
                cohort: programFields.cohort, academicYear: programFields.academicYear,
              }}
              onChange={setProgramFields}
            />
          )}
          {activeStep === "people" && (
            <PeopleStep
              authors={authors} onAuthorsChange={setAuthors}
              advisorName={advisorName} onAdvisorNameChange={setAdvisorName}
              coAdvisorName={coAdvisorName} onCoAdvisorNameChange={setCoAdvisorName}
              publishedAt={publishedAt} onPublishedAtChange={setPublishedAt}
              defenseDate={defenseDate} onDefenseDateChange={setDefenseDate}
              submittedDate={submittedDate} onSubmittedDateChange={setSubmittedDate}
              disabled={busy}
              authorsError={publishErrors.authorNames}
            />
          )}
          {activeStep === "abstract" && (
            <AbstractKeywordsStep abstract={abstract} onAbstractChange={setAbstract} keywords={keywords} onKeywordsChange={setKeywords} disabled={busy} />
          )}
          {activeStep === "references" && (
            <ReferencesStep references={references} onReferencesChange={setReferences} disabled={busy} />
          )}
          {activeStep === "files" && (
            <FilesStep
              pdfFile={pdfFile} onPdfChange={handlePdfChange} existingPdfLabel={initial?.fileUrl ? "Current PDF attached" : "PDF files only"}
              coverFile={coverFile} coverPreview={coverPreview} existingCoverUrl={initial?.coverUrl} coverRemoved={coverRemoved}
              onCoverChange={handleCoverChange} onCoverRemove={handleCoverRemove}
              coverAltText={coverAltText} onCoverAltTextChange={setCoverAltText}
              supplementaryExisting={supplementaryExisting} onRemoveExistingSupplementary={removeExistingSupplementary}
              supplementaryNew={supplementaryNew} onAddSupplementary={addSupplementary}
              onRemoveNewSupplementary={removeNewSupplementary} onSupplementaryDescriptionChange={updateSupplementaryDescription}
              disabled={busy}
              fileError={fileError ?? publishErrors.fileUrl}
            />
          )}
          {activeStep === "review" && (
            <ReviewPublishStep
              thesis={{
                title, slug, authorNames: authorNamesJoined || null, advisorName: advisorName || null,
                program: programFields.program, cohort: programFields.cohort, academicYear: programFields.academicYear,
                publishedAt: publishedAt || null, abstract: abstract || null, keywords, references: referencesJoined || null,
                coverUrl: effectiveCoverUrl, fileUrl: effectiveFileUrl, license: license || null, doi,
              }}
              siteUrl={SITE_URL}
              slug={slug}
              status={status} onStatusChange={setStatus}
              scheduledAt={scheduledAt} onScheduledAtChange={setScheduledAt}
              scheduledAtError={scheduledAtError}
              seoTitle={seoTitle} onSeoTitleChange={setSeoTitle}
              seoDescription={seoDescription} onSeoDescriptionChange={setSeoDescription}
              ogImage={ogImage} onOgImageChange={setOgImage}
              onPreview={() => setPreviewOpen(true)}
              disabled={busy}
            />
          )}
        </div>
      </div>

      {previewOpen && (
        <ThesisPreview
          title={title}
          authorNames={authorNamesJoined}
          advisorName={advisorName}
          program={programFields.program}
          cohort={programFields.cohort}
          academicYear={programFields.academicYear}
          abstract={abstract}
          keywords={keywords}
          references={references}
          coverUrl={coverPreview ?? (coverRemoved ? null : initial?.coverUrl ?? null)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </form>
  );
}
