"use client";

// Publication authoring workspace. Six steps frame the work — Basic info,
// Authors, Content (abstract + references + citations in one connected desk),
// Details, Files, Review & publish — with a truthful sticky save bar,
// debounced recovery autosave, optimistic-concurrency saves, and a
// server-validated publish gate.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  savePublicationWorkspace,
  savePublicationDraft,
  loadPublicationDraft,
  discardPublicationDraft,
  publishPublicationValidated,
} from "@/app/actions/publication-workspace";
import {
  togglePublicationPublishStatus,
  type PublicationData,
  type PublicationFileInput,
} from "@/app/actions/publications";
import type { Publication, PublicationFile, PublicationReference } from "@/lib/publications";
import {
  normalizePublicationReferences,
  upgradeLegacyCitationTokens,
  validatePublicationCitations,
} from "@/lib/publications/citations";
import {
  buildPublicationReview,
  type PublicationReviewResult,
  type ReviewStep,
} from "@/lib/publications/review";
import {
  FileText,
  AlignLeft,
  Paperclip,
  Users,
  AlertCircle,
  AlertTriangle,
  Check,
  History,
  ListChecks,
  Plus,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import PdfDropzone from "../../theses/_components/PdfDropzone";
import CoverDropzone from "../../theses/_components/CoverDropzone";
import { INPUT_CLASS, LABEL_CLASS } from "../../theses/_components/form-styles";
import TagInput from "@/components/ui/core/TagInput";
import { ConfirmDialog } from "@/components/admin/kit";
import { slugify, makeUid } from "@/lib/book-utils";
import AuthorshipEditor, { type AuthorshipRow } from "./AuthorshipEditor";
import ContentWorkspace from "./workspace/ContentWorkspace";
import SaveBar, { type AutosaveState } from "./workspace/SaveBar";
import ReviewPublishPanel from "./workspace/ReviewPublishPanel";

type StepKey = ReviewStep | "review";

const STEPS: { key: StepKey; label: string; icon: LucideIcon; optional?: boolean }[] = [
  { key: "basic", label: "Basic info", icon: FileText },
  { key: "authors", label: "Authors", icon: Users },
  { key: "content", label: "Content", icon: AlignLeft },
  { key: "details", label: "Details", icon: ListChecks, optional: true },
  { key: "files", label: "Files", icon: Paperclip },
  { key: "review", label: "Review & publish", icon: ShieldCheck },
];

type StepState = "error" | "warning" | "complete" | "empty";

const STEP_STATE_LABEL: Record<StepState, string> = {
  error: "has blocking problems",
  warning: "has warnings",
  complete: "complete",
  empty: "not started",
};

const AUTOSAVE_DEBOUNCE_MS = 3_000;
const REVIEW_DEBOUNCE_MS = 500;

/** Scalar (uncontrolled) form fields collected via FormData. */
const SCALAR_FIELDS = [
  "title_km", "article_type", "language", "journal_name", "volume", "issue_no",
  "page_start", "page_end", "article_no", "publication_date", "doi", "license",
  "copyright", "publisher", "isbn", "keywords", "subjects",
  "table_of_contents", "learning_outcomes", "faqs",
] as const;
type ScalarField = (typeof SCALAR_FIELDS)[number];
type Scalars = Record<ScalarField, string>;

/**
 * Parse the FAQ textarea: a line starting with "Q:" opens a new item; every
 * following line (optionally prefixed "A:") extends its answer.
 */
function parseFaqs(raw: string): { question: string; answer: string }[] {
  const faqs: { question: string; answer: string }[] = [];
  let current: { question: string; answer: string } | null = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^q\s*[:.]/i.test(trimmed)) {
      if (current?.question && current.answer) faqs.push(current);
      current = { question: trimmed.replace(/^q\s*[:.]\s*/i, ""), answer: "" };
    } else if (current) {
      const text = trimmed.replace(/^a\s*[:.]\s*/i, "");
      current.answer = current.answer ? `${current.answer} ${text}` : text;
    }
  }
  if (current?.question && current.answer) faqs.push(current);
  return faqs.slice(0, 20);
}

/** New supporting-information row queued for upload. */
type NewSiFile = { label: string; file: File };

async function uploadViaAdminApi(file: File, key: string): Promise<string> {
  const payload = new FormData();
  payload.set("file", file);
  payload.set("key", key);
  const res = await fetch("/api/admin/upload", { method: "POST", body: payload });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  const { url } = await res.json();
  return url as string;
}

function defaultsFromPublication(initial?: Publication): Scalars {
  return {
    title_km: initial?.title_km ?? "",
    article_type: initial?.article_type ?? "article",
    language: initial?.language ?? "en",
    journal_name: initial?.journal_name ?? "",
    volume: initial?.volume ?? "",
    issue_no: initial?.issue_no ?? "",
    page_start: initial?.page_start ?? "",
    page_end: initial?.page_end ?? "",
    article_no: initial?.article_no ?? "",
    publication_date: initial?.publication_date ?? "",
    doi: initial?.doi ?? "",
    license: initial?.license ?? "",
    copyright: initial?.copyright ?? "",
    publisher: initial?.publisher ?? "",
    isbn: initial?.isbn ?? "",
    keywords: (initial?.keywords ?? []).join(", "),
    subjects: (initial?.subjects ?? []).join(", "),
    table_of_contents: (initial?.table_of_contents ?? [])
      .map((e) => (e.page ? `${e.title} :: ${e.page}` : e.title))
      .join("\n"),
    learning_outcomes: (initial?.learning_outcomes ?? []).join("\n"),
    faqs: (initial?.faqs ?? []).map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n"),
  };
}

function splitList(value: string, max: number): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, max);
}

/** Stable per-tab key so a crashed "new publication" session can recover. */
function newPublicationDraftKey(): string {
  try {
    const existing = sessionStorage.getItem("ptec.pubdraft.new");
    if (existing) return existing;
    const key = `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("ptec.pubdraft.new", key);
    return key;
  } catch {
    return `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function PublicationForm({ initial }: { initial?: Publication }) {
  const formRef = useRef<HTMLFormElement>(null);

  const [publicationId, setPublicationId] = useState<string | null>(initial?.id ?? null);
  const initialCoverUrl = initial?.cover_url ?? null;
  const isEdit = publicationId !== null;
  const [revision, setRevision] = useState<number | null>(initial?.content_revision ?? null);
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? false);

  const [activeStep, setActiveStep] = useState<StepKey>("basic");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // ── Controlled content state ──
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial);
  const [authorRows, setAuthorRows] = useState<AuthorshipRow[]>(
    initial?.authorships?.map((a) => ({
      author: a.author,
      is_corresponding: a.is_corresponding,
      affiliation_ids: a.affiliation_ids,
    })) ?? [],
  );
  // Legacy positional tokens ([cite:2]) are upgraded to stable-ID tokens once
  // at mount, so reordering references below can never change their meaning.
  const [referenceRows, setReferenceRows] = useState<PublicationReference[]>(
    initial?.references ?? [],
  );
  const [abstract, setAbstract] = useState(() =>
    upgradeLegacyCitationTokens(initial?.abstract ?? "", initial?.references ?? []),
  );
  const [abstractKm, setAbstractKm] = useState(() =>
    upgradeLegacyCitationTokens(initial?.abstract_km ?? "", initial?.references ?? []),
  );

  // ── Uncontrolled scalar defaults (remounted via epoch on draft restore) ──
  const [defaults, setDefaults] = useState<Scalars>(() => defaultsFromPublication(initial));
  const [epoch, setEpoch] = useState(0);

  // ── Files ──
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [existingSiFiles, setExistingSiFiles] = useState<PublicationFile[]>(initial?.files ?? []);
  const [newSiFiles, setNewSiFiles] = useState<NewSiFile[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(initial?.pdf_url ?? null);

  // ── Workspace deep links ──
  const [contentFocus, setContentFocus] = useState<{ target: string; nonce: number } | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  // ── Autosave ──
  const [autosave, setAutosave] = useState<AutosaveState>("idle");
  const [draftBanner, setDraftBanner] = useState<{
    payload: Record<string, unknown>;
    updatedAt: string;
    stale: boolean;
  } | null>(null);
  const draftKeyRef = useRef<string | null>(null);
  const autosaveSeqRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  const draftTarget = useCallback(() => {
    if (publicationId) return { publicationId };
    if (!draftKeyRef.current) draftKeyRef.current = newPublicationDraftKey();
    return { draftKey: draftKeyRef.current };
  }, [publicationId]);

  // ── Data collection ────────────────────────────────────────────────────
  const collectScalars = useCallback((): Scalars => {
    const form = formRef.current;
    const result = {} as Scalars;
    const fd = form ? new FormData(form) : null;
    for (const key of SCALAR_FIELDS) {
      result[key] = ((fd?.get(key) as string | null) ?? defaults[key] ?? "").toString();
    }
    return result;
  }, [defaults]);

  const buildData = useCallback(
    (scalars: Scalars, uploaded: { pdfUrl: string | null; coverUrl: string | null }): PublicationData => ({
      slug: slugify(slug || title),
      title: title.trim(),
      title_km: scalars.title_km.trim() || null,
      article_type: scalars.article_type || "article",
      journal_name: scalars.journal_name.trim() || null,
      volume: scalars.volume.trim() || null,
      issue_no: scalars.issue_no.trim() || null,
      page_start: scalars.page_start.trim() || null,
      page_end: scalars.page_end.trim() || null,
      article_no: scalars.article_no.trim() || null,
      doi: scalars.doi.trim() || null,
      publication_date: scalars.publication_date || null,
      abstract: abstract.trim() || null,
      abstract_km: abstractKm.trim() || null,
      keywords: splitList(scalars.keywords, 20),
      publisher: scalars.publisher.trim() || null,
      isbn: scalars.isbn.trim() || null,
      subjects: splitList(scalars.subjects, 12),
      table_of_contents: scalars.table_of_contents
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 100)
        .map((line) => {
          const [titlePart, pagePart] = line.split("::").map((s) => s.trim());
          return { title: titlePart, page: pagePart || null };
        })
        .filter((e) => e.title),
      learning_outcomes: scalars.learning_outcomes
        .split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20),
      faqs: parseFaqs(scalars.faqs),
      license: scalars.license.trim() || null,
      copyright: scalars.copyright.trim() || null,
      language: scalars.language || "en",
      cover_url: uploaded.coverUrl,
      pdf_url: uploaded.pdfUrl,
      references: referenceRows.filter((r) => r.text.trim() || r.doi || r.url),
    }),
    [title, slug, abstract, abstractKm, referenceRows],
  );

  // ── Live review (drives step states, save-bar chips, review panel) ─────
  const computeReview = useCallback((): PublicationReviewResult => {
    const scalars = collectScalars();
    return buildPublicationReview({
      title,
      title_km: scalars.title_km,
      slug: slugify(slug || title),
      journal_name: scalars.journal_name,
      volume: scalars.volume,
      issue_no: scalars.issue_no,
      page_start: scalars.page_start,
      page_end: scalars.page_end,
      article_no: scalars.article_no,
      doi: scalars.doi,
      publication_date: scalars.publication_date,
      abstract,
      abstract_km: abstractKm,
      keywords: splitList(scalars.keywords, 20),
      subjects: splitList(scalars.subjects, 12),
      license: scalars.license,
      cover_url: coverRemoved ? null : coverPreview ?? initialCoverUrl,
      hasPdf: !!pdfFile || !!pdfUrl,
      authorshipCount: authorRows.length,
      references: referenceRows.filter((r) => r.text.trim() || r.doi || r.url),
    });
  }, [
    collectScalars, title, slug, abstract, abstractKm, coverRemoved, coverPreview,
    initialCoverUrl, pdfFile, pdfUrl, authorRows, referenceRows,
  ]);

  const [review, setReview] = useState<PublicationReviewResult>(() =>
    buildPublicationReview({
      title: initial?.title ?? "",
      slug: initial?.slug ?? "",
      title_km: initial?.title_km,
      journal_name: initial?.journal_name,
      volume: initial?.volume,
      issue_no: initial?.issue_no,
      page_start: initial?.page_start,
      page_end: initial?.page_end,
      article_no: initial?.article_no,
      doi: initial?.doi,
      publication_date: initial?.publication_date,
      abstract: initial?.abstract,
      abstract_km: initial?.abstract_km,
      keywords: initial?.keywords ?? [],
      subjects: initial?.subjects ?? [],
      license: initial?.license,
      cover_url: initial?.cover_url,
      hasPdf: !!initial?.pdf_url,
      authorshipCount: initial?.authorships?.length ?? 0,
      references: initial?.references ?? [],
    }),
  );
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReview = useCallback(() => {
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    reviewTimerRef.current = setTimeout(() => setReview(computeReview()), REVIEW_DEBOUNCE_MS);
  }, [computeReview]);

  // ── Dirty tracking + autosave scheduling ──────────────────────────────
  const performAutosave = useCallback(async () => {
    if (savingRef.current || !dirtyRef.current) return;
    setAutosave("saving");
    const scalars = collectScalars();
    const payload = {
      scalars,
      title,
      slug,
      abstract,
      abstractKm,
      references: referenceRows,
      authorRows,
      existingSiFiles,
      pendingUploads: {
        pdf: !!pdfFile,
        cover: !!coverFile,
        supporting: newSiFiles.length,
      },
    };
    const result = await savePublicationDraft(
      draftTarget(),
      payload as unknown as Record<string, unknown>,
      revision ?? 0,
      ++autosaveSeqRef.current,
    );
    if (result.status === "saved") setAutosave("saved");
    else if (result.status === "stale") setAutosave("stale");
    else if (result.status === "unavailable") setAutosave("unavailable");
    else setAutosave("error");
  }, [
    collectScalars, title, slug, abstract, abstractKm, referenceRows, authorRows,
    existingSiFiles, pdfFile, coverFile, newSiFiles.length, draftTarget, revision,
  ]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
    scheduleReview();
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setAutosave((state) => (state === "unavailable" ? state : "pending"));
    autosaveTimerRef.current = setTimeout(() => {
      void performAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [scheduleReview, performAutosave]);

  // Controlled-state edits flow through these wrappers so every change marks
  // the form dirty exactly once, without rerendering on scalar keystrokes.
  const dirtyWrap = useCallback(
    <T,>(setter: (value: T) => void) =>
      (value: T) => {
        setter(value);
        markDirty();
      },
    [markDirty],
  );
  const changeAbstract = useMemo(() => dirtyWrap(setAbstract), [dirtyWrap]);
  const changeAbstractKm = useMemo(() => dirtyWrap(setAbstractKm), [dirtyWrap]);
  const changeReferences = useMemo(() => dirtyWrap(setReferenceRows), [dirtyWrap]);
  const changeAuthors = useMemo(() => dirtyWrap(setAuthorRows), [dirtyWrap]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);
  useEffect(
    () => () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    },
    [],
  );

  // Unsaved changes must survive an accidental tab close or refresh prompt.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // ── Draft recovery on mount ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await loadPublicationDraft(draftTarget());
      if (cancelled) return;
      if (result.status === "unavailable") {
        setAutosave("unavailable");
      } else if (result.status === "found") {
        setDraftBanner({
          payload: result.payload,
          updatedAt: result.updatedAt,
          stale: revision !== null && result.baseRevision < revision,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: the draft target is fixed for the life of this form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = useCallback(() => {
    const payload = draftBanner?.payload;
    if (!payload) return;
    const scalars = payload.scalars as Partial<Scalars> | undefined;
    if (scalars) {
      setDefaults((prev) => ({ ...prev, ...scalars }));
      setEpoch((e) => e + 1);
    }
    if (typeof payload.title === "string") setTitle(payload.title);
    if (typeof payload.slug === "string") {
      setSlug(payload.slug);
      setSlugTouched(true);
    }
    if (typeof payload.abstract === "string") setAbstract(payload.abstract);
    if (typeof payload.abstractKm === "string") setAbstractKm(payload.abstractKm);
    if (Array.isArray(payload.references)) {
      setReferenceRows(normalizePublicationReferences(payload.references));
    }
    if (Array.isArray(payload.authorRows)) {
      setAuthorRows(
        (payload.authorRows as AuthorshipRow[]).filter((row) => row?.author?.id),
      );
    }
    if (Array.isArray(payload.existingSiFiles)) {
      setExistingSiFiles(payload.existingSiFiles as PublicationFile[]);
    }
    setDraftBanner(null);
    markDirty();
  }, [draftBanner, markDirty]);

  const discardDraft = useCallback(() => {
    setDraftBanner(null);
    void discardPublicationDraft(draftTarget());
  }, [draftTarget]);

  // ── Save ───────────────────────────────────────────────────────────────
  const failTo = useCallback((message: string, step: StepKey) => {
    setError(message);
    setActiveStep(step);
  }, []);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    setError("");

    if (!title.trim()) return failTo("Please enter the article title.", "basic");
    const finalSlug = slugify(slug || title);
    if (!finalSlug) return failTo("Please provide a valid slug.", "basic");

    const cleanRows = referenceRows.filter((r) => r.text.trim() || r.doi || r.url);
    const citationCheck = validatePublicationCitations(cleanRows, [
      { id: "abstract-en", text: abstract },
      { id: "abstract-km", text: abstractKm },
    ]);
    if (citationCheck.errors.length > 0) {
      return failTo(
        citationCheck.errors.slice(0, 3).map((issue) => issue.message).join(" "),
        "content",
      );
    }

    setSaving(true);
    savingRef.current = true;
    try {
      const uid = makeUid();
      const folder = `publications/${finalSlug}-${uid}`;

      let nextPdfUrl = pdfUrl;
      if (pdfFile) {
        nextPdfUrl = await uploadViaAdminApi(pdfFile, `${folder}/article.pdf`);
      }

      let coverUrl = coverRemoved ? null : initialCoverUrl;
      if (coverFile) {
        const ext = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
        coverUrl = await uploadViaAdminApi(coverFile, `${folder}/cover.${ext}`);
      }

      const uploadedSi: PublicationFileInput[] = [];
      for (let i = 0; i < newSiFiles.length; i++) {
        const si = newSiFiles[i];
        const seq = String(existingSiFiles.length + i + 1).padStart(2, "0");
        const ext = si.file.name.split(".").pop()?.toLowerCase() || "pdf";
        const url = await uploadViaAdminApi(si.file, `${folder}/si-${seq}.${ext}`);
        uploadedSi.push({
          label: si.label || si.file.name,
          file_url: url,
          file_type: ext,
          size_bytes: si.file.size,
        });
      }

      const scalars = collectScalars();
      const data = buildData(scalars, { pdfUrl: nextPdfUrl, coverUrl });
      const authorships = authorRows.map((row, i) => ({
        author_id: row.author.id,
        author_order: i + 1,
        is_corresponding: row.is_corresponding,
        affiliation_ids: row.affiliation_ids,
      }));
      const files: PublicationFileInput[] = [
        ...existingSiFiles.map((f, i) => ({
          label: f.label,
          file_url: f.file_url,
          file_type: f.file_type,
          size_bytes: f.size_bytes,
          sort_order: i,
        })),
        ...uploadedSi.map((f, i) => ({ ...f, sort_order: existingSiFiles.length + i })),
      ];

      const result = await savePublicationWorkspace({
        publicationId,
        expectedRevision: revision,
        data,
        authorships,
        files,
      });

      if (!result.success) {
        if (result.conflict) {
          setError(result.error);
          return;
        }
        throw new Error(result.error);
      }

      // Confirmed by the server — only now report success.
      const wasNew = !publicationId;
      setPublicationId(result.id);
      setRevision(result.revision);
      setPdfUrl(nextPdfUrl);
      if (uploadedSi.length > 0) {
        // Uploaded rows are persisted; fold them into "existing" so a second
        // save cannot duplicate them.
        setExistingSiFiles((prev) => [
          ...prev,
          ...uploadedSi.map((f, i) => ({
            id: `saved-${uid}-${i}`,
            label: f.label,
            file_url: f.file_url,
            file_type: f.file_type ?? null,
            size_bytes: f.size_bytes ?? null,
            sort_order: prev.length + i,
          })),
        ]);
        setNewSiFiles([]);
      }
      setPdfFile(null);
      dirtyRef.current = false;
      setDirty(false);
      setLastSavedAt(new Date());
      setAutosave((state) => (state === "unavailable" ? state : "idle"));
      setReview(computeReview());
      void discardPublicationDraft(
        wasNew && draftKeyRef.current ? { draftKey: draftKeyRef.current } : { publicationId: result.id },
      );
      if (wasNew) {
        try {
          sessionStorage.removeItem("ptec.pubdraft.new");
        } catch { /* ignore */ }
        // Keep the workspace open on the canonical edit URL.
        window.history.replaceState(null, "", `/admin/publications/edit/${result.id}`);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save publication. Please try again.");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }, [
    title, slug, referenceRows, abstract, abstractKm, pdfUrl, pdfFile, coverRemoved,
    initialCoverUrl, coverFile, newSiFiles, existingSiFiles, collectScalars, buildData,
    authorRows, publicationId, revision, computeReview, failTo,
  ]);

  // ── Publish / unpublish ────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!publicationId || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await publishPublicationValidated(publicationId);
      if (result.success) {
        setIsPublished(true);
      } else {
        setPublishError(result.error);
        if (result.review) setReview(result.review);
      }
    } finally {
      setPublishing(false);
    }
  }, [publicationId, publishing]);

  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const performUnpublish = useCallback(async () => {
    if (!publicationId || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await togglePublicationPublishStatus(publicationId, false);
      if (result.success) setIsPublished(false);
      else setPublishError(result.error);
    } finally {
      setPublishing(false);
    }
  }, [publicationId, publishing]);

  const handleUnpublish = useCallback(() => {
    if (!publicationId || publishing) return;
    setConfirmUnpublish(true);
  }, [publicationId, publishing]);

  // ── Cmd/Ctrl+S saves from anywhere in the form ─────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  // ── Step rail ──────────────────────────────────────────────────────────
  const stepStates = useMemo<Record<StepKey, StepState>>(() => {
    const scalarsStarted =
      defaults.publisher || defaults.isbn || defaults.subjects ||
      defaults.table_of_contents || defaults.learning_outcomes || defaults.faqs;
    const byStep = (step: ReviewStep, started: boolean): StepState => {
      if (review.errors.some((item) => item.step === step)) return "error";
      if (review.warnings.some((item) => item.step === step)) return "warning";
      return started ? "complete" : "empty";
    };
    return {
      basic: byStep("basic", !!title.trim()),
      authors: byStep("authors", authorRows.length > 0),
      content: byStep("content", !!abstract.trim() || referenceRows.length > 0),
      details: byStep("details", !!scalarsStarted),
      files: byStep("files", !!pdfFile || !!pdfUrl),
      review: review.publishable && !dirty && isEdit ? "complete" : "empty",
    };
  }, [review, title, authorRows.length, abstract, referenceRows.length, defaults, pdfFile, pdfUrl, dirty, isEdit]);

  function handleStepKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = STEPS[(index + dir + STEPS.length) % STEPS.length];
    setActiveStep(next.key);
    document.getElementById(`step-${next.key}`)?.focus();
  }

  const goToReview = useCallback(() => {
    setReview(computeReview());
    setActiveStep("review");
  }, [computeReview]);

  const navigateToItem = useCallback((step: ReviewStep, field?: string) => {
    setActiveStep(step);
    if (step === "content" && field) {
      setContentFocus((prev) => ({ target: field, nonce: (prev?.nonce ?? 0) + 1 }));
      return;
    }
    if (field) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`pf-field-${field}`);
        el?.scrollIntoView({ block: "center", behavior: "auto" });
        (el as HTMLElement | null)?.focus?.();
      });
    }
  }, []);

  const openPreview = useCallback(() => {
    setActiveStep("content");
    setPreviewNonce((n) => n + 1);
  }, []);

  const publicHref = isPublished && initial?.slug ? `/publications/${slug || initial.slug}` : null;

  const stepIndicator = (state: StepState, optional?: boolean) => {
    if (state === "complete") {
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/15" aria-hidden="true">
          <Check className="h-3 w-3 text-success" />
        </span>
      );
    }
    if (state === "error") {
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger/15" aria-hidden="true">
          <AlertCircle className="h-3 w-3 text-danger" />
        </span>
      );
    }
    if (state === "warning") {
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning/15" aria-hidden="true">
          <AlertTriangle className="h-3 w-3 text-warning" />
        </span>
      );
    }
    return (
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${optional ? "bg-divider" : "bg-divider"} mx-[5px]`}
      />
    );
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      onChange={markDirty}
      className="rounded-2xl border border-divider bg-bg-surface shadow-sm flex flex-col"
    >
      {error && (
        <div
          role="alert"
          className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger sm:mx-6"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {draftBanner && (
        <div
          role="status"
          className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-text-body sm:mx-6"
        >
          <History className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            A recovery draft from{" "}
            {new Date(draftBanner.updatedAt).toLocaleString([], {
              hour: "2-digit",
              minute: "2-digit",
              day: "numeric",
              month: "short",
            })}{" "}
            was found{draftBanner.stale ? " (older than the last saved version)" : ""}. Restore it?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restoreDraft}
              className="min-h-9 cursor-pointer rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              Restore draft
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="min-h-9 cursor-pointer rounded-lg border border-divider px-3 text-[12.5px] font-medium text-text-muted transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1">
        {/* ══ STEP RAIL ═══════════════════════════════════════════════════ */}
        <div
          role="tablist"
          aria-label="Publication workspace steps"
          aria-orientation="vertical"
          className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible border-b md:border-b-0 md:border-r border-divider p-3 md:w-56 md:shrink-0 bg-paper/30"
        >
          {STEPS.map((step, i) => {
            const isActive = activeStep === step.key;
            const state = stepStates[step.key];
            return (
              <button
                key={step.key}
                type="button"
                id={`step-${step.key}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${step.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => (step.key === "review" ? goToReview() : setActiveStep(step.key))}
                onKeyDown={(e) => handleStepKeyDown(e, i)}
                className={`relative flex shrink-0 items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-all cursor-pointer text-left ${
                  isActive
                    ? "bg-brand/10 text-brand shadow-sm"
                    : "text-text-muted hover:bg-paper hover:text-text-heading"
                }`}
              >
                <step.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand" : "text-text-muted"}`} />
                <span className="flex-1 whitespace-nowrap">
                  {step.label}
                  {step.optional ? (
                    <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-text-muted">
                      Optional
                    </span>
                  ) : null}
                </span>
                {stepIndicator(state, step.optional)}
                <span className="sr-only">— {STEP_STATE_LABEL[state]}</span>
              </button>
            );
          })}
        </div>

        {/* ══ PANELS — all stay mounted so field values survive step switches ═══ */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 sm:p-6 flex-1">
            <div id="panel-basic" role="tabpanel" aria-labelledby="step-basic" hidden={activeStep !== "basic"} className="space-y-8">
              <div className="space-y-4" key={`basic-${epoch}`}>
                <div>
                  <label htmlFor="pf-field-title" className={LABEL_CLASS}>Title (EN)</label>
                  <input
                    id="pf-field-title"
                    name="title"
                    required
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (!slugTouched) setSlug(slugify(e.target.value));
                    }}
                    className={INPUT_CLASS}
                    placeholder="e.g. Digital pedagogy adoption in Cambodian teacher education"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pf-field-title_km" className={LABEL_CLASS}>Title (KH, optional)</label>
                    <input
                      id="pf-field-title_km"
                      name="title_km"
                      lang="km"
                      defaultValue={defaults.title_km}
                      className={INPUT_CLASS}
                      placeholder="ចំណងជើងជាភាសាខ្មែរ"
                    />
                  </div>
                  <div>
                    <label htmlFor="pf-field-slug" className={LABEL_CLASS}>Slug (URL)</label>
                    <input
                      id="pf-field-slug"
                      name="slug"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value);
                      }}
                      className={`${INPUT_CLASS} font-mono text-xs`}
                      placeholder="auto-generated-from-title"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pf-field-article_type" className={LABEL_CLASS}>Article type</label>
                    <select id="pf-field-article_type" name="article_type" defaultValue={defaults.article_type} className={INPUT_CLASS}>
                      <option value="article">Article</option>
                      <option value="review">Review</option>
                      <option value="account">Account</option>
                      <option value="editorial">Editorial</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pf-field-language" className={LABEL_CLASS}>Language</label>
                    <select id="pf-field-language" name="language" defaultValue={defaults.language} className={INPUT_CLASS}>
                      <option value="en">English</option>
                      <option value="km">Khmer</option>
                    </select>
                  </div>
                </div>
              </div>

              <hr className="border-divider" />

              <div key={`journal-${epoch}`}>
                <h3 className="text-lg font-semibold text-text-heading mb-4">Journal & Issue</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label htmlFor="pf-field-journal_name" className={LABEL_CLASS}>Journal name (optional)</label>
                    <input
                      id="pf-field-journal_name"
                      name="journal_name"
                      defaultValue={defaults.journal_name}
                      className={INPUT_CLASS}
                      placeholder="e.g. PTEC Journal of Education"
                    />
                  </div>
                  <div>
                    <label htmlFor="pf-field-volume" className={LABEL_CLASS}>Volume</label>
                    <input id="pf-field-volume" name="volume" defaultValue={defaults.volume} className={INPUT_CLASS} placeholder="12" />
                  </div>
                  <div>
                    <label htmlFor="pf-field-issue_no" className={LABEL_CLASS}>Issue</label>
                    <input id="pf-field-issue_no" name="issue_no" defaultValue={defaults.issue_no} className={INPUT_CLASS} placeholder="3" />
                  </div>
                  <div>
                    <label htmlFor="pf-field-page_start" className={LABEL_CLASS}>First page</label>
                    <input id="pf-field-page_start" name="page_start" defaultValue={defaults.page_start} className={INPUT_CLASS} placeholder="101" />
                  </div>
                  <div>
                    <label htmlFor="pf-field-page_end" className={LABEL_CLASS}>Last page</label>
                    <input id="pf-field-page_end" name="page_end" defaultValue={defaults.page_end} className={INPUT_CLASS} placeholder="118" />
                  </div>
                  <div>
                    <label htmlFor="pf-field-article_no" className={LABEL_CLASS}>Article number (optional)</label>
                    <input id="pf-field-article_no" name="article_no" defaultValue={defaults.article_no} className={INPUT_CLASS} placeholder="e0123" />
                  </div>
                  <div>
                    <label htmlFor="pf-field-publication_date" className={LABEL_CLASS}>Publication date</label>
                    <input id="pf-field-publication_date" type="date" name="publication_date" defaultValue={defaults.publication_date} className={INPUT_CLASS} />
                  </div>
                </div>
              </div>

              <hr className="border-divider" />

              <div key={`rights-${epoch}`}>
                <h3 className="text-lg font-semibold text-text-heading mb-4">Identifiers & Rights</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pf-field-doi" className={LABEL_CLASS}>DOI (optional)</label>
                    <input
                      id="pf-field-doi"
                      name="doi"
                      defaultValue={defaults.doi}
                      className={`${INPUT_CLASS} font-mono text-xs`}
                      placeholder="10.1234/abcd.2026.001"
                    />
                  </div>
                  <div>
                    <label htmlFor="pf-field-license" className={LABEL_CLASS}>License (optional)</label>
                    <input
                      id="pf-field-license"
                      name="license"
                      defaultValue={defaults.license}
                      className={INPUT_CLASS}
                      placeholder="CC BY 4.0"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="pf-field-copyright" className={LABEL_CLASS}>Copyright (optional)</label>
                    <input
                      id="pf-field-copyright"
                      name="copyright"
                      defaultValue={defaults.copyright}
                      className={INPUT_CLASS}
                      placeholder="© 2026 The Authors"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div id="panel-authors" role="tabpanel" aria-labelledby="step-authors" hidden={activeStep !== "authors"}>
              <AuthorshipEditor value={authorRows} onChange={changeAuthors} disabled={saving} />
            </div>

            <div id="panel-content" role="tabpanel" aria-labelledby="step-content" hidden={activeStep !== "content"} className="space-y-6">
              <ContentWorkspace
                abstract={abstract}
                abstractKm={abstractKm}
                onChangeAbstract={changeAbstract}
                onChangeAbstractKm={changeAbstractKm}
                references={referenceRows}
                onChangeReferences={changeReferences}
                disabled={saving}
                idPrefix="pubws"
                publicHref={publicHref}
                externalFocus={contentFocus}
                previewNonce={previewNonce}
              />

              <div id="pf-field-keywords" tabIndex={-1} key={`keywords-${epoch}`} className="max-w-2xl scroll-mt-24">
                <label className={LABEL_CLASS}>Keywords / Tags (ពាក្យគន្លឹះ)</label>
                <TagInput
                  name="keywords"
                  defaultTags={splitList(defaults.keywords, 20)}
                  placeholder="e.g. pedagogy, STEM, teacher education…"
                  disabled={saving}
                />
                <p className="mt-1 text-[11px] text-text-muted">ចុច Enter ឬ , ដើម្បីបន្ថែម tag</p>
              </div>
            </div>

            <div id="panel-details" role="tabpanel" aria-labelledby="step-details" hidden={activeStep !== "details"} className="space-y-6" key={`details-${epoch}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pf-field-publisher" className={LABEL_CLASS}>Publisher (optional)</label>
                  <input
                    id="pf-field-publisher"
                    name="publisher"
                    defaultValue={defaults.publisher}
                    className={INPUT_CLASS}
                    placeholder="Publisher of record (leave blank if none)"
                  />
                </div>
                <div>
                  <label htmlFor="pf-field-isbn" className={LABEL_CLASS}>ISBN (optional)</label>
                  <input
                    id="pf-field-isbn"
                    name="isbn"
                    defaultValue={defaults.isbn}
                    className={`${INPUT_CLASS} font-mono text-xs`}
                    placeholder="978-9924-XX-XXX-X"
                  />
                </div>
              </div>

              <div id="pf-field-subjects" tabIndex={-1} className="scroll-mt-24">
                <label className={LABEL_CLASS}>Subjects (optional)</label>
                <TagInput
                  name="subjects"
                  defaultTags={splitList(defaults.subjects, 12)}
                  placeholder="e.g. Education, Pedagogy, STEM…"
                  disabled={saving}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Broad subject areas shown as chips in the article Overview (max 12).
                </p>
              </div>

              <div>
                <label htmlFor="pf-field-table_of_contents" className={LABEL_CLASS}>
                  Table of contents — one entry per line (optional)
                </label>
                <textarea
                  id="pf-field-table_of_contents"
                  name="table_of_contents"
                  rows={8}
                  defaultValue={defaults.table_of_contents}
                  className={`${INPUT_CLASS} h-auto py-3 font-mono text-xs leading-relaxed`}
                  placeholder={"Introduction :: 1\nLiterature review :: 4\nMethodology :: 9"}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Format: <code>Section title :: page</code> — the page number is optional.
                </p>
              </div>

              <div>
                <label htmlFor="pf-field-learning_outcomes" className={LABEL_CLASS}>
                  Learning outcomes — one per line (optional)
                </label>
                <textarea
                  id="pf-field-learning_outcomes"
                  name="learning_outcomes"
                  rows={5}
                  defaultValue={defaults.learning_outcomes}
                  className={`${INPUT_CLASS} h-auto py-3 leading-relaxed`}
                  placeholder={"Explain the drivers of digital pedagogy adoption\nApply the framework to lesson planning"}
                />
              </div>

              <div>
                <label htmlFor="pf-field-faqs" className={LABEL_CLASS}>FAQ (optional)</label>
                <textarea
                  id="pf-field-faqs"
                  name="faqs"
                  rows={8}
                  defaultValue={defaults.faqs}
                  className={`${INPUT_CLASS} h-auto py-3 leading-relaxed`}
                  placeholder={"Q: Who is this article for?\nA: Teacher educators and student teachers.\n\nQ: Can I reuse the figures?\nA: Yes, under the CC BY 4.0 license with attribution."}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Start each question with <code>Q:</code> and each answer with <code>A:</code>. Shown as an accordion and emitted as FAQ structured data for search engines.
                </p>
              </div>
            </div>

            <div id="panel-files" role="tabpanel" aria-labelledby="step-files" hidden={activeStep !== "files"} className="space-y-6">
              <div id="pf-field-pdf" tabIndex={-1} className="scroll-mt-24">
                <label className={LABEL_CLASS}>Article PDF</label>
                <PdfDropzone
                  file={pdfFile}
                  onChange={(file) => {
                    setPdfFile(file);
                    markDirty();
                  }}
                  existingLabel={isEdit && pdfUrl ? "A PDF is already attached — upload to replace it" : null}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  You can save a draft without the PDF; publishing requires it.
                </p>
              </div>

              <div id="pf-field-cover" tabIndex={-1} className="scroll-mt-24">
                <label className={LABEL_CLASS}>Graphical abstract / cover image (optional)</label>
                <CoverDropzone
                  file={coverFile}
                  previewUrl={coverPreview}
                  existingUrl={initial?.cover_url}
                  removed={coverRemoved}
                  onChange={(file) => {
                    setCoverRemoved(false);
                    if (file) {
                      setCoverFile(file);
                      setCoverPreview(URL.createObjectURL(file));
                    } else {
                      setCoverFile(null);
                      setCoverPreview(null);
                    }
                    markDirty();
                  }}
                  onRemove={() => {
                    setCoverFile(null);
                    setCoverPreview(null);
                    setCoverRemoved(true);
                    markDirty();
                  }}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Supporting information (PDF, optional)</label>

                {existingSiFiles.length + newSiFiles.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {existingSiFiles.map((f, i) => (
                      <li key={f.id} className="flex items-center gap-3 rounded-lg border border-divider bg-paper/40 px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-text-muted" />
                        <input
                          value={f.label}
                          onChange={(e) => {
                            setExistingSiFiles((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)),
                            );
                            markDirty();
                          }}
                          className="flex-1 bg-transparent text-sm text-text-body outline-none"
                          aria-label="Supporting file label"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setExistingSiFiles((prev) => prev.filter((_, xi) => xi !== i));
                            markDirty();
                          }}
                          className="rounded p-1.5 text-text-muted hover:text-danger transition cursor-pointer"
                          aria-label={`Remove ${f.label}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                    {newSiFiles.map((f, i) => (
                      <li key={`new-${i}`} className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-success" />
                        <input
                          value={f.label}
                          onChange={(e) => {
                            setNewSiFiles((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)),
                            );
                            markDirty();
                          }}
                          className="flex-1 bg-transparent text-sm text-text-body outline-none"
                          aria-label="Supporting file label"
                        />
                        <span className="text-[10px] text-text-muted">{f.file.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewSiFiles((prev) => prev.filter((_, xi) => xi !== i));
                            markDirty();
                          }}
                          className="rounded p-1.5 text-text-muted hover:text-danger transition cursor-pointer"
                          aria-label={`Remove ${f.label}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-xs font-medium text-text-body hover:bg-paper transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                  Add supporting file
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file) {
                        setNewSiFiles((prev) => [
                          ...prev,
                          { label: file.name.replace(/\.[^.]+$/, ""), file },
                        ]);
                        markDirty();
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            <div id="panel-review" role="tabpanel" aria-labelledby="step-review" hidden={activeStep !== "review"}>
              <ReviewPublishPanel
                review={review}
                dirty={dirty}
                saving={saving}
                publishing={publishing}
                isEdit={isEdit}
                isPublished={isPublished}
                publicHref={publicHref}
                publishError={publishError}
                onNavigate={navigateToItem}
                onPublish={() => void handlePublish()}
                onUnpublish={() => void handleUnpublish()}
              />
            </div>
          </div>

          <SaveBar
            dirty={dirty}
            saving={saving}
            lastSavedAt={lastSavedAt}
            autosave={autosave}
            errorCount={review.errors.length}
            warningCount={review.warnings.length}
            isEdit={isEdit}
            onPreview={openPreview}
            onReview={goToReview}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmUnpublish}
        title="Unpublish this article?"
        description="It disappears from the public library immediately. You can publish it again later."
        confirmLabel="Unpublish"
        busyLabel="Unpublishing…"
        busy={publishing}
        onCancel={() => setConfirmUnpublish(false)}
        onConfirm={() => {
          setConfirmUnpublish(false);
          void performUnpublish();
        }}
      />
    </form>
  );
}
