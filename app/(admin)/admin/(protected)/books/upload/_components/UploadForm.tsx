"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { saveBookRecord } from "@/app/(admin)/admin/(protected)/books/actions";
import { extractBookMetadata } from "@/app/actions/ai-extraction";
import { deleteZimaFile } from "@/app/actions/upload";
import {
  departments as defaultDepartments,
  makeUid,
  bookFolder,
  bookPdfPath,
  bookCoverPath,
  LICENSE_OPTIONS,
} from "@/lib/book-utils";
import Icon from "@/components/ui/core/Icon";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import TagInput from "@/components/ui/core/TagInput";
import {
  Field,
  FormSection,
  StickyActionBar,
  ButtonBusy,
  UploadProgress,
  BTN_PRIMARY,
  BTN_SECONDARY,
  LABEL_CLASS,
  TEXTAREA_CLASS,
  HINT_CLASS,
  Switch,
} from "@/components/admin/kit/form";
import {
  uploadWithProgress,
  type UploadProgress as Transfer,
} from "@/lib/upload-progress";
import { uploadChunked } from "@/lib/upload-chunked";
import { EBOOKS_BASE_PATH, EBOOKS_REVIEW_PATH } from "@/lib/admin/ebooks-url";
import { getPdfPageCount, isPdfFile } from "@/lib/pdf-client-utils";
import AuthorPicker, { type AuthorSelection } from "@/components/admin/books/AuthorPicker";
import DuplicateAlert, { type DuplicateOverride } from "@/components/admin/books/DuplicateAlert";
import PreflightPanel from "@/components/admin/books/PreflightPanel";
import { useDuplicateCheck } from "@/components/admin/books/use-duplicate-check";
import { hashFile } from "@/lib/books/duplicate-detection/client-hash";
import { validateIsbn } from "@/lib/books/duplicate-detection/normalize";
import { buildPreflight } from "@/lib/books/upload-preflight";
import {
  FileText,
  ImagePlus,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Send,
  Globe,
  X,
} from "lucide-react";

const LANGUAGES = ["Khmer", "English"] as const;

/** Pre-filled, not entered. See `yearTouched`. */
const DEFAULT_YEAR = String(new Date().getFullYear());

/** Matches the global cap enforced by /api/admin/upload. Checked here too so a
 *  100 MB file is refused before it is sent, not after. */
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const RECOMMENDED_PDF_BYTES = 25 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

type Phase = "idle" | "uploading-pdf" | "uploading-cover" | "saving" | "done";
type PublishMode = "published" | "pending_review";

/** Fields the AI extractor can fill. Tracked so the form can tell the librarian
 *  which values it drafted — an unattributed value is one nobody reviews. */
type AiField = "title" | "author" | "year" | "language" | "summary" | "pages";

/** A drop bypasses the input element, so the picked file has to be written
 *  back into it — the form reads `pdf` out of FormData on submit.
 *  Module scope: it closes over nothing, so rebuilding it per render bought
 *  nothing. */
function assignToInput(input: HTMLInputElement | null, file: File) {
  if (!input) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * A composite control (SearchableSelect, TagInput) renders its own trigger and
 * owns its own accessible name, so it cannot take `Field`'s `htmlFor` — a
 * `<label htmlFor>` pointing at an id nothing renders is worse than no label
 * element at all. The visible text is a `<span>` styled exactly like a field
 * label, and the control receives the same string as its `aria-label`.
 */
function CompositeField({
  label,
  required,
  hint,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className={LABEL_CLASS}>
        {label}
        {required && (
          <span className="ms-0.5 font-normal text-danger" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {hint && <p className={HINT_CLASS}>{hint}</p>}
    </div>
  );
}

/* ── Upload progress ──────────────────────────────────────────────────────
   Named steps AND real bytes. The transport is `XMLHttpRequest`
   (`lib/upload-progress.ts`) precisely so this can be determinate:
   the previous `fetch` reported nothing while a 40 MB PDF went out, and the
   panel could only repeat the step's own label beside a spinner. The panel
   itself is `components/admin/kit/form/UploadProgress.tsx`, shared with the
   book edit form, which had a second copy of the same stepper. */
const PHASE_STEPS = ["uploading-pdf", "uploading-cover", "saving"] as const;

export default function UploadForm({
  recentBooks = [],
  initialTitle = "",
}: { recentBooks?: unknown[]; initialTitle?: string } = {}) {
  const router = useRouter();
  const supabase = createClient();

  const [phase, setPhase] = useState<Phase>("idle");
  /* Byte progress for whichever file is in flight, plus its name — the readout
     answers "which file, how far" and both halves are wrong without the other. */
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [transferName, setTransferName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishMode, setPublishMode] = useState<PublishMode>("published");
  // Library policy (migration 0131). Defaults to on: a new book is downloadable
  // unless a librarian decides otherwise, which is what every existing book is.
  const [allowDownload, setAllowDownload] = useState(true);
  const [downloadReason, setDownloadReason] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverMeta, setCoverMeta] = useState<{ name: string; size: number } | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{ name: string; size: number } | null>(null);
  const [pdfDragging, setPdfDragging] = useState(false);
  const [coverDragging, setCoverDragging] = useState(false);
  const [deptList, setDeptList] = useState<string[]>(defaultDepartments);
  const [catList, setCatList] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFilled, setAiFilled] = useState<AiField[]>([]);
  const [detectedPages, setDetectedPages] = useState<number | null>(null);
  const [isDetectingPages, setIsDetectingPages] = useState(false);

  /* ── Fields the duplicate gate reads ──────────────────────────────────
     These five are controlled, and the rest of the form stays uncontrolled.
     The split is not cosmetic: the detector has to see the record as it is
     being typed, and a ref only reports its value when something asks. Every
     other field (summary, language, pages, tags) has no bearing on identity,
     so it keeps the cheaper uncontrolled shape it already had. */
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState<AuthorSelection>({ id: null, name: "" });
  const [isbn, setIsbn] = useState("");
  const [publisher, setPublisher] = useState("");
  const [year, setYear] = useState(DEFAULT_YEAR);
  /* The year box ships pre-filled with the current year, which is a DEFAULT and
     not an answer. Without this flag the AI assistant would refuse to correct
     it — "do not overwrite what the librarian typed" would silently become "do
     not overwrite what the form typed". */
  const [yearTouched, setYearTouched] = useState(false);
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");

  /* sha256 of the chosen PDF, computed locally so "this file is already in the
     library" is answerable BEFORE the transfer, not after it. Null is a real
     state — a plain-http session has no SubtleCrypto — and simply means the
     file-identity check waits for the server. */
  const [contentHash, setContentHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [duplicateOverride, setDuplicateOverride] = useState<DuplicateOverride>(null);

  const t = useTranslations("adminUpload.single");

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const languageSelectRef = useRef<HTMLSelectElement>(null);
  const summaryInputRef = useRef<HTMLTextAreaElement>(null);
  const pagesInputRef = useRef<HTMLInputElement>(null);
  /* Enter, a click and a double click can all reach the handler before React
     has re-rendered with `disabled`. The ref closes that window; `phase` alone
     does not. */
  const inFlight = useRef(false);
  /* Files already in storage that no database row references yet. Non-null only
     between the upload finishing and the save succeeding. */
  const storedForCleanup = useRef<{ pdfUrl: string; coverUrl: string | null } | null>(null);
  /* Set when the book saved but something optional did not. The success screen
     holds instead of redirecting when this is set — see handleSubmit. */
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  const refreshLists = useCallback(async () => {
    const [deptRes, catRes] = await Promise.all([
      supabase.from("departments").select("name").order("name", { ascending: true }),
      supabase.from("categories").select("name").order("name", { ascending: true }),
    ]);
    if (deptRes.data && deptRes.data.length > 0)
      setDeptList(deptRes.data.map((d: { name: string }) => d.name));
    if (catRes.data && catRes.data.length > 0)
      setCatList(catRes.data.map((c: { name: string }) => c.name));
  }, [supabase]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshLists();
    }, 0);
    window.addEventListener("ptec:categories-changed", refreshLists);
    window.addEventListener("ptec:departments-changed", refreshLists);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("ptec:categories-changed", refreshLists);
      window.removeEventListener("ptec:departments-changed", refreshLists);
    };
  }, [refreshLists]);

  /**
   * Single owner for the cover's object URL.
   *
   * This effect's cleanup runs both when `coverPreview` changes and on unmount,
   * so it already covers replace, remove and navigate-away. The pick/remove
   * handlers used to revoke as well, which meant every swap revoked the same
   * URL twice — harmless, but it made the lifetime look like it had three
   * owners and forced `coverPreview` into acceptCover's dependency list,
   * rebuilding that callback on every preview change.
   */
  useEffect(() => {
    if (!coverPreview) return;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  const busy = phase !== "idle";

  /* ── The duplicate gate ────────────────────────────────────────────────
     Debounced, server-side, and advisory: `saveBookRecord` re-runs the same
     detector at insert time, so nothing here is load-bearing for correctness.
     What it is load-bearing for is the librarian's time — being told after a
     40 MB upload is the failure this replaces. */
  const duplicates = useDuplicateCheck({
    title,
    author: author.name,
    isbn,
    publisher,
    year,
    contentHash: contentHash ?? undefined,
  });

  const isbnAssessment = validateIsbn(isbn);
  const duplicateResult = duplicates.result;
  const blockedByDuplicate = Boolean(duplicateResult?.blocked);
  const overrideSatisfies =
    blockedByDuplicate &&
    duplicateResult?.top != null &&
    duplicateOverride?.acknowledgedBookId === duplicateResult.top.bookId &&
    // A byte-identical PDF is never overridable — the server refuses it too.
    !duplicateResult.top.signals.includes("content_hash");

  /* The only state in which the primary action is disabled. A blocking match
     is not a validation error the librarian can fix in the form — the record
     already exists — so leaving the button live would promise something the
     server will refuse. Every other finding stays submittable on purpose:
     disabling a button is how a form stops explaining itself. */
  const saveBlocked = blockedByDuplicate && !overrideSatisfies;

  const preflight = buildPreflight({
    pdf: {
      chosen: Boolean(pdfMeta),
      sizeBytes: pdfMeta?.size ?? 0,
      overSize: (pdfMeta?.size ?? 0) > MAX_PDF_BYTES,
      overRecommended: (pdfMeta?.size ?? 0) > RECOMMENDED_PDF_BYTES,
    },
    pages: { detecting: isDetectingPages || hashing, detected: detectedPages },
    title,
    author: { name: author.name, canonicalId: author.id },
    category,
    department,
    isbn: { raw: isbn, status: isbnAssessment.status },
    duplicates:
      duplicates.state === "ready" && duplicateResult
        ? {
            state: "ready",
            blocked: duplicateResult.blocked,
            count: duplicateResult.matches.length,
            confidence: duplicateResult.top?.confidence ?? null,
          }
        : duplicates.state === "error"
          ? { state: "error" }
          : { state: duplicates.state === "checking" ? "checking" : "idle" },
  });

  /* ── PDF ─────────────────────────────────────────────────────────────── */

  const acceptPdf = useCallback(
    async (file: File | null | undefined) => {
      setAiError(null);
      setError(null);
      setDetectedPages(null);
      setAiFilled([]);
      // A new file invalidates both the identity of the old one and any
      // acknowledgement made about it.
      setContentHash(null);
      setDuplicateOverride(null);

      if (!file) {
        setPdfMeta(null);
        return;
      }
      // Validate BEFORE anything else: refusing a 120 MB file after it has been
      // read is the worst possible order.
      if (!isPdfFile(file)) {
        setPdfMeta(null);
        if (pdfInputRef.current) pdfInputRef.current.value = "";
        setError(t("err.pdfOnly"));
        return;
      }
      if (file.size > MAX_PDF_BYTES) {
        setPdfMeta(null);
        if (pdfInputRef.current) pdfInputRef.current.value = "";
        setError(t("err.pdfTooLarge", { size: formatBytes(file.size), limit: formatBytes(MAX_PDF_BYTES) }));
        return;
      }

      setPdfMeta({ name: file.name, size: file.size });

      setIsDetectingPages(true);
      try {
        const count = await getPdfPageCount(file);
        if (count && count > 0) {
          if (pagesInputRef.current) pagesInputRef.current.value = String(count);
          setDetectedPages(count);
        }
      } catch (err) {
        console.warn("[UploadForm] Could not detect pages:", err);
      } finally {
        setIsDetectingPages(false);
      }

      // Fingerprint last: it is the slowest of the three local reads and the
      // only one whose absence degrades gracefully.
      setHashing(true);
      try {
        setContentHash(await hashFile(file));
      } finally {
        setHashing(false);
      }
    },
    [t],
  );

  /* ── Cover ───────────────────────────────────────────────────────────── */

  const acceptCover = useCallback(
    (file: File | null | undefined) => {
      setError(null);
      if (!file) {
        setCoverPreview(null);
        setCoverMeta(null);
        return;
      }
      if (!COVER_TYPES.includes(file.type)) {
        if (coverInputRef.current) coverInputRef.current.value = "";
        setError(t("err.coverType"));
        return;
      }
      if (file.size > MAX_COVER_BYTES) {
        if (coverInputRef.current) coverInputRef.current.value = "";
        setError(t("err.coverSize"));
        return;
      }
      setCoverPreview(URL.createObjectURL(file));
      setCoverMeta({ name: file.name, size: file.size });
    },
    [t],
  );

  function removeCover() {
    setCoverPreview(null);
    setCoverMeta(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  /* ── AI metadata assistant ───────────────────────────────────────────── */

  async function handleAutoFill() {
    const file = pdfInputRef.current?.files?.[0];
    if (!file) {
      setAiError(t("chooseFirst"));
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      // Run AI extraction and page count detection in parallel — the page
      // count is local (sub-100ms) while the AI call takes a few seconds,
      // so the page count will usually be ready before the AI response.
      const fd = new FormData();
      fd.set("pdf", file);
      const [res, pageCount] = await Promise.all([
        extractBookMetadata(fd),
        detectedPages ? Promise.resolve(null) : getPdfPageCount(file),
      ]);

      if ("error" in res) {
        setAiError(res.error);
        return;
      }

      const { title: aiTitle, author: aiAuthor, year: aiYear, language, summary } = res.data;
      // Imperative fill — these are uncontrolled inputs (native defaultValue),
      // matching the rest of this form; only overwrite fields the model
      // actually returned a value for, and never touch category/department
      // (this library's taxonomy is too specific for the model to guess).
      const filled: AiField[] = [];
      // A value the librarian has already typed is the human answer and wins.
      // The model fills BLANKS; it does not correct people. (§11)
      if (aiTitle && !title.trim()) {
        setTitle(aiTitle);
        filled.push("title");
      }
      if (aiAuthor && !author.name.trim()) {
        // Never carries a canonical id: the model produced a string, not a
        // decision about which person in the collection this is.
        setAuthor({ id: null, name: aiAuthor });
        filled.push("author");
      }
      if (aiYear && (!year.trim() || !yearTouched)) {
        setYear(String(aiYear));
        filled.push("year");
      }
      if (language && languageSelectRef.current) {
        languageSelectRef.current.value = language;
        filled.push("language");
      }
      if (summary && summaryInputRef.current && !summaryInputRef.current.value.trim()) {
        summaryInputRef.current.value = summary;
        filled.push("summary");
      }

      // Fill pages if not already detected from the file pick.
      if (pageCount && pagesInputRef.current) {
        pagesInputRef.current.value = String(pageCount);
        setDetectedPages(pageCount);
      }
      if (pageCount || detectedPages) filled.push("pages");

      setAiFilled(filled);
    } finally {
      setAiLoading(false);
    }
  }

  /* ── Submit ──────────────────────────────────────────────────────────── */

  /**
   * Remove files this submission stored but no record claimed.
   *
   * Best effort by design: the librarian's problem is the save that failed, and
   * a storage error while tidying up must not overwrite that message or throw
   * out of the catch block it runs in. A file that survives here is a stray
   * object, which `scripts/check-file-health.ts` already sweeps — strictly
   * better than the retry-storms-a-second-copy behaviour it replaces.
   */
  async function discardStoredFiles() {
    const stored = storedForCleanup.current;
    if (!stored) return;
    storedForCleanup.current = null;
    await Promise.allSettled(
      [stored.pdfUrl, stored.coverUrl]
        .filter((url): url is string => Boolean(url))
        .map((url) => deleteZimaFile(url)),
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const pdf = formData.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0) { setError(t("err.pdfRequired")); return; }
    if (!isPdfFile(pdf)) { setError(t("err.pdfOnly")); return; }
    if (pdf.size > MAX_PDF_BYTES) {
      setError(t("err.pdfTooLarge", { size: formatBytes(pdf.size), limit: formatBytes(MAX_PDF_BYTES) }));
      return;
    }

    const cover = formData.get("cover");
    const hasCover = cover instanceof File && cover.size > 0;
    if (hasCover) {
      if (!COVER_TYPES.includes((cover as File).type)) { setError(t("err.coverType")); return; }
      if ((cover as File).size > MAX_COVER_BYTES) { setError(t("err.coverSize")); return; }
    }

    const submittedTitle = title.trim();
    if (!submittedTitle) {
      setError(t("err.titleRequired"));
      titleInputRef.current?.focus();
      return;
    }

    /* Every field the server refuses on is checked HERE, before the first byte
       moves. `saveBookRecord` throws "department is required" after the PDF and
       the cover are already in storage, which leaves two orphaned objects and
       asks the librarian to re-pick a 40 MB file to fix a dropdown. The server
       checks remain the authority; this is the same answer, arrived at while it
       is still free. */
    const submittedCategory = category.trim();
    const submittedDepartment = department.trim();
    if (!submittedCategory) {
      setError(t("err.categoryRequired"));
      return;
    }
    if (!submittedDepartment) {
      setError(t("err.departmentRequired"));
      return;
    }

    /* A debounce window is not a decision point. Re-check with the record as
       it stands NOW, before a byte is uploaded — the librarian may have typed
       the ISBN a moment ago, or another cataloguer may have saved the same
       book while this form sat open. */
    const fresh = await duplicates.runNow();
    if (fresh?.blocked && fresh.top) {
      const overridable = !fresh.top.signals.includes("content_hash");
      const acknowledged =
        overridable && duplicateOverride?.acknowledgedBookId === fresh.top.bookId;
      if (!acknowledged) {
        setError(
          overridable
            ? t("err.duplicateIsbn", { title: fresh.top.title })
            : t("err.duplicateFile", { title: fresh.top.title }),
        );
        return;
      }
    }

    inFlight.current = true;
    try {
      setPhase("uploading-pdf");
      /* From state, not `formData`: these two are controlled inputs, so state
         is the value the librarian actually chose. The old `formData` read
         returned null and fell back to "uncategorized", which silently filed
         every book under the wrong storage folder. */
      const categoryName = submittedCategory;
      const uid = makeUid();
      const folder = bookFolder(categoryName, submittedTitle, uid);
      const pdfPath = bookPdfPath(folder);

      setTransferName(pdf.name);
      setTransfer(null);
      const { url: pdfPublicUrl, contentHash: uploadedHash } = await uploadChunked<{
        url: string;
        contentHash?: string;
      }>("/api/admin/upload/chunk", pdf, pdfPath, {
        onProgress: setTransfer,
        fallbackError: (status) => `PDF upload failed (${status})`,
        extraFields: { target: "private" },
      });

      let coverUrl: string | null = null;
      let coverFailure: string | null = null;
      if (hasCover) {
        setPhase("uploading-cover");
        const coverFile = cover as File;
        const coverPath = bookCoverPath(folder, coverFile.name);
        try {
          const coverPayload = new FormData();
          coverPayload.set("file", coverFile);
          coverPayload.set("key", coverPath);
          coverPayload.set("target", "public");

          setTransferName(coverFile.name);
          setTransfer(null);
          const { url: uploadedCoverUrl } = await uploadWithProgress<{ url: string }>(
            "/api/admin/upload",
            coverPayload,
            {
              onProgress: setTransfer,
              fallbackError: (status) => `Cover upload failed (${status})`,
            },
          );
          coverUrl = uploadedCoverUrl;
        } catch (coverErr) {
          // The cover is optional and the PDF is already stored — losing the
          // whole upload over a thumbnail would be the wrong trade. But it was
          // only ever `console.warn`ed, so the book was saved without its cover
          // and nobody was told: the librarian saw an unqualified success and
          // found a placeholder in the catalogue later. Carried to the success
          // screen instead.
          console.warn("Cover upload failed:", coverErr instanceof Error ? coverErr.message : coverErr);
          coverFailure = coverErr instanceof Error ? coverErr.message : String(coverErr);
        }
      }

      setPhase("saving");
      setTransfer(null);
      setTransferName(null);
      // From here on the bytes are in storage but no row references them. If
      // the save fails, `discardStoredFiles()` in the catch takes them back out.
      storedForCleanup.current = { pdfUrl: pdfPublicUrl, coverUrl };
      const res = await saveBookRecord({
        title:      submittedTitle,
        author:     author.name,
        authorId:   author.id ?? undefined,
        department: submittedDepartment,
        category:   submittedCategory,
        language:   (formData.get("language")   as string) ?? "",
        summary:    (formData.get("summary")    as string) ?? "",
        isbn,
        publisher,
        year,
        pages:      (formData.get("pages")      as string) ?? "",
        fileUrl:    pdfPublicUrl,
        fileSizeKb: String(Math.round(pdf.size / 1024)),
        coverUrl:   coverUrl ?? "",
        tags:       (formData.get("tags")       as string) ?? "",
        // The server's own hash of the uploaded bytes, not the browser's:
        // the record must record what storage actually holds.
        contentHash: uploadedHash ?? contentHash ?? "",
        // See migration 0128: recorded, never recomputed from the title.
        storageFolder: folder,
        status:     publishMode,
        allowDownload,
        downloadDisabledReason: allowDownload ? null : downloadReason.trim() || null,
        license:    (formData.get("license")    as string) ?? "",
        // Carried only when it matches the blocking match the form showed;
        // the server re-checks that it still does.
        duplicateOverride: overrideSatisfies && duplicateOverride ? duplicateOverride : undefined,
      });
      if (res && "error" in res) throw new Error(res.error);
      if (res && "success" in res) {
        // The row now owns the files; nothing to undo.
        storedForCleanup.current = null;
        /*
          Land where the work continues, not on the artefact.
          A published book used to redirect to its own public page — which
          answered "did it work?" and nothing else: to add the next book, or
          check the one just added against the rest of the collection, the
          librarian had to navigate back into the admin panel. Published books
          return to the collection; pending ones go to the queue that now owns
          them (they 404 on the public page anyway).
        */
        setPhase("done");
        if (coverFailure) {
          // Do not navigate past a message the librarian has to act on. The
          // book exists and is correct apart from its cover; they need to know
          // that now, while they still have the file to hand.
          setSaveWarning(t("err.coverNotSaved", { reason: coverFailure }));
          router.refresh();
          return;
        }
        router.push(publishMode === "pending_review" ? EBOOKS_REVIEW_PATH : EBOOKS_BASE_PATH);
        // The new record must be visible on arrival; the page is cached.
        router.refresh();
        return;
      }
      // Neither shape came back — treat as a failure rather than silently
      // leaving the form in "saving".
      throw new Error(t("err.uploadFailed"));
    } catch (err) {
      /* Report FIRST, tidy up after — and never await the tidying.
         A save that fails after the upload leaves a PDF and a cover in storage
         that no row will ever reference — the state the librarian reported:
         "PDF and cover already uploaded to storage but it says error". Retrying
         then stores a SECOND copy, and the first is invisible to every admin
         screen. But the cleanup is a network call to storage, on a path where
         storage may be exactly what just failed: awaiting it here held the form
         on its spinner for the whole timeout before the error appeared, which
         reads as a hang. The librarian's error is due now; the housekeeping is
         not, and nothing downstream depends on when it finishes. */
      setPhase("idle");
      setTransfer(null);
      setTransferName(null);
      setError(err instanceof Error ? err.message : t("err.uploadFailed"));
      void discardStoredFiles();
    } finally {
      inFlight.current = false;
    }
  }

  const submitLabel =
    publishMode === "published" ? t("submitPublish") : t("submitForReview");
  const busyLabel =
    phase === "uploading-pdf"
      ? t("phaseStep.uploading-pdf")
      : phase === "uploading-cover"
        ? t("phaseStep.uploading-cover")
        : t("phaseStep.saving");

  /* ── Success ──────────────────────────────────────────────────────────
     Rendered while `router.push` resolves the destination, so the librarian
     gets a confirmation instead of a form that has gone quiet. Nothing is
     delayed to show it. */
  if (phase === "done") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="upl-done flex flex-col items-center justify-center rounded-2xl border border-success-line bg-success-soft px-6 py-16 text-center"
      >
        <span
          className="upl-done-mark relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-success-line bg-bg-surface text-success"
          aria-hidden="true"
        >
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <p className="text-base font-bold text-text-heading">{t("success.title")}</p>
        <p className="mt-1.5 max-w-sm text-sm text-text-body">
          {publishMode === "published" ? t("success.published") : t("success.pending")}
        </p>
        {saveWarning ? (
          /* Saved, with a caveat. No spinner and no redirect: this is a message
             to act on, not a status to watch scroll past. */
          <>
            <p className="mt-4 max-w-sm rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-text">
              {saveWarning}
            </p>
            <Link
              href={publishMode === "pending_review" ? EBOOKS_REVIEW_PATH : EBOOKS_BASE_PATH}
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand underline underline-offset-2"
            >
              {publishMode === "published" ? t("success.redirectBooks") : t("success.redirectReview")}
            </Link>
          </>
        ) : (
          <p className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {publishMode === "published" ? t("success.redirectBooks") : t("success.redirectReview")}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <UploadProgress
        steps={PHASE_STEPS.map((id) => ({ id, label: t(`phaseStep.${id}`) }))}
        /* "done" is impossible here — the success screen returns above. */
        currentId={phase === "idle" ? null : phase}
        transfer={transfer}
        fileName={transferName}
        processingLabel={t("progress.processing")}
        transferredLabel={(done, total) => t("progress.transferred", { done, total })}
        announceLabel={(current, total, label) =>
          t("progress.step", { current, total, label })
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* ── Step 1 · Files ─────────────────────────────────────────── */}
          <FormSection
            title={t("files")}
            description={t("filesSub")}
            action={
              pdfMeta && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-success-line bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-text">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("pdfReady")}
                </span>
              )
            }
          >
            {/* PDF — a real <label for> over an sr-only input, so the control is
                reachable by keyboard and has a genuine accessible name. The
                previous div[role=button] + .click() had neither. */}
            <div>
              <span className={LABEL_CLASS}>
                {t("pdfFile")}
                <span className="ms-0.5 font-normal text-danger" aria-hidden="true">*</span>
              </span>
              <label
                htmlFor="book-pdf"
                onDragOver={(e) => { e.preventDefault(); if (!busy) setPdfDragging(true); }}
                onDragLeave={() => setPdfDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPdfDragging(false);
                  if (busy) return;
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  assignToInput(pdfInputRef.current, file);
                  void acceptPdf(file);
                }}
                className={`focus-shell flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 ${
                  pdfMeta
                    ? "border-success-line bg-success-soft/40"
                    : pdfDragging
                      ? "border-brand bg-surface-brand-soft"
                      : "border-divider bg-paper hover:border-border-strong"
                } ${busy ? "pointer-events-none opacity-60" : ""}`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    pdfMeta ? "bg-success-soft text-success-text" : "bg-surface-brand-soft text-brand"
                  }`}
                  aria-hidden="true"
                >
                  <FileText className="h-6 w-6" />
                </span>
                {pdfMeta ? (
                  <>
                    <span className="max-w-full truncate text-sm font-semibold text-text-heading">
                      {pdfMeta.name}
                    </span>
                    <span className="text-xs tabular-nums text-text-muted">
                      {formatBytes(pdfMeta.size)} · {t("clickReplace")}
                    </span>
                    {pdfMeta.size > RECOMMENDED_PDF_BYTES && (
                      <span className="text-xs font-semibold text-warning-text">
                        {t("largeFileWarning")}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-text-heading">
                      {t("clickSelectPdf")}
                    </span>
                    <span className="text-xs text-text-muted">
                      {t("pdfConstraints", { limit: formatBytes(MAX_PDF_BYTES) })}
                    </span>
                    <span className="max-w-sm text-xs leading-5 text-text-muted">
                      {t("pdfSizeAdvice")}
                    </span>
                  </>
                )}
              </label>
              <input
                ref={pdfInputRef}
                id="book-pdf"
                name="pdf"
                type="file"
                accept=".pdf,application/pdf"
                required
                disabled={busy}
                onChange={(e) => void acceptPdf(e.target.files?.[0])}
                className="sr-only"
              />
            </div>

            {/* AI metadata assistant. Only offered once there is a file to read,
                and never presented as authoritative — the librarian reviews. */}
            {pdfMeta && (
              <div className="rounded-xl border border-admin-accent-line bg-admin-accent-soft p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-admin-accent-text">
                      <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {t("ai.title")}
                    </p>
                    <p className="mt-0.5 text-xs text-text-body">{t("autoFillHint")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoFill}
                    disabled={busy || aiLoading}
                    className={`${BTN_SECONDARY} h-9 shrink-0 px-3 text-[13px]`}
                  >
                    {aiLoading ? (
                      <ButtonBusy label={t("readingPdf")} />
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {t("ai.action")}
                      </>
                    )}
                  </button>
                </div>

                {aiFilled.length > 0 && (
                  <div className="mt-3 border-t border-admin-accent-line pt-3">
                    <p className="text-xs font-semibold text-text-body">{t("ai.draftedTitle")}</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {aiFilled.map((field) => (
                        <li key={field}>
                          <span className="inline-flex items-center gap-1 rounded-md border border-divider bg-bg-surface px-2 py-0.5 text-xs font-medium text-text-body">
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                            {t(`field.${field}` as "field.title")}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-text-muted">{t("ai.reviewNotice")}</p>
                  </div>
                )}

                {aiError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-danger">
                    {aiError}
                  </p>
                )}
              </div>
            )}

            {/* Cover */}
            <div>
              <span className={LABEL_CLASS}>{t("coverImage")}</span>
              <div className="flex items-start gap-4">
                {coverPreview ? (
                  <div className="relative h-32 w-[88px] shrink-0 overflow-hidden rounded-xl border border-divider shadow-sm">
                    <Image
                      src={coverPreview}
                      alt={t("coverPreviewAlt")}
                      fill
                      sizes="88px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex h-32 w-[88px] shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-divider bg-paper px-2 text-center text-xs font-medium text-text-muted">
                    {t("noCover")}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="book-cover"
                    onDragOver={(e) => { e.preventDefault(); if (!busy) setCoverDragging(true); }}
                    onDragLeave={() => setCoverDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setCoverDragging(false);
                      if (busy) return;
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      assignToInput(coverInputRef.current, file);
                      acceptCover(file);
                    }}
                    className={`focus-shell flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors duration-150 ${
                      coverDragging ? "border-brand bg-surface-brand-soft" : "border-divider bg-paper hover:border-border-strong"
                    } ${busy ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <ImagePlus className="h-6 w-6 text-text-muted" aria-hidden="true" />
                    <span className="text-xs font-medium text-text-body">
                      {coverPreview ? t("clickReplaceCover") : t("clickSelectCover")}
                    </span>
                    <span className="text-xs text-text-muted">{t("coverConstraints")}</span>
                  </label>
                  <input
                    ref={coverInputRef}
                    id="book-cover"
                    name="cover"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                    disabled={busy}
                    onChange={(e) => acceptCover(e.target.files?.[0])}
                    className="sr-only"
                  />
                  {coverMeta && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 truncate text-xs text-text-muted">
                        {coverMeta.name} · {formatBytes(coverMeta.size)}
                      </span>
                      <button
                        type="button"
                        onClick={removeCover}
                        disabled={busy}
                        className="focus-field inline-flex items-center gap-1 rounded px-1 text-xs font-semibold text-text-muted transition-colors hover:text-danger-text disabled:opacity-50"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                        {t("removeCover")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </FormSection>

          {/* The gate. Placed between the file and the metadata because both
              feed it: the PDF's fingerprint arrives on pick, the identifiers
              arrive as they are typed, and the answer has to be visible
              throughout rather than appearing at the end of the form. It
              renders nothing until there is enough of a record to check, so it
              is not gated on the file — a librarian who types the title first
              is warned first. */}
          <DuplicateAlert
            snapshot={duplicates}
            override={duplicateOverride}
            onOverrideChange={setDuplicateOverride}
          />

          {/* ── Step 2 · Book information ──────────────────────────────── */}
          <FormSection title={t("bookDetails")} description={t("bookDetailsSub")}>
            <Field label={t("field.title")} required>
              {(p) => (
                <input
                  {...p}
                  ref={titleInputRef}
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("field.titlePlaceholder")}
                />
              )}
            </Field>

            {/* Two columns, and each row is a genuinely related pair —
                identity, then publication, then taxonomy, then physical
                description. License spans the measure because its CC option
                labels are long enough to truncate in half a row. */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* The picker owns its own `<input>`, so `Field` is told which id
                  to label rather than handing one out. */}
              <Field
                label={t("field.author")}
                required
                htmlFor="book-author"
                hint={author.id ? undefined : t("field.authorHint")}
              >
                <AuthorPicker
                  id="book-author"
                  value={author}
                  onChange={setAuthor}
                  disabled={busy}
                  required
                  placeholder={t("field.authorPlaceholder")}
                  ariaLabel={t("field.author")}
                />
              </Field>

              <Field
                label={t("field.isbn")}
                hint={
                  isbnAssessment.status === "invalid"
                    ? undefined
                    : isbnAssessment.status === "valid"
                      ? t("field.isbnValid")
                      : undefined
                }
                /* An unverifiable check digit is worth saying and never worth
                   refusing a book over — a real printed ISBN can be wrong. */
                error={isbnAssessment.status === "invalid" ? t("field.isbnInvalid") : undefined}
              >
                {(p) => (
                  <input
                    {...p}
                    name="isbn"
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                    inputMode="numeric"
                    placeholder={t("optional")}
                  />
                )}
              </Field>

              <Field label={t("field.publisher")}>
                {(p) => (
                  <input
                    {...p}
                    name="publisher"
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                    placeholder={t("optional")}
                  />
                )}
              </Field>

              <Field label={t("field.year")}>
                {(p) => (
                  <input
                    {...p}
                    name="year"
                    type="number"
                    min="1900"
                    max="2099"
                    value={year}
                    onChange={(e) => {
                      setYear(e.target.value);
                      setYearTouched(true);
                    }}
                  />
                )}
              </Field>

              <CompositeField label={t("field.category")} required>
                <SearchableSelect
                  name="category"
                  required
                  options={catList}
                  value={category}
                  onChange={setCategory}
                  disabled={busy}
                  ariaLabel={t("field.category")}
                  chevron="down"
                />
              </CompositeField>

              <CompositeField label={t("field.department")} required>
                <SearchableSelect
                  name="department"
                  required
                  options={deptList}
                  value={department}
                  onChange={setDepartment}
                  disabled={busy}
                  ariaLabel={t("field.department")}
                  chevron="down"
                />
              </CompositeField>

              <Field label={t("field.language")} required>
                {(p) => (
                  <select {...p} ref={languageSelectRef} name="language" defaultValue="Khmer">
                    {LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field
                label={t("field.pages")}
                labelSuffix={
                  isDetectingPages ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted">
                      <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      {t("detectingPages")}
                    </span>
                  ) : detectedPages ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success-text">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      {t("detectedPages", { count: detectedPages })}
                    </span>
                  ) : undefined
                }
              >
                {(p) => <input {...p} ref={pagesInputRef} name="pages" type="number" min="1" defaultValue="1" />}
              </Field>

              <Field label={t("field.license")} className="sm:col-span-2">
                {(p) => (
                  <select {...p} name="license" defaultValue="">
                    {LICENSE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field label={t("field.summary")}>
              {(p) => (
                <textarea
                  {...p}
                  ref={summaryInputRef}
                  name="summary"
                  rows={4}
                  className={`${TEXTAREA_CLASS} resize-none`}
                  placeholder={t("field.summaryPlaceholder")}
                />
              )}
            </Field>

            <CompositeField label={t("field.keywords")} hint={t("field.keywordsHint")}>
              <TagInput
                name="tags"
                placeholder={t("field.keywordsPlaceholder")}
                disabled={busy}
                placement="top"
              />
            </CompositeField>
          </FormSection>

          {/* ── Step 3 · Publication decision ──────────────────────────── */}
          <FormSection title={t("publication")} description={t("publicationSub")}>
            <fieldset>
              <legend className="sr-only">{t("visibility")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <PublishChoice
                  name="publishMode"
                  value="published"
                  checked={publishMode === "published"}
                  onSelect={() => setPublishMode("published")}
                  icon={Globe}
                  title={t("publishNow")}
                  description={t("publishNowHint")}
                />
                <PublishChoice
                  name="publishMode"
                  value="pending_review"
                  checked={publishMode === "pending_review"}
                  onSelect={() => setPublishMode("pending_review")}
                  icon={Send}
                  title={t("submitReview")}
                  description={t("submitReviewHint")}
                />
              </div>
            </fieldset>
          </FormSection>

          {/* ── Step 4 · Reader access ──────────────────────────────────
              Asked here, next to the publication decision, rather than in a
              settings screen: "may readers download this?" is only answerable
              once you know which book it is, and the person attaching the PDF
              is the person who knows the answer.

              This is a LIBRARY POLICY switch, and it is enforced by
              /api/books/[slug]/download — the server refuses the file, it is
              not a hidden button. Reading online is unaffected either way. */}
          <FormSection title={t("access")} description={t("accessSub")}>
            <Switch
              tone="success"
              checked={allowDownload}
              onChange={setAllowDownload}
              label={t("downloadPermission")}
              description={t("downloadPermissionHint")}
              onDescription={
                <ul className="space-y-1">
                  <li>&#10003; {t("canReadOnline")}</li>
                  <li>&#10003; {t("canDownload")}</li>
                </ul>
              }
              offDescription={
                <ul className="space-y-1">
                  <li>&#10003; {t("canReadOnline")}</li>
                  <li>&#10007; {t("cannotDownload")}</li>
                </ul>
              }
            />

            {/* Only asked for when it applies — a restriction message on a
                downloadable book has nowhere to appear. */}
            {!allowDownload && (
              <Field label={t("field.downloadReason")} hint={t("field.downloadReasonHint")}>
                {(p) => (
                  <input
                    {...p}
                    value={downloadReason}
                    onChange={(e) => setDownloadReason(e.target.value)}
                    maxLength={200}
                    placeholder={t("field.downloadReasonPlaceholder")}
                  />
                )}
              </Field>
            )}
          </FormSection>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm text-danger-text">{error}</p>
            </div>
          )}
        </div>

        {/* ── Context aside ───────────────────────────────────────────── */}
        <aside className="w-full min-w-0 space-y-4 xl:sticky xl:top-6">
          <PreflightPanel report={preflight} />

          <div className="overflow-hidden rounded-2xl border border-divider bg-bg-surface">
            <div className="border-b border-divider bg-paper px-5 py-3.5">
              <h3 className="text-sm font-semibold text-text-heading">{t("recentUploads")}</h3>
              <p className="mt-0.5 text-xs text-text-muted">{t("recentUploadsSub")}</p>
            </div>

            {recentBooks.length > 0 ? (
              <ul className="divide-y divide-divider">
                {(recentBooks as RecentBook[]).map((book) => (
                  <li key={book.id} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-brand-soft"
                      aria-hidden="true"
                    >
                      <Icon name="pdf" className="text-sm text-brand" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-heading" title={book.title}>
                        {book.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-text-muted">
                        {book.authors?.name ?? t("noAuthor")}
                        {book.book_files?.[0]?.file_size_kb
                          ? ` · ${(book.book_files[0].file_size_kb / 1024).toFixed(1)} MB`
                          : ""}
                      </p>
                      <Link
                        href={`/admin/edit/${book.id}`}
                        className="focus-field mt-1 inline-block rounded text-xs font-semibold text-brand transition-colors hover:text-brand-hover"
                      >
                        {t("editRecent")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-text-muted">{t("noBooks")}</p>
            )}
          </div>
        </aside>
      </div>

      <StickyActionBar
        status={
          saveBlocked ? (
            <span className="font-semibold text-danger-text">{t("statusBlocked")}</span>
          ) : overrideSatisfies ? (
            <span className="font-semibold text-warning-text">{t("statusOverride")}</span>
          ) : (
            <span className="text-text-muted">
              {publishMode === "published" ? t("statusWillPublish") : t("statusWillQueue")}
            </span>
          )
        }
      >
        <Link href={EBOOKS_BASE_PATH} className={BTN_SECONDARY}>
          {t("cancel")}
        </Link>
        <button type="submit" disabled={busy || saveBlocked} className={BTN_PRIMARY}>
          {busy ? (
            <ButtonBusy label={busyLabel} />
          ) : (
            <>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {submitLabel}
            </>
          )}
        </button>
      </StickyActionBar>
    </form>
  );
}

type RecentBook = {
  id: string;
  title: string;
  slug: string;
  authors?: { name: string | null } | null;
  book_files?: { file_size_kb: number | null }[] | null;
};

/**
 * One publication choice, as a selectable card rather than a bare radio in a
 * row. The decision changes where the book goes and who sees it, and it was
 * previously two radios sharing a line with a parenthetical — the least
 * prominent control on a form whose most consequential choice it is.
 * The radio itself stays a real `<input type="radio">`, so the group keeps
 * native keyboard semantics.
 */
function PublishChoice({
  name,
  value,
  checked,
  onSelect,
  icon: Icon,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  icon: typeof Globe;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`focus-shell flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors duration-150 ${
        checked
          ? "border-brand bg-surface-brand-soft"
          : "border-divider bg-bg-surface hover:border-border-strong hover:bg-paper/60"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ptec-brand)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-text-heading">
          <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-text-muted">{description}</span>
      </span>
    </label>
  );
}
