"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPublication,
  updatePublication,
  type PublicationData,
  type PublicationFileInput,
} from "@/app/actions/publications";
import type { Publication, PublicationFile } from "@/lib/publications";
import {
  UploadCloud,
  Loader2,
  FileText,
  AlignLeft,
  BookOpen,
  Paperclip,
  Users,
  AlertCircle,
  ListChecks,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import PdfDropzone from "../../theses/_components/PdfDropzone";
import CoverDropzone from "../../theses/_components/CoverDropzone";
import { INPUT_CLASS, LABEL_CLASS } from "../../theses/_components/form-styles";
import TagInput from "@/components/ui/core/TagInput";
import { slugify, makeUid } from "@/lib/book-utils";
import AuthorshipEditor, { type AuthorshipRow } from "./AuthorshipEditor";

type TabKey = "basic" | "authors" | "abstract" | "details" | "references" | "files";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "basic",      label: "Basic Info", icon: FileText },
  { key: "authors",    label: "Authors",    icon: Users },
  { key: "abstract",   label: "Abstract",   icon: AlignLeft },
  { key: "details",    label: "Details",    icon: ListChecks },
  { key: "references", label: "References", icon: BookOpen },
  { key: "files",      label: "Files",      icon: Paperclip },
];

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

export default function PublicationForm({ initial }: { initial?: Publication }) {
  const router = useRouter();
  const isEdit = !!initial;
  const formRef = useRef<HTMLFormElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sectionDone, setSectionDone] = useState<Record<TabKey, boolean>>({
    basic: false,
    authors: false,
    abstract: false,
    details: false,
    references: false,
    files: false,
  });

  // ── Basic info ──
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);

  // ── Authors ──
  const [authorRows, setAuthorRows] = useState<AuthorshipRow[]>(
    initial?.authorships?.map((a) => ({
      author: a.author,
      is_corresponding: a.is_corresponding,
      affiliation_ids: a.affiliation_ids,
    })) ?? [],
  );

  // ── Files ──
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [existingSiFiles, setExistingSiFiles] = useState<PublicationFile[]>(initial?.files ?? []);
  const [newSiFiles, setNewSiFiles] = useState<NewSiFile[]>([]);

  const handleCoverChange = (file: File | null) => {
    setCoverRemoved(false);
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    } else {
      setCoverFile(null);
      setCoverPreview(null);
    }
  };

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const addSiFile = (file: File | null) => {
    if (!file) return;
    setNewSiFiles((prev) => [...prev, { label: file.name.replace(/\.[^.]+$/, ""), file }]);
  };

  // ── Section completeness (drives tab dots + footer progress) ────────
  const recomputeProgress = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const has = (name: string) => !!(fd.get(name) as string | null)?.trim();
    setSectionDone({
      basic: !!title.trim() && has("journal_name"),
      authors: authorRows.length > 0,
      abstract: has("abstract") && has("keywords"),
      details:
        has("publisher") || has("isbn") || has("subjects") ||
        has("table_of_contents") || has("learning_outcomes") || has("faqs"),
      references: has("references"),
      files: !!pdfFile || !!initial?.pdf_url,
    });
  }, [title, authorRows, pdfFile, initial?.pdf_url]);

  useEffect(() => {
    recomputeProgress();
  }, [recomputeProgress]);

  const doneCount = Object.values(sectionDone).filter(Boolean).length;
  const progressPct = Math.round((doneCount / TABS.length) * 100);

  // ── Cmd/Ctrl+S saves from anywhere in the form ───────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!loading) formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading]);

  // ── Tab keyboard nav (left/right arrows while a tab is focused) ─────
  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + dir + TABS.length) % TABS.length];
    setActiveTab(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  }

  const fail = (msg: string, tab: TabKey) => {
    setError(msg);
    setActiveTab(tab);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);

    if (!title.trim()) return fail("Please enter the article title.", "basic");
    const finalSlug = slugify(slug || title);
    if (!finalSlug) return fail("Please provide a valid slug.", "basic");
    if (!isEdit && !pdfFile) return fail("Please upload the article PDF.", "files");

    setLoading(true);

    try {
      const uid = makeUid();
      const folder = `publications/${finalSlug}-${uid}`;

      let pdfUrl = initial?.pdf_url ?? null;
      if (pdfFile) {
        pdfUrl = await uploadViaAdminApi(pdfFile, `${folder}/article.pdf`);
      }

      let coverUrl = coverRemoved ? null : initial?.cover_url ?? null;
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

      const keywords = (formData.get("keywords") as string ?? "")
        .split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20);

      const references = (formData.get("references") as string ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text, index) => ({ index: index + 1, text }));

      const subjects = (formData.get("subjects") as string ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);

      const learning_outcomes = (formData.get("learning_outcomes") as string ?? "")
        .split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);

      // "Chapter title :: page" per line — page is optional
      const table_of_contents = (formData.get("table_of_contents") as string ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 100)
        .map((line) => {
          const [titlePart, pagePart] = line.split("::").map((s) => s.trim());
          return { title: titlePart, page: pagePart || null };
        })
        .filter((e) => e.title);

      const faqs = parseFaqs((formData.get("faqs") as string) ?? "");

      const data: PublicationData = {
        slug: finalSlug,
        title: title.trim(),
        title_km: (formData.get("title_km") as string)?.trim() || null,
        article_type: (formData.get("article_type") as string) || "article",
        journal_name: (formData.get("journal_name") as string)?.trim() || null,
        volume: (formData.get("volume") as string)?.trim() || null,
        issue_no: (formData.get("issue_no") as string)?.trim() || null,
        page_start: (formData.get("page_start") as string)?.trim() || null,
        page_end: (formData.get("page_end") as string)?.trim() || null,
        article_no: (formData.get("article_no") as string)?.trim() || null,
        doi: (formData.get("doi") as string)?.trim() || null,
        publication_date: (formData.get("publication_date") as string) || null,
        abstract: (formData.get("abstract") as string)?.trim() || null,
        abstract_km: (formData.get("abstract_km") as string)?.trim() || null,
        keywords,
        publisher: (formData.get("publisher") as string)?.trim() || null,
        isbn: (formData.get("isbn") as string)?.trim() || null,
        subjects,
        table_of_contents,
        learning_outcomes,
        faqs,
        license: (formData.get("license") as string)?.trim() || null,
        copyright: (formData.get("copyright") as string)?.trim() || null,
        language: (formData.get("language") as string) || "en",
        cover_url: coverUrl,
        pdf_url: pdfUrl,
        references,
        is_published: initial?.is_published ?? false,
      };

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

      const result = isEdit
        ? await updatePublication(initial.id, data, authorships, files)
        : await createPublication(data, authorships, files);

      if (!result.success) {
        throw new Error(result.error);
      }

      router.push("/admin/publications");
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save publication. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={recomputeProgress}
      className="rounded-2xl border border-divider bg-bg-surface shadow-sm overflow-hidden flex flex-col"
    >
      {error && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1">
        {/* ══ TAB BAR ═══════════════════════════════════════════════════ */}
        <div
          role="tablist"
          aria-label="Publication form sections"
          className="flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r border-divider p-3 md:w-56 md:shrink-0 bg-paper/30"
        >
          {TABS.map((t, i) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                id={`tab-${t.key}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(t.key)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all cursor-pointer text-left ${
                  isActive
                    ? "bg-brand/10 text-brand shadow-sm"
                    : "text-text-muted hover:bg-paper hover:text-text-heading"
                }`}
              >
                <t.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand" : "text-text-muted"}`} />
                <span className="flex-1 whitespace-nowrap">{t.label}</span>
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                    sectionDone[t.key] ? "bg-success" : "bg-divider"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* ══ PANELS — all stay mounted so field values survive tab switches ═══ */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-6 md:p-8 flex-1">
            <div id="panel-basic" role="tabpanel" aria-labelledby="tab-basic" hidden={activeTab !== "basic"} className="space-y-8">
              {/* Identity */}
              <div className="space-y-4">
                <div>
                  <label className={LABEL_CLASS}>Title (EN)</label>
                  <input
                    name="title"
                    required
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="e.g. Digital pedagogy adoption in Cambodian teacher education"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>Title (KH, optional)</label>
                    <input
                      name="title_km"
                      defaultValue={initial?.title_km ?? ""}
                      className={INPUT_CLASS}
                      placeholder="ចំណងជើងជាភាសាខ្មែរ"
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Slug (URL)</label>
                    <input
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
                    <label className={LABEL_CLASS}>Article type</label>
                    <select name="article_type" defaultValue={initial?.article_type ?? "article"} className={INPUT_CLASS}>
                      <option value="article">Article</option>
                      <option value="review">Review</option>
                      <option value="account">Account</option>
                      <option value="editorial">Editorial</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Language</label>
                    <select name="language" defaultValue={initial?.language ?? "en"} className={INPUT_CLASS}>
                      <option value="en">English</option>
                      <option value="km">Khmer</option>
                    </select>
                  </div>
                </div>
              </div>

              <hr className="border-divider" />

              {/* Publication venue */}
              <div>
                <h3 className="text-lg font-semibold text-text-heading mb-4">Journal & Issue</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={LABEL_CLASS}>Journal name (optional)</label>
                    <input
                      name="journal_name"
                      defaultValue={initial?.journal_name ?? ""}
                      className={INPUT_CLASS}
                      placeholder="e.g. PTEC Journal of Education"
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Volume</label>
                    <input name="volume" defaultValue={initial?.volume ?? ""} className={INPUT_CLASS} placeholder="12" />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Issue</label>
                    <input name="issue_no" defaultValue={initial?.issue_no ?? ""} className={INPUT_CLASS} placeholder="3" />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>First page</label>
                    <input name="page_start" defaultValue={initial?.page_start ?? ""} className={INPUT_CLASS} placeholder="101" />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Last page</label>
                    <input name="page_end" defaultValue={initial?.page_end ?? ""} className={INPUT_CLASS} placeholder="118" />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Article number (optional)</label>
                    <input name="article_no" defaultValue={initial?.article_no ?? ""} className={INPUT_CLASS} placeholder="e0123" />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Publication date</label>
                    <input type="date" name="publication_date" defaultValue={initial?.publication_date ?? ""} className={INPUT_CLASS} />
                  </div>
                </div>
              </div>

              <hr className="border-divider" />

              {/* Identifiers & rights */}
              <div>
                <h3 className="text-lg font-semibold text-text-heading mb-4">Identifiers & Rights</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>DOI (optional)</label>
                    <input
                      name="doi"
                      defaultValue={initial?.doi ?? ""}
                      className={INPUT_CLASS}
                      placeholder="10.1234/abcd.2026.001"
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>License (optional)</label>
                    <input
                      name="license"
                      defaultValue={initial?.license ?? ""}
                      className={INPUT_CLASS}
                      placeholder="CC BY 4.0"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL_CLASS}>Copyright (optional)</label>
                    <input
                      name="copyright"
                      defaultValue={initial?.copyright ?? ""}
                      className={INPUT_CLASS}
                      placeholder="© 2026 The Authors"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div id="panel-authors" role="tabpanel" aria-labelledby="tab-authors" hidden={activeTab !== "authors"}>
              <AuthorshipEditor value={authorRows} onChange={setAuthorRows} disabled={loading} />
            </div>

            <div id="panel-abstract" role="tabpanel" aria-labelledby="tab-abstract" hidden={activeTab !== "abstract"} className="space-y-4">
              <div>
                <label className={LABEL_CLASS}>Abstract (EN)</label>
                <textarea
                  name="abstract"
                  rows={8}
                  defaultValue={initial?.abstract ?? ""}
                  className={`${INPUT_CLASS} h-auto py-3 leading-relaxed`}
                  placeholder="Paste or write the article abstract…"
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Abstract (KH, optional)</label>
                <textarea
                  name="abstract_km"
                  rows={6}
                  defaultValue={initial?.abstract_km ?? ""}
                  className={`${INPUT_CLASS} h-auto py-3 leading-relaxed`}
                  placeholder="សេចក្តីសង្ខេបជាភាសាខ្មែរ…"
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Keywords / Tags (ពាក្យគន្លឺះ)</label>
                <TagInput
                  name="keywords"
                  defaultTags={initial?.keywords ?? []}
                  placeholder="e.g. pedagogy, STEM, teacher education…"
                  disabled={loading}
                />
                <p className="mt-1 text-[11px] text-text-muted">ចុច Enter ឬ , ដើម្បីបន្ថែម tag</p>
              </div>
            </div>

            <div id="panel-details" role="tabpanel" aria-labelledby="tab-details" hidden={activeTab !== "details"} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLASS}>Publisher (optional)</label>
                  <input
                    name="publisher"
                    defaultValue={initial?.publisher ?? ""}
                    className={INPUT_CLASS}
                    placeholder="Phnom Penh Teacher Education College"
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>ISBN (optional)</label>
                  <input
                    name="isbn"
                    defaultValue={initial?.isbn ?? ""}
                    className={`${INPUT_CLASS} font-mono text-xs`}
                    placeholder="978-9924-XX-XXX-X"
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Subjects (optional)</label>
                <TagInput
                  name="subjects"
                  defaultTags={initial?.subjects ?? []}
                  placeholder="e.g. Education, Pedagogy, STEM…"
                  disabled={loading}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Broad subject areas shown as chips in the article Overview (max 12).
                </p>
              </div>

              <div>
                <label className={LABEL_CLASS}>Table of contents — one entry per line (optional)</label>
                <textarea
                  name="table_of_contents"
                  rows={8}
                  defaultValue={(initial?.table_of_contents ?? [])
                    .map((e) => (e.page ? `${e.title} :: ${e.page}` : e.title))
                    .join("\n")}
                  className={`${INPUT_CLASS} h-auto py-3 font-mono text-xs leading-relaxed`}
                  placeholder={"Introduction :: 1\nLiterature review :: 4\nMethodology :: 9"}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Format: <code>Section title :: page</code> — the page number is optional.
                </p>
              </div>

              <div>
                <label className={LABEL_CLASS}>Learning outcomes — one per line (optional)</label>
                <textarea
                  name="learning_outcomes"
                  rows={5}
                  defaultValue={(initial?.learning_outcomes ?? []).join("\n")}
                  className={`${INPUT_CLASS} h-auto py-3 leading-relaxed`}
                  placeholder={"Explain the drivers of digital pedagogy adoption\nApply the framework to lesson planning"}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>FAQ (optional)</label>
                <textarea
                  name="faqs"
                  rows={8}
                  defaultValue={(initial?.faqs ?? [])
                    .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
                    .join("\n\n")}
                  className={`${INPUT_CLASS} h-auto py-3 leading-relaxed`}
                  placeholder={"Q: Who is this article for?\nA: Teacher educators and student teachers.\n\nQ: Can I reuse the figures?\nA: Yes, under the CC BY 4.0 license with attribution."}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Start each question with <code>Q:</code> and each answer with <code>A:</code>. Shown as an accordion and emitted as FAQ structured data for search engines.
                </p>
              </div>
            </div>

            <div id="panel-references" role="tabpanel" aria-labelledby="tab-references" hidden={activeTab !== "references"}>
              <label className={LABEL_CLASS}>References — one per line</label>
              <textarea
                name="references"
                rows={14}
                defaultValue={(initial?.references ?? []).map((r) => r.text).join("\n")}
                className={`${INPUT_CLASS} h-auto py-3 font-mono text-xs leading-relaxed`}
                placeholder={"Smith, J. (2024). Teacher training in Southeast Asia. J. Educ. 12, 101–118.\nChan, D. (2023). …"}
              />
              <p className="mt-1 text-[11px] text-text-muted">
                Each line becomes a numbered reference on the article page.
              </p>
            </div>

            <div id="panel-files" role="tabpanel" aria-labelledby="tab-files" hidden={activeTab !== "files"} className="space-y-6">
              <div>
                <label className={LABEL_CLASS}>Article PDF</label>
                <PdfDropzone
                  file={pdfFile}
                  onChange={setPdfFile}
                  existingLabel={isEdit && initial?.pdf_url ? "A PDF is already attached — upload to replace it" : null}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Graphical abstract / cover image (optional)</label>
                <CoverDropzone
                  file={coverFile}
                  previewUrl={coverPreview}
                  existingUrl={initial?.cover_url}
                  removed={coverRemoved}
                  onChange={handleCoverChange}
                  onRemove={() => {
                    setCoverFile(null);
                    setCoverPreview(null);
                    setCoverRemoved(true);
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
                          onChange={(e) =>
                            setExistingSiFiles((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)),
                            )
                          }
                          className="flex-1 bg-transparent text-sm text-text-body outline-none"
                          aria-label="Supporting file label"
                        />
                        <button
                          type="button"
                          onClick={() => setExistingSiFiles((prev) => prev.filter((_, xi) => xi !== i))}
                          className="rounded p-1 text-text-muted hover:text-red-500 transition cursor-pointer"
                          aria-label={`Remove ${f.label}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                    {newSiFiles.map((f, i) => (
                      <li key={`new-${i}`} className="flex items-center gap-3 rounded-lg border border-emerald-300/60 bg-emerald-50/40 px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                        <input
                          value={f.label}
                          onChange={(e) =>
                            setNewSiFiles((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)),
                            )
                          }
                          className="flex-1 bg-transparent text-sm text-text-body outline-none"
                          aria-label="Supporting file label"
                        />
                        <span className="text-[10px] text-text-muted">{f.file.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewSiFiles((prev) => prev.filter((_, xi) => xi !== i))}
                          className="rounded p-1 text-text-muted hover:text-red-500 transition cursor-pointer"
                          aria-label={`Remove ${f.label}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <label className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-xs font-medium text-text-body hover:bg-paper transition-colors cursor-pointer">
                  <Plus className="h-3.5 w-3.5" />
                  Add supporting file
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      addSiFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Footer — sticky so Save is always reachable on long sections */}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 border-t border-divider bg-bg-surface/95 px-6 py-4 backdrop-blur-sm">
            <div className="flex min-w-[160px] items-center gap-3" aria-label={`Completeness ${progressPct}%`}>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-paper">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-medium tabular-nums text-text-muted">
                {doneCount}/{TABS.length} sections
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1 text-[11px] text-text-muted sm:inline-flex">
                <kbd className="rounded border border-divider bg-paper px-1.5 py-0.5 font-medium">⌘S</kbd>
                to save
              </span>
              <button
                type="submit"
                disabled={loading}
                className="btn-brand-gradient inline-flex items-center gap-2 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                ) : (
                  <><UploadCloud className="w-5 h-5" /> {isEdit ? "Save Changes" : "Save as Draft"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
