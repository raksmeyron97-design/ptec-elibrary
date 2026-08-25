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
  checkPublicationSlugAvailable,
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
  History,
  ListChecks,
  Plus,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import PdfDropzone from "../../theses/_components/PdfDropzone";
import CoverDropzone from "../../theses/_components/CoverDropzone";
import { LABEL_CLASS } from "../../theses/_components/form-styles";
import {
  Field,
  FormShell,
  FormTabs,
  MONO_INPUT_CLASS,
  SlugField,
  TEXTAREA_CLASS,
  focusFirstInvalidAfterPaint,
  type FormTab,
  type FormTabState,
} from "@/components/admin/kit/form";
import TagInput from "@/components/ui/core/TagInput";
import { ConfirmDialog } from "@/components/admin/kit";
import { slugify, makeUid } from "@/lib/book-utils";
import { SITE_URL } from "@/lib/seo/site";
import AuthorshipEditor, { type AuthorshipRow } from "./AuthorshipEditor";
import PublicationContext from "./workspace/PublicationContext";
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

/*
  This form's vocabulary predates the shared kit. `empty` is the kit's
  `optional` here rather than `todo`: the publication review engine already
  reports every genuinely-required omission as an `error`, so an untouched step
  has nothing outstanding to claim.
*/
const TAB_STATE: Record<StepState, FormTabState> = {
  error: "error",
  warning: "warning",
  complete: "complete",
  empty: "optional",
};

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

export default function PublicationForm({
  initial,
  pageTitle,
  pageDescription,
  headerActions,
}: {
  initial?: Publication;
  /*
    The form owns FormShell rather than the route, because the context sidebar
    is a live view of this component's own state — a page-level slot could not
    see it without lifting every field into the route.
  */
  pageTitle: string;
  pageDescription: string;
  headerActions?: React.ReactNode;
}) {
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
  /**
   * Publish-readiness problems are only shown against the fields themselves
   * once the author has asked to publish (or opened Review). A draft is
   * legitimately incomplete — painting a brand-new form red on first render
   * would report a dozen "errors" the author has not had a chance to make yet.
   * Saving a draft never turns this on; only Review and Publish do.
   */
  const [showFieldIssues, setShowFieldIssues] = useState(false);

  /** review.field is the `pf-field-<id>` suffix, so it maps straight onto a field. */
  const fieldIssues = useMemo(() => {
    if (!showFieldIssues) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const item of review.errors) {
      if (item.field && !map[item.field]) map[item.field] = item.message;
    }
    return map;
  }, [showFieldIssues, review.errors]);

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
    if (scalars) setDefaults((prev) => ({ ...prev, ...scalars }));
    // Remount unconditionally, not only when there are scalars: a restored slug
    // is a hand-picked one, and the remount is what tells SlugField to stop
    // tracking the title instead of overwriting what we just restored.
    setEpoch((e) => e + 1);
    if (typeof payload.title === "string") setTitle(payload.title);
    if (typeof payload.slug === "string") setSlug(payload.slug);
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
        // The server refused. Show the problems against the fields that own
        // them and take the author to the first one, rather than leaving a
        // banner on the Review step and a form they have to re-audit by eye.
        setShowFieldIssues(true);
        const firstFieldItem = (result.review ?? review).errors.find((item) => item.field);
        if (firstFieldItem) {
          setActiveStep(firstFieldItem.step);
          focusFirstInvalidAfterPaint(() => formRef.current);
        }
      }
    } finally {
      setPublishing(false);
    }
  }, [publicationId, publishing, review]);

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

  const goToReview = useCallback(() => {
    setReview(computeReview());
    setShowFieldIssues(true);
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


  return (
    <FormShell
      backHref="/admin/publications"
      backLabel="Back to publications"
      title={pageTitle}
      description={pageDescription}
      headerActions={headerActions}
      contentKey={activeStep}
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      tabs={
        <FormTabs
          idPrefix="pub"
          ariaLabel="Publication workspace steps"
          active={activeStep}
          onChange={(key) => (key === "review" ? goToReview() : setActiveStep(key))}
          tabs={STEPS.map<FormTab<StepKey>>((step) => ({
            key: step.key,
            label: step.label,
            icon: step.icon,
            state: TAB_STATE[stepStates[step.key]],
            stateLabel: STEP_STATE_LABEL[stepStates[step.key]],
          }))}
        />
      }
      context={
        <PublicationContext
          step={activeStep}
          siteUrl={SITE_URL}
          title={title}
          slug={slug}
          abstract={abstract}
          journalName={collectScalars().journal_name}
          keywords={collectScalars().keywords}
          subjects={collectScalars().subjects}
          authorCount={authorRows.length}
          referenceCount={referenceRows.length}
          hasPdf={!!pdfFile || !!pdfUrl}
          hasCover={!!coverPreview && !coverRemoved}
          review={review}
        />
      }
      actions={
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
      }
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

      {/* Panels stay mounted so field values survive a step switch. */}
            <div id="pub-panel-basic" role="tabpanel" aria-labelledby="pub-tab-basic" tabIndex={-1} hidden={activeStep !== "basic"} className="space-y-8">
              <div className="space-y-4" key={`basic-${epoch}`}>
                <Field
                  label="Title (EN)"
                  required
                  htmlFor="pf-field-title"
                  error={fieldIssues.title}
                >
                  {(p) => (
                    <input
                      {...p}
                      name="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Digital pedagogy adoption in Cambodian teacher education"
                    />
                  )}
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="Title (KH)"
                    htmlFor="pf-field-title_km"
                    error={fieldIssues.title_km}
                    hint="Leave blank if the article has no Khmer title."
                  >
                    {(p) => (
                      <input
                        {...p}
                        name="title_km"
                        lang="km"
                        defaultValue={defaults.title_km}
                        placeholder="ចំណងជើងជាភាសាខ្មែរ"
                      />
                    )}
                  </Field>
                  <SlugField
                    value={slug}
                    onChange={setSlug}
                    source={title}
                    routePrefix="/publications"
                    siteUrl={SITE_URL}
                    slugify={slugify}
                    // Closed over this publication's own id so editing never
                    // reports its own slug as taken.
                    checkAvailability={(candidate) =>
                      checkPublicationSlugAvailable(candidate, initial?.id)
                    }
                    // Unlike posts/theses/catalogs, a duplicate here is rejected
                    // by the insert rather than suffixed — so it really is an
                    // error, not a note.
                    takenIsError
                    required
                    htmlFor="pf-field-slug"
                    error={fieldIssues.slug}
                    labels={{
                      label: "Slug (URL)",
                      autoHint: "From the title",
                      reset: "Use the title",
                      checking: "Checking…",
                      available: "Available",
                      taken: "Already used — choose another",
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Article type" required htmlFor="pf-field-article_type">
                    {(p) => (
                      <select {...p} name="article_type" defaultValue={defaults.article_type}>
                        <option value="article">Article</option>
                        <option value="review">Review</option>
                        <option value="account">Account</option>
                        <option value="editorial">Editorial</option>
                      </select>
                    )}
                  </Field>
                  <Field label="Language" required htmlFor="pf-field-language">
                    {(p) => (
                      <select {...p} name="language" defaultValue={defaults.language}>
                        <option value="en">English</option>
                        <option value="km">Khmer</option>
                      </select>
                    )}
                  </Field>
                </div>
              </div>

              <hr className="border-divider" />

              <div key={`journal-${epoch}`}>
                <h3 className="text-sm font-semibold text-text-heading">Journal &amp; issue</h3>
                <p className="mb-4 mt-0.5 text-xs text-text-muted">
                  Where the article appeared. Everything here is optional — a publication with
                  no journal of record simply omits it from the citation.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="Journal name"
                    htmlFor="pf-field-journal_name"
                    error={fieldIssues.journal_name}
                    className="md:col-span-2"
                  >
                    {(p) => (
                      <input
                        {...p}
                        name="journal_name"
                        defaultValue={defaults.journal_name}
                        placeholder="e.g. PTEC Journal of Education"
                      />
                    )}
                  </Field>
                  <Field label="Volume" htmlFor="pf-field-volume" error={fieldIssues.volume}>
                    {(p) => (
                      <input {...p} name="volume" defaultValue={defaults.volume} placeholder="12" inputMode="numeric" />
                    )}
                  </Field>
                  <Field label="Issue" htmlFor="pf-field-issue_no" error={fieldIssues.issue_no}>
                    {(p) => (
                      <input {...p} name="issue_no" defaultValue={defaults.issue_no} placeholder="3" inputMode="numeric" />
                    )}
                  </Field>
                  <Field label="First page" htmlFor="pf-field-page_start" error={fieldIssues.page_start}>
                    {(p) => (
                      <input {...p} name="page_start" defaultValue={defaults.page_start} placeholder="101" inputMode="numeric" />
                    )}
                  </Field>
                  <Field label="Last page" htmlFor="pf-field-page_end" error={fieldIssues.page_end}>
                    {(p) => (
                      <input {...p} name="page_end" defaultValue={defaults.page_end} placeholder="118" inputMode="numeric" />
                    )}
                  </Field>
                  <Field
                    label="Article number"
                    htmlFor="pf-field-article_no"
                    error={fieldIssues.article_no}
                    hint="Used instead of page numbers by some journals."
                  >
                    {(p) => (
                      <input {...p} name="article_no" defaultValue={defaults.article_no} placeholder="e0123" />
                    )}
                  </Field>
                  <Field
                    label="Publication date"
                    htmlFor="pf-field-publication_date"
                    error={fieldIssues.publication_date}
                  >
                    {(p) => (
                      <input {...p} type="date" name="publication_date" defaultValue={defaults.publication_date} />
                    )}
                  </Field>
                </div>
              </div>

              <hr className="border-divider" />

              <div key={`rights-${epoch}`}>
                <h3 className="text-sm font-semibold text-text-heading">Identifiers &amp; rights</h3>
                <p className="mb-4 mt-0.5 text-xs text-text-muted">
                  A license is required to publish, because harvesters (BASE, CORE, OpenAIRE)
                  only take openly-licensed records.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="DOI"
                    htmlFor="pf-field-doi"
                    error={fieldIssues.doi}
                    hint="Just the identifier — no https://doi.org/ prefix."
                  >
                    {(p) => (
                      <input
                        {...p}
                        className={fieldIssues.doi ? `${p.className} font-mono text-xs` : MONO_INPUT_CLASS}
                        name="doi"
                        defaultValue={defaults.doi}
                        placeholder="10.1234/abcd.2026.001"
                      />
                    )}
                  </Field>
                  <Field
                    label="License"
                    htmlFor="pf-field-license"
                    error={fieldIssues.license}
                    hint="Required before publishing."
                  >
                    {(p) => (
                      <input {...p} name="license" defaultValue={defaults.license} placeholder="CC BY 4.0" />
                    )}
                  </Field>
                  <Field
                    label="Copyright"
                    htmlFor="pf-field-copyright"
                    error={fieldIssues.copyright}
                    className="md:col-span-2"
                  >
                    {(p) => (
                      <input {...p} name="copyright" defaultValue={defaults.copyright} placeholder="© 2026 The Authors" />
                    )}
                  </Field>
                </div>
              </div>
            </div>

            <div id="pub-panel-authors" role="tabpanel" aria-labelledby="pub-tab-authors" tabIndex={-1} hidden={activeStep !== "authors"}>
              <AuthorshipEditor value={authorRows} onChange={changeAuthors} disabled={saving} />
            </div>

            <div id="pub-panel-content" role="tabpanel" aria-labelledby="pub-tab-content" tabIndex={-1} hidden={activeStep !== "content"} className="space-y-6">
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

              <div
                id="pf-field-keywords"
                tabIndex={-1}
                key={`keywords-${epoch}`}
                className="max-w-2xl scroll-mt-24"
                data-invalid={fieldIssues.keywords ? "true" : undefined}
              >
                <Field
                  label="Keywords / Tags (ពាក្យគន្លឹះ)"
                  required
                  htmlFor="pf-field-keywords-input"
                  error={fieldIssues.keywords}
                  hint="ចុច Enter ឬ , ដើម្បីបន្ថែម tag — max 20."
                >
                  <TagInput
                    name="keywords"
                    defaultTags={splitList(defaults.keywords, 20)}
                    placeholder="e.g. pedagogy, STEM, teacher education…"
                    disabled={saving}
                  />
                </Field>
              </div>
            </div>

            <div id="pub-panel-details" role="tabpanel" aria-labelledby="pub-tab-details" tabIndex={-1} hidden={activeStep !== "details"} className="space-y-6" key={`details-${epoch}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Publisher" htmlFor="pf-field-publisher" error={fieldIssues.publisher}>
                  {(p) => (
                    <input
                      {...p}
                      name="publisher"
                      defaultValue={defaults.publisher}
                      placeholder="Publisher of record (leave blank if none)"
                    />
                  )}
                </Field>
                <Field label="ISBN" htmlFor="pf-field-isbn" error={fieldIssues.isbn}>
                  {(p) => (
                    <input
                      {...p}
                      className={fieldIssues.isbn ? `${p.className} font-mono text-xs` : MONO_INPUT_CLASS}
                      name="isbn"
                      defaultValue={defaults.isbn}
                      placeholder="978-9924-XX-XXX-X"
                    />
                  )}
                </Field>
              </div>

              <div
                id="pf-field-subjects"
                tabIndex={-1}
                className="scroll-mt-24"
                data-invalid={fieldIssues.subjects ? "true" : undefined}
              >
                <Field
                  label="Subjects"
                  htmlFor="pf-field-subjects-input"
                  error={fieldIssues.subjects}
                  hint="Broad subject areas shown as chips in the article Overview (max 12)."
                >
                  <TagInput
                    name="subjects"
                    defaultTags={splitList(defaults.subjects, 12)}
                    placeholder="e.g. Education, Pedagogy, STEM…"
                    disabled={saving}
                  />
                </Field>
              </div>

              <Field
                label="Table of contents"
                htmlFor="pf-field-table_of_contents"
                hint={
                  <>
                    One entry per line, as <code>Section title :: page</code> — the page number
                    may be left off.
                  </>
                }
              >
                {(p) => (
                  <textarea
                    {...p}
                    className={`${TEXTAREA_CLASS} font-mono text-xs`}
                    name="table_of_contents"
                    rows={8}
                    defaultValue={defaults.table_of_contents}
                    placeholder={"Introduction :: 1\nLiterature review :: 4\nMethodology :: 9"}
                  />
                )}
              </Field>

              <Field
                label="Learning outcomes"
                htmlFor="pf-field-learning_outcomes"
                hint="One per line."
              >
                {(p) => (
                  <textarea
                    {...p}
                    className={TEXTAREA_CLASS}
                    name="learning_outcomes"
                    rows={5}
                    defaultValue={defaults.learning_outcomes}
                    placeholder={"Explain the drivers of digital pedagogy adoption\nApply the framework to lesson planning"}
                  />
                )}
              </Field>

              <Field
                label="FAQ"
                htmlFor="pf-field-faqs"
                hint={
                  <>
                    Start each question with <code>Q:</code> and each answer with <code>A:</code>.
                    Shown as an accordion and emitted as FAQ structured data for search engines.
                  </>
                }
              >
                {(p) => (
                  <textarea
                    {...p}
                    className={TEXTAREA_CLASS}
                    name="faqs"
                    rows={8}
                    defaultValue={defaults.faqs}
                    placeholder={"Q: Who is this article for?\nA: Teacher educators and student teachers.\n\nQ: Can I reuse the figures?\nA: Yes, under the CC BY 4.0 license with attribution."}
                  />
                )}
              </Field>
            </div>

            <div id="pub-panel-files" role="tabpanel" aria-labelledby="pub-tab-files" tabIndex={-1} hidden={activeStep !== "files"} className="space-y-6">
              <div
                id="pf-field-pdf"
                tabIndex={-1}
                className="scroll-mt-24"
                data-invalid={fieldIssues.pdf ? "true" : undefined}
              >
                <Field
                  label="Article PDF"
                  required
                  htmlFor="pf-field-pdf-input"
                  error={fieldIssues.pdf}
                  hint="PDF only. You can save a draft without it; publishing requires it."
                >
                  <PdfDropzone
                    file={pdfFile}
                    onChange={(file) => {
                      setPdfFile(file);
                      markDirty();
                    }}
                    existingLabel={
                      isEdit && pdfUrl ? "A PDF is already attached — upload to replace it" : null
                    }
                  />
                </Field>
              </div>

              <div
                id="pf-field-cover"
                tabIndex={-1}
                className="scroll-mt-24"
                data-invalid={fieldIssues.cover ? "true" : undefined}
              >
                <Field
                  label="Graphical abstract / cover image"
                  htmlFor="pf-field-cover-input"
                  error={fieldIssues.cover}
                  hint="JPG, PNG, WebP or AVIF. Without one, listings show a placeholder."
                >
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
                </Field>
              </div>

              <div>
                <p className={LABEL_CLASS}>Supporting information</p>
                <p className="-mt-1 mb-2 text-xs text-text-muted">
                  Datasets, appendices or instruments, as PDFs. Each one needs a label readers
                  will recognise.
                </p>

                {existingSiFiles.length + newSiFiles.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {existingSiFiles.map((f, i) => (
                      <li key={f.id} className="focus-shell flex items-center gap-3 rounded-lg border border-divider bg-paper/40 px-3 py-2">
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
                      <li key={`new-${i}`} className="focus-shell flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 px-3 py-2">
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

            <div id="pub-panel-review" role="tabpanel" aria-labelledby="pub-tab-review" tabIndex={-1} hidden={activeStep !== "review"}>
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
    </FormShell>
  );
}
