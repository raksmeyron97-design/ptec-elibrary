"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useState, useRef, Fragment } from "react";
import Image from "next/image";
import { updateBook } from "@/app/(admin)/admin/(protected)/books/actions";
import { replaceBookFile } from "@/app/actions/ebooks";
import {
  makeUid,
  bookFolder,
  bookCoverPath,
  bookPdfPath,
  bookFolderFromCoverUrl,
  LICENSE_OPTIONS,
} from "@/lib/book-utils";
import { formatFileSize } from "@/lib/admin/ebooks-shared";
import Icon from "@/components/ui/core/Icon";
import TagInput from "@/components/ui/core/TagInput";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import BookSeoPanel from "@/components/admin/ebooks/BookSeoPanel";
import BookVerifyPanel from "@/components/admin/ebooks/BookVerifyPanel";
import SeoOverrideFields from "@/components/admin/seo/SeoOverrideFields";
import { SITE_URL } from "@/lib/seo/site";
import { getPdfPageCount, isPdfFile } from "@/lib/pdf-client-utils";
import {
  ImagePlus,
  UploadCloud,
  Save,
  BookOpen,
  AlertCircle,
  Check,
  CheckCircle2,
  X,
  FileText,
  Info,
  Download,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  FormShell,
  FormTabs,
  StickyActionBar,
  ContextPanel,
  ButtonBusy,
  BTN_PRIMARY,
  type FormTab,
} from "@/components/admin/kit/form";

type Initial = {
  id: string;
  slug: string;
  title: string;
  author: string;
  category: string;
  department: string;
  language: string;
  isbn: string;
  publisher: string;
  year: number;
  pages: number;
  summary: string;
  coverUrl: string | null;
  tags: string[];
  license?: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  fileUrl: string | null;
  fileSizeKb: number | null;
  fileFormat: string | null;
  /* Editorial state, for the Review & Verify tab. */
  status: string;
  verifiedAt: string | null;
  verifierName: string | null;
  sourceAttribution: string;
};

type Phase = "idle" | "uploading-pdf" | "uploading-cover" | "saving";

// `focus-field` (app/globals.css) supplies the shared keyboard-weighted
// focus state. It replaces a hardcoded #4f46e5 indigo that was neither a
// PTEC token nor the colour any other form in the panel focused with.
const INPUT_CLASS =
  "focus-field h-11 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm " +
  "disabled:bg-paper disabled:opacity-60 placeholder:text-text-muted/60 text-text-body";

const SELECT_CLASS =
  "focus-field h-11 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm " +
  "disabled:opacity-60 text-text-body";

type TabKey = "files" | "details" | "seo" | "review";

/*
  Three tabs, replacing a single 800px column that stacked five cards.
  The form is not long because it asks a lot — it asks about twenty things — it
  was long because everything was open at once, so the Title field sat below two
  dropzones an editor had usually come to leave alone. Cover joins PDF rather
  than getting a fourth tab of its own: both are uploads, both are optional
  once set, and they are the two things you either replace together or not at
  all.
*/
const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "files", label: "Files", icon: FileText },
  { key: "details", label: "Book Details", icon: BookOpen },
  { key: "seo", label: "SEO & Metadata Quality", icon: Search },
  { key: "review", label: "Review & Verify", icon: ShieldCheck },
];

function FileStatusRow({
  label,
  present,
  required,
  detail,
}: {
  label: string;
  present: boolean;
  required?: boolean;
  detail?: string;
}) {
  return (
    <li className="flex items-center gap-2">
      {present ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <AlertCircle
          className={`h-4 w-4 shrink-0 ${required ? "text-danger" : "text-warning"}`}
          aria-hidden="true"
        />
      )}
      <span className="text-text-body">{label}</span>
      <span className="ml-auto text-xs text-text-muted">
        {detail ?? (present ? "Present" : required ? "Required" : "Optional")}
      </span>
    </li>
  );
}

function activatePickerFromKeyboard(
  e: React.KeyboardEvent<HTMLDivElement>,
  openPicker: () => void,
) {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  openPicker();
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    /*
      Sentence case, not the uppercase micro-caps this form shipped with. The
      admin form standard calls that style legacy for a reason: "TITLE" and
      "AUTHOR" at 11px with widened tracking read as decoration rather than as
      the name of the box under them, and uppercase destroys the word shapes a
      reader scans a form by.
    */
    <span className="mb-1.5 block text-sm font-medium text-text-body">
      {children}
      {required && (
        <span className="ms-0.5 font-normal text-danger" aria-hidden="true">*</span>
      )}
    </span>
  );
}

/**
 * Upload/save progress, three steps.
 *
 * Every colour here used to be an inline hex — a violet step, a cyan step, an
 * emerald step, plus two greys — which made the one element that appears only
 * while the form is busy also the most colourful thing on the page. Progress is
 * not a category: the states are pending, running and done, so there are three
 * tokens rather than five hexes, and `info` carries the running step because
 * that is what the panel's own surface already is.
 */
function PhaseStepper({ phase }: { phase: Phase }) {
  if (phase === "idle") return null;
  const steps = [
    { id: "uploading-pdf", label: "Uploading PDF" },
    { id: "uploading-cover", label: "Uploading cover" },
    { id: "saving", label: "Saving record" },
  ] as const;
  const order = steps.map((s) => s.id as string);
  const ci = order.indexOf(phase);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 flex items-center gap-4 rounded-xl border border-info-line bg-info-soft px-5 py-3.5"
    >
      <div className="flex flex-1 items-center gap-2">
        {steps.map((step, i) => {
          const isDone = i < ci;
          const isActive = i === ci;
          return (
            <Fragment key={step.id}>
              {i > 0 && (
                <div
                  className={`h-px flex-1 rounded-full transition-colors duration-500 ${
                    isDone ? "bg-success" : "bg-info-line"
                  }`}
                />
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                    isDone
                      ? "bg-success text-white"
                      : isActive
                        ? "bg-info text-white"
                        : "bg-paper text-text-muted"
                  }`}
                >
                  {isDone ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    isActive ? "text-info-text" : isDone ? "text-success-text" : "text-text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-info-text">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
        {phase === "uploading-pdf" ? "Uploading PDF…" : phase === "uploading-cover" ? "Uploading cover…" : "Saving…"}
      </div>
    </div>
  );
}

export default function EditForm({
  initial,
  departments,
  categories,
  pageTitle,
  pageDescription,
}: {
  initial: Initial;
  departments: string[];
  categories: string[];
  /*
    The form owns FormShell rather than the route, because the context sidebar
    is a live view of this component's own state.
  */
  pageTitle: string;
  pageDescription: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("files");
  const [phase, setPhase]         = useState<Phase>("idle");
  const [error, setError]         = useState<string | null>(null);
  const [preview, setPreview]     = useState<string | null>(initial.coverUrl ?? null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const fileInputRef              = useRef<HTMLInputElement>(null);
  const coverZoneRef              = useRef<HTMLDivElement>(null);

  const [pdfFile, setPdfFile]     = useState<File | null>(null);
  const pdfInputRef               = useRef<HTMLInputElement>(null);
  const pagesInputRef             = useRef<HTMLInputElement>(null);
  const [detectedPages, setDetectedPages] = useState<number | null>(null);
  const [isDetectingPages, setIsDetectingPages] = useState(false);

  // Live snapshot of the SEO-relevant fields for the quality panel. Read from
  // the form on every input so the panel + Google preview stay in sync without
  // converting every field to a controlled input.
  const [seoState, setSeoState] = useState({
    title: initial.title,
    summary: initial.summary,
    author: initial.author,
    language: initial.language,
    isbn: initial.isbn,
    publisher: initial.publisher,
    year: initial.year || null,
    pages: initial.pages || null,
    tags: initial.tags,
    category: initial.category,
    license: initial.license ?? "",
  });

  function handleFormInput(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const num = (v: FormDataEntryValue | null) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    setSeoState({
      title: String(fd.get("title") ?? ""),
      summary: String(fd.get("summary") ?? ""),
      author: String(fd.get("author") ?? ""),
      language: String(fd.get("language") ?? ""),
      isbn: String(fd.get("isbn") ?? ""),
      publisher: String(fd.get("publisher") ?? ""),
      year: num(fd.get("year")),
      pages: num(fd.get("pages")),
      tags: fd.getAll("tags").map(String).filter(Boolean),
      category: String(fd.get("category") ?? ""),
      license: String(fd.get("license") ?? ""),
    });
  }

  const saving = phase !== "idle";

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) { setError("Cover must be JPEG, PNG, WebP, or AVIF"); return; }
    if (file.size > 5 * 1024 * 1024)  { setError("Cover image must be under 5 MB"); return; }
    setError(null);
    setCoverFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function removeCover() {
    setCoverFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isPdfFile(file)) { setError("File must be a PDF"); return; }
    if (file.size > 100 * 1024 * 1024)   { setError("PDF must be under 100 MB"); return; }
    setError(null);
    setPdfFile(file);

    // Auto-detect page count from the replacement PDF.
    setDetectedPages(null);
    setIsDetectingPages(true);
    try {
      const count = await getPdfPageCount(file);
      if (count && count > 0 && pagesInputRef.current) {
        pagesInputRef.current.value = String(count);
        setDetectedPages(count);
      }
    } catch (err) {
      console.warn("[EditForm] Could not detect pages:", err);
    } finally {
      setIsDetectingPages(false);
    }
  }

  function removePdf() {
    setPdfFile(null);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form     = e.currentTarget;
    const formData = new FormData(form);
    const title    = (formData.get("title") as string)?.trim() || initial.title;

    try {
      if (pdfFile) {
        setPhase("uploading-pdf");
        const folder =
          bookFolderFromCoverUrl(initial.coverUrl) ??
          bookFolder(initial.category, title, makeUid());
        const path = bookPdfPath(folder);

        const pdfPayload = new FormData();
        pdfPayload.set("file", pdfFile);
        pdfPayload.set("key", path);
        pdfPayload.set("target", "private");
        pdfPayload.set("excludeType", "book");
        pdfPayload.set("excludeId", initial.id);

        const uploadRes = await fetch("/api/admin/upload", { method: "POST", body: pdfPayload });
        const data = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(data.error ?? `PDF upload failed (${uploadRes.status})`);

        const replaceResult = await replaceBookFile(initial.id, {
          fileUrl: data.url,
          fileSizeKb: Math.round(pdfFile.size / 1024),
          contentHash: data.contentHash ?? null,
        });
        if (!replaceResult.success) throw new Error(replaceResult.error ?? "Failed to save the new PDF");
        removePdf();
      }

      let newCoverUrl: string | null = null;

      if (coverFile) {
        setPhase("uploading-cover");
        const folder =
          bookFolderFromCoverUrl(initial.coverUrl) ??
          bookFolder(initial.category, title, makeUid());
        const path = bookCoverPath(folder, coverFile.name);

        const coverPayload = new FormData();
        coverPayload.set("file", coverFile);
        coverPayload.set("key", path);
        coverPayload.set("target", "public");

        const uploadRes = await fetch("/api/admin/upload", { method: "POST", body: coverPayload });
        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Cover upload failed (${uploadRes.status})`);
        }
        const { url } = await uploadRes.json();
        newCoverUrl = url;
      }

      if (newCoverUrl)           formData.set("coverUrl", newCoverUrl);
      else if (preview === null) formData.set("coverUrl", "__remove__");

      setPhase("saving");
      await updateBook(initial.id, formData);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  const phaseLabel: Record<Phase, string> = {
    "idle":            "Save changes",
    "uploading-pdf":   "Uploading PDF…",
    "uploading-cover": "Uploading cover…",
    "saving":          "Saving…",
  };

  /*
    The metadata-quality checklist reads a books *row*, so the live form state
    is reshaped into one. Fields the form does not expose (source_attribution)
    come from the loaded record unchanged.
  */
  const qualityRow: Record<string, unknown> = {
    title: seoState.title,
    authors: { name: seoState.author },
    language: seoState.language,
    published_at: seoState.year ? String(seoState.year) : "",
    description: seoState.summary,
    license: seoState.license,
    cover_url: preview ?? "",
    source_attribution: initial.sourceAttribution,
    category_id: seoState.category,
    isbn: seoState.isbn,
    pages: seoState.pages,
    tags: seoState.tags,
  };

  /*
    Verification stamps the *saved* row, so the panel has to know whether the
    form is ahead of it. This form has no general dirty tracking (it saves on
    submit and nothing else depends on it), so the flag is derived from the
    same live snapshot the checklist uses, plus any queued upload.
  */
  const verifyDirty =
    Boolean(pdfFile) ||
    Boolean(coverFile) ||
    seoState.title !== initial.title ||
    seoState.author !== initial.author ||
    seoState.summary !== initial.summary ||
    seoState.language !== initial.language ||
    seoState.isbn !== initial.isbn ||
    seoState.publisher !== initial.publisher ||
    seoState.category !== initial.category ||
    seoState.license !== (initial.license ?? "") ||
    (seoState.year ?? 0) !== (initial.year || 0) ||
    (seoState.pages ?? 0) !== (initial.pages || 0) ||
    seoState.tags.join("\u0000") !== initial.tags.join("\u0000");

  /*
    Context per tab. Files raises "is what a reader downloads actually there";
    Book Details raises "how will this read to someone who has not opened it".
    The SEO tab gets nothing — that tab already *is* the quality panel, and a
    summary of the summary is noise.
  */
  const context =
    activeTab === "seo" || activeTab === "review" ? null : activeTab === "files" ? (
      <ContextPanel title="File status" icon={FileText} hint="What a reader can open, and what the listing shows.">
        <ul className="space-y-1.5 text-[13px]">
          <FileStatusRow
            label="Book PDF"
            present={Boolean(initial.fileUrl) || Boolean(pdfFile)}
            required
            detail={
              pdfFile
                ? `${formatFileSize(Math.round(pdfFile.size / 1024))} · queued`
                : initial.fileSizeKb
                  ? formatFileSize(initial.fileSizeKb)
                  : undefined
            }
          />
          <FileStatusRow label="Cover image" present={preview !== null} detail={coverFile ? "queued" : undefined} />
        </ul>
        <p className="mt-3 border-t border-divider pt-3 text-xs leading-[1.6] text-text-muted">
          Replacing a file takes effect when you save. Nothing is overwritten until then.
        </p>
      </ContextPanel>
    ) : (
      <ContextPanel
        title="Search result preview"
        icon={Search}
        hint="Roughly how this book appears in Google and on shared links."
      >
        <div className="rounded-lg border border-divider bg-bg-surface p-3">
          <p className="truncate text-[11px] text-success-text">
            {SITE_URL}/books/{initial.slug || "…"}
          </p>
          {/* 15px/1.5: Khmer titles are the norm in this collection, and a 13px
              preview of one previews nothing a reader will actually see. */}
          <p className="mt-0.5 line-clamp-2 text-[15px] font-medium leading-[1.5] text-info-text">
            {seoState.title.trim() || "Untitled book"}
          </p>
          <p className="mt-1 line-clamp-3 text-[12.5px] leading-[1.6] text-text-body">
            {seoState.summary.trim() ||
              "No summary yet — search engines will invent a snippet from the page."}
          </p>
        </div>
        <p className="mt-3 text-xs leading-[1.6] text-text-muted">
          Override the title and description on the SEO tab if the automatic
          version is not what you want.
        </p>
      </ContextPanel>
    );

  return (
    <FormShell
      backHref="/admin/books"
      backLabel="Back to e-books"
      title={pageTitle}
      description={pageDescription}
      contentKey={activeTab}
      onSubmit={handleSubmit}
      tabs={
        <FormTabs
          idPrefix="ebook"
          ariaLabel="E-book form sections"
          active={activeTab}
          onChange={setActiveTab}
          tabs={TABS.map<FormTab<TabKey>>((tab) => ({
            key: tab.key,
            label: tab.label,
            icon: tab.icon,
          }))}
        />
      }
      context={context}
      actions={
        <StickyActionBar
          status={
            error ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-danger-text">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {error}
              </span>
            ) : saving ? (
              <span className="text-text-muted">{phaseLabel[phase]}</span>
            ) : (
              <span className="text-text-muted">Changes are saved to the live record.</span>
            )
          }
        >
          {/*
            One primary button, not a full-width gradient bar. Full width made
            Save the widest element on the page and put it at the very bottom of
            a 2,000px column, so it was both the loudest thing in the design and
            the hardest to reach. In the floating bar it is always one click away.
          */}
          <button type="submit" disabled={saving} className={BTN_PRIMARY}>
            {saving ? (
              <ButtonBusy label={phaseLabel[phase]} />
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden="true" />
                Save changes
              </>
            )}
          </button>
        </StickyActionBar>
      }
    >
      {/* Upload progress stays above the panels: it is about the whole save,
          not the section that happens to be open. */}
      <PhaseStepper phase={phase} />


      <div
        id="ebook-panel-files"
        role="tabpanel"
        aria-labelledby="ebook-tab-files"
        tabIndex={-1}
        hidden={activeTab !== "files"}
        className="space-y-5 focus:outline-none"
      >
        {/* ── PDF file card ── */}
        <div id="replace-pdf" className="scroll-mt-24 overflow-hidden rounded-xl border border-divider">
          <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-accent-soft text-admin-accent" aria-hidden="true">
              <FileText className="h-[18px] w-[18px]" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-text-heading">PDF File</h2>
              <p className="text-xs text-text-muted">PDF only · max 100 MB · recommended under 25 MB</p>
            </div>
            {!pdfFile && (
              <span
                className={
                  initial.fileUrl
                    ? "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold border-success-line bg-success-soft text-success-text"
                    : "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold border-danger-line bg-danger-soft text-danger-text"
                }
              >
                {initial.fileUrl ? "PDF ready" : "Missing PDF"}
              </span>
            )}
            {pdfFile && (
              <span
                className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold border-warning-line bg-warning-soft text-warning-text"
              >
                New PDF selected
              </span>
            )}
          </div>

          <div className="p-6 space-y-3">
            {initial.fileUrl && !pdfFile && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-divider bg-paper px-4 py-3">
                <div className="flex min-w-0 items-center gap-2 text-sm text-text-body">
                  <FileText className="h-4 w-4 shrink-0 text-text-muted" />
                  <span className="truncate">Current file · {(initial.fileFormat ?? "pdf").toUpperCase()} · {formatFileSize(initial.fileSizeKb)}</span>
                </div>
                <a
                  href={initial.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                >
                  <Download className="h-3.5 w-3.5" /> Open
                </a>
              </div>
            )}

            <div
              role="button"
              tabIndex={saving ? -1 : 0}
              aria-label={pdfFile ? "Replace PDF file" : initial.fileUrl ? "Replace PDF file" : "Upload PDF file"}
              className="relative flex h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-divider bg-paper px-4 text-center transition-all hover:border-brand hover:bg-bg-surface cursor-pointer"
              onClick={() => !saving && pdfInputRef.current?.click()}
              onKeyDown={(e) => activatePickerFromKeyboard(e, () => !saving && pdfInputRef.current?.click())}
            >
              <UploadCloud className="h-5 w-5 text-text-muted" />
              <p className="text-xs text-text-muted leading-tight">
                {pdfFile ? `Selected: ${pdfFile.name}` : initial.fileUrl ? "Click to replace PDF" : "Click to upload PDF"}
              </p>
              <p className="max-w-sm text-[11px] leading-4 text-text-muted">
                Compress scanned PDFs before uploading so the online reader stays fast.
              </p>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                aria-label="PDF file"
                disabled={saving}
                onChange={handlePdfChange}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>

            {pdfFile && (
              <button
                type="button"
                onClick={removePdf}
                disabled={saving}
                className="focus-field rounded text-xs font-semibold text-text-muted hover:text-danger disabled:opacity-50"
              >
                Cancel PDF replacement
              </button>
            )}
          </div>
        </div>

        {/* ── Cover image card ── */}
        <div id="cover" className="scroll-mt-24 overflow-hidden rounded-xl border border-divider">
          <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-accent-soft text-admin-accent" aria-hidden="true">
              <ImagePlus className="h-[18px] w-[18px]" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-text-heading">Cover Image</h2>
              <p className="text-xs text-text-muted">JPEG, PNG, WebP · max 5 MB</p>
            </div>
            {preview && !coverFile && (
              <span
                className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold border-success-line bg-success-soft text-success-text"
              >
                Current cover
              </span>
            )}
            {coverFile && (
              <span
                className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold border-warning-line bg-warning-soft text-warning-text"
              >
                New cover selected
              </span>
            )}
          </div>

          <div className="p-6">
            <div className="flex items-start gap-4">
              {/* Preview */}
              {preview ? (
                <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-xl border border-divider shadow-md">
                  <Image
                    src={preview}
                    alt="Cover preview"
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={removeCover}
                    disabled={saving}
                    title="Remove cover"
                    aria-label="Remove cover"
                    className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-36 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-divider bg-paper text-[11px] font-medium text-text-muted">
                  No cover
                </div>
              )}

              {/* Dropzone */}
              <div
                ref={coverZoneRef}
                role="button"
                tabIndex={saving ? -1 : 0}
                aria-label={preview ? "Replace cover image" : "Upload cover image"}
                className="relative flex h-36 flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-divider bg-paper px-4 text-center transition-all hover:border-brand hover:bg-bg-surface cursor-pointer"
                onClick={() => !saving && fileInputRef.current?.click()}
                onKeyDown={(e) => activatePickerFromKeyboard(e, () => !saving && fileInputRef.current?.click())}
              >
                <ImagePlus className="h-6 w-6 text-text-muted" />
                <p className="text-xs text-text-muted leading-tight">
                  {preview
                    ? coverFile
                      ? `Selected: ${coverFile.name}`
                      : "Click to replace cover"
                    : "Click to select cover image"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label="Cover image"
                  disabled={saving}
                  onChange={handleCoverChange}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        id="ebook-panel-details"
        role="tabpanel"
        aria-labelledby="ebook-tab-details"
        tabIndex={-1}
        hidden={activeTab !== "details"}
        className="space-y-5 focus:outline-none"
      >
        {/* ── Book details card ── */}
        <div className="overflow-hidden rounded-xl border border-divider">
          <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-accent-soft text-admin-accent" aria-hidden="true">
              <BookOpen className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-text-heading">Book Details</h2>
              <p className="text-xs text-text-muted">Title, author, category, and more</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Title — full width */}
            <label className="block">
              <FieldLabel required>Title</FieldLabel>
              <input
                name="title"
                required
                defaultValue={initial.title}
                placeholder="Book title"
                disabled={saving}
                className={INPUT_CLASS}
              />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Author */}
              <label>
                <FieldLabel required>Author</FieldLabel>
                <input
                  name="author"
                  required
                  defaultValue={initial.author}
                  placeholder="Author or institution"
                  disabled={saving}
                  className={INPUT_CLASS}
                />
              </label>

              {/* Language */}
              <label>
                <FieldLabel required>Language</FieldLabel>
                <input
                  name="language"
                  required
                  defaultValue={initial.language}
                  disabled={saving}
                  className={INPUT_CLASS}
                />
              </label>

              {/* ISBN */}
              <label>
                <FieldLabel>ISBN</FieldLabel>
                <input
                  name="isbn"
                  defaultValue={initial.isbn}
                  placeholder="Optional"
                  disabled={saving}
                  className={INPUT_CLASS}
                />
              </label>

              {/* Publisher */}
              <label>
                <FieldLabel>Publisher</FieldLabel>
                <input
                  name="publisher"
                  defaultValue={initial.publisher}
                  placeholder="Optional"
                  disabled={saving}
                  className={INPUT_CLASS}
                />
              </label>

              {/* License */}
              <label>
                <FieldLabel>License</FieldLabel>
                <select name="license" disabled={saving} defaultValue={initial.license ?? ""} className={SELECT_CLASS}>
                  {LICENSE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              {/* Category */}
              <div>
                <FieldLabel required>Category</FieldLabel>
                <SearchableSelect
                  name="category"
                  required
                  options={categories}
                  defaultValue={initial.category}
                  disabled={saving}
                />
              </div>

              {/* Department */}
              <div>
                <FieldLabel required>Department</FieldLabel>
                <SearchableSelect
                  name="department"
                  required
                  options={departments}
                  defaultValue={initial.department}
                  disabled={saving}
                />
              </div>

              {/* Year */}
              <label>
                <FieldLabel>Year</FieldLabel>
                <input
                  name="year"
                  type="number"
                  min="1900"
                  max="2099"
                  defaultValue={initial.year}
                  disabled={saving}
                  className={INPUT_CLASS}
                />
              </label>

              {/* Pages */}
              <label>
                <div className="flex items-center justify-between">
                  <FieldLabel>Pages</FieldLabel>
                  {isDetectingPages && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-brand animate-pulse">
                      <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-brand border-t-transparent" />
                      Detecting pages…
                    </span>
                  )}
                  {detectedPages && !isDetectingPages && (
                    <span className="text-[11px] font-medium text-success-text">
                      ✓ Detected {detectedPages} pages
                    </span>
                  )}
                </div>
                <input
                  ref={pagesInputRef}
                  name="pages"
                  type="number"
                  min="1"
                  defaultValue={initial.pages}
                  disabled={saving}
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            {/* Summary */}
            <label className="block">
              <FieldLabel required>Summary</FieldLabel>
              <textarea
                name="summary"
                required
                rows={4}
                defaultValue={initial.summary}
                disabled={saving}
                className="focus-field w-full resize-none rounded-xl border border-divider bg-bg-surface p-4 text-sm disabled:bg-paper disabled:opacity-60 placeholder:text-text-muted/60 text-text-body"
              />
            </label>

            {/* Tags */}
            <div>
              <FieldLabel>Keywords / Tags (ពាក្យគន្លឺះ)</FieldLabel>
              <TagInput name="tags" defaultTags={initial.tags} disabled={saving} placement="top" />
            </div>
          </div>
        </div>
      </div>
      <div
        id="ebook-panel-seo"
        role="tabpanel"
        aria-labelledby="ebook-tab-seo"
        tabIndex={-1}
        hidden={activeTab !== "seo"}
        className="space-y-5 focus:outline-none"
      >
        {/* ── SEO & metadata quality ── */}
        <BookSeoPanel
          slug={initial.slug}
          fields={{ ...seoState, coverPresent: preview !== null }}
        />

        {/* ── SEO overrides (optional; blank = auto-generate) ── */}
        <SeoOverrideFields
          routePrefix="/books"
          slug={initial.slug}
          siteUrl={SITE_URL}
          defaultSeoTitle={initial.seoTitle}
          defaultSeoDescription={initial.seoDescription}
          defaultOgImage={initial.ogImage}
          fallbackTitle={seoState.title}
          fallbackDescription={seoState.summary}
          fallbackImage={preview}
          disabled={saving}
        />
      </div>
      <div
        id="ebook-panel-review"
        role="tabpanel"
        aria-labelledby="ebook-tab-review"
        tabIndex={-1}
        hidden={activeTab !== "review"}
        className="space-y-5 focus:outline-none"
      >
        <BookVerifyPanel
          bookId={initial.id}
          row={qualityRow}
          status={initial.status}
          verifiedAt={initial.verifiedAt}
          verifierName={initial.verifierName}
          dirty={verifyDirty}
          onNavigate={setActiveTab}
        />
      </div>
    </FormShell>
  );
}
